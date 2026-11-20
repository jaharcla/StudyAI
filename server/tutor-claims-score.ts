export type ClaimExpectation = {
  boardId: string;
  question: string;
  expectedClaims: Array<{ subject: string; value: string; cite?: string }>;
  mustFlagUnreadable?: boolean;
};

export type ClaimAnswer = {
  boardId: string;
  question: string;
  answer: string;
  toolCalls?: string[];
  latencyMs?: number;
};

export type ClaimScore = {
  claimScore: number;
  matched: number;
  total: number;
  missing: string[];
  citationValid: boolean;
  unreadableHonest: boolean;
  toolCalls: number;
  latencyMs: number;
};

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[`*_#>]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s*([{}\\^_=+-])\s*/g, "$1")
    .trim();
}

export function scoreClaimAnswer(expected: ClaimExpectation, answer: ClaimAnswer): ClaimScore {
  const text = normalize(answer.answer);
  const total = expected.expectedClaims.length;
  const missing: string[] = [];
  let matched = 0;
  for (const claim of expected.expectedClaims) {
    if (text.includes(normalize(claim.value))) matched++;
    else missing.push(claim.value);
  }
  const citationValid = expected.expectedClaims.every((claim) => !claim.cite || answer.answer.includes(claim.cite));
  const unreadableHonest = expected.mustFlagUnreadable
    ? /unreadable|cannot read|can't read|not confident|illegible/i.test(answer.answer)
    : true;
  return {
    claimScore: total ? matched / total : 0,
    matched,
    total,
    missing,
    citationValid,
    unreadableHonest,
    toolCalls: answer.toolCalls?.length ?? 0,
    latencyMs: answer.latencyMs ?? 0,
  };
}

export type ClaimArmSummary = {
  questions: number;
  averageClaimScore: number;
  citationValidRate: number;
  unreadableHonestyRate: number;
  averageToolCalls: number;
  p95LatencyMs: number;
};

export function summarizeClaimArm(scores: readonly ClaimScore[]): ClaimArmSummary {
  const count = Math.max(1, scores.length);
  const latencies = scores.map((score) => score.latencyMs).sort((left, right) => left - right);
  const p95 = latencies.length ? latencies[Math.min(latencies.length - 1, Math.ceil(latencies.length * 0.95) - 1)] : 0;
  return {
    questions: scores.length,
    averageClaimScore: Number((scores.reduce((sum, score) => sum + score.claimScore, 0) / count).toFixed(3)),
    citationValidRate: Number((scores.filter((score) => score.citationValid).length / count).toFixed(3)),
    unreadableHonestyRate: Number((scores.filter((score) => score.unreadableHonest).length / count).toFixed(3)),
    averageToolCalls: Number((scores.reduce((sum, score) => sum + score.toolCalls, 0) / count).toFixed(2)),
    p95LatencyMs: p95,
  };
}
