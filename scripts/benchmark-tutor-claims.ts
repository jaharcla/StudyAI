import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { scoreClaimAnswer, summarizeClaimArm, type ClaimAnswer, type ClaimExpectation } from "../server/tutor-claims-score.js";

const args = process.argv.slice(2);
const arg = (name: string, fallback: string) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const questionsPath = arg("--questions", "data/canvas-claim-benchmark/questions.json");
const answersAPath = arg("--answers-a", "");
const answersBPath = arg("--answers-b", "");
const outPath = arg("--out", "data/canvas-claim-benchmark/latest.json");
const dryRun = args.includes("--dry-run");

const questions = JSON.parse(readFileSync(questionsPath, "utf8")) as ClaimExpectation[];
if (!Array.isArray(questions) || !questions.length) throw new Error("Questions fixture must be a non-empty array.");
for (const [index, question] of questions.entries()) {
  if (!question.boardId || !question.question || !Array.isArray(question.expectedClaims) || !question.expectedClaims.length) {
    throw new Error(`Question ${index} is missing boardId, question, or expectedClaims.`);
  }
  for (const claim of question.expectedClaims) {
    if (!claim.subject || !claim.value) throw new Error(`Question ${index} has a claim without subject/value.`);
  }
}

const byBoard = new Map<string, number>();
for (const question of questions) byBoard.set(question.boardId, (byBoard.get(question.boardId) ?? 0) + 1);
console.log(`questions: ${questions.length}`);
for (const [boardId, count] of [...byBoard.entries()].sort()) console.log(`  ${boardId}: ${count}`);

if (dryRun) {
  console.log("dry run: fixture is valid; no answers scored.");
  process.exit(0);
}

function loadAnswers(path: string): Map<string, ClaimAnswer> {
  if (!path) throw new Error("Provide --answers-a and --answers-b, or use --dry-run.");
  const answers = JSON.parse(readFileSync(path, "utf8")) as ClaimAnswer[];
  const map = new Map<string, ClaimAnswer>();
  for (const answer of answers) map.set(`${answer.boardId}\u0000${answer.question}`, answer);
  return map;
}

const armA = loadAnswers(answersAPath);
const armB = loadAnswers(answersBPath);
const countToolCalls = (answer: ClaimAnswer) => answer.toolCalls?.filter((name) => name === "read_canvas_ink").length ?? 0;

const results = questions.map((question) => {
  const key = `${question.boardId}\u0000${question.question}`;
  const a = scoreClaimAnswer(question, armA.get(key) ?? { boardId: question.boardId, question: question.question, answer: "" });
  const b = scoreClaimAnswer(question, armB.get(key) ?? { boardId: question.boardId, question: question.question, answer: "" });
  return { boardId: question.boardId, question: question.question, a, b };
});

const summaryA = summarizeClaimArm(results.map((result) => result.a));
const summaryB = summarizeClaimArm(results.map((result) => result.b));
const inkReads = results.reduce((sum, result) => sum + countToolCalls(armB.get(`${result.boardId}\u0000${result.question}`) ?? { boardId: result.boardId, question: result.question, answer: "" }), 0);
const gate = {
  claimScoreNotLower: summaryB.averageClaimScore >= summaryA.averageClaimScore,
  citationsNotLower: summaryB.citationValidRate >= summaryA.citationValidRate,
  honestyNotLower: summaryB.unreadableHonestyRate >= summaryA.unreadableHonestyRate,
  inkReadsBounded: inkReads <= 2 * questions.length,
  latencyBounded: summaryA.p95LatencyMs === 0 || summaryB.p95LatencyMs <= summaryA.p95LatencyMs * 1.2,
};
const passed = Object.values(gate).every(Boolean);

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify({ questions: questions.length, summaryA, summaryB, gate, passed, results }, null, 2));
console.log(`A: ${JSON.stringify(summaryA)}`);
console.log(`B: ${JSON.stringify(summaryB)}`);
console.log(`gate: ${JSON.stringify(gate)} passed=${passed}`);
console.log(`wrote ${outPath}`);
process.exit(passed ? 0 : 1);
