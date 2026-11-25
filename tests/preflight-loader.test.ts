import { describe, expect, it } from "vitest";
import type { ConceptGraphNode } from "../server/concept-graph.js";
import { loadPreflight } from "../src/today/preflight.js";

const REF = "studyai://document/doc-1/page/1?chunk=0";

function node(id: string, label: string, mastery: number, sourceRef?: string): ConceptGraphNode {
  return {
    id,
    label,
    parentId: null,
    ...(sourceRef ? { sourceRef } : {}),
    lessonId: "lesson-1",
    lessonTitle: "Lesson 1",
    mastery,
    canPractice: false,
  };
}

type Reply = { status?: number; body: unknown };
function stubFetch(routes: Array<[RegExp, Reply | Error]>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = input instanceof Request ? input.url : String(input);
    const route = routes.find(([pattern]) => pattern.test(url));
    if (!route) throw new Error(`Unexpected request: ${url}`);
    const [, reply] = route;
    if (reply instanceof Error) throw reply;
    return new Response(JSON.stringify(reply.body ?? {}), {
      status: reply.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

const graph = (nodes: ConceptGraphNode[]) => ({ title: "Course", nodes, edges: [] });
const hit = (sourceRef: string, excerpt: string) => ({
  documentId: "doc-1", title: "Notes", filename: "notes.txt", unitType: "page",
  unitNumber: 1, chunkIndex: 0, sourceRef, excerpt, score: 0.9,
});
const search = (...hits: ReturnType<typeof hit>[]) => ({ documents: [], results: hits });
const question = {
  presentationId: "presentation-1", questionId: "question-1", conceptId: "c1",
  concept: "Nucleus", prompt: "Where is DNA stored?",
  choices: [{ id: "a", text: "Nucleus" }, { id: "b", text: "Ribosome" }],
  source: { documentId: "doc-1", title: "Notes", page: 1, excerpt: "DNA lives in the nucleus." },
};

describe("loadPreflight", () => {
  it("returns three cited passages and the reviewed question, scoped to the weakest concept", async () => {
    const graphNodes = [node("c3", "Genetics", 0.7, REF), node("c1", "Nucleus", 0.2, REF), node("c2", "Energy", 0.5, REF)];
    let askedUrl = "";
    const fetcher = stubFetch([
      [/\/api\/concepts\/graph\?course=/, { body: graph(graphNodes) }],
      [/q=Nucleus/, { body: search(hit(REF, "DNA lives in the nucleus.")) }],
      [/q=Energy/, { body: search(hit(REF, "Energy is stored in bonds.")) }],
      [/q=Genetics/, { body: search(hit(REF, "Genes encode traits.")) }],
      [/\/api\/study\/ask/, { body: question }],
    ]);
    // Capture the ask scope without changing the stubbed behaviour.
    const wrapped = ((input: RequestInfo | URL) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.includes("/api/study/ask")) askedUrl = url;
      return fetcher(input);
    }) as typeof fetch;

    const result = await loadPreflight("course-1", "lesson-1", wrapped);
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.concepts.map((item) => item.label)).toEqual(["Nucleus", "Energy", "Genetics"]);
    expect(result.concepts.map((item) => item.excerpt)).toEqual([
      "DNA lives in the nucleus.", "Energy is stored in bonds.", "Genes encode traits.",
    ]);
    expect(result.concepts.every((item) => item.sourceRef === REF)).toBe(true);
    expect(result.question?.prompt).toBe("Where is DNA stored?");
    expect(askedUrl).toContain("course=course-1");
    expect(askedUrl).toContain("lesson=lesson-1");
    expect(askedUrl).toContain("concept=c1");
  });

  it("reports no concepts when the graph has no cited weak concepts", async () => {
    const fetcher = stubFetch([
      [/\/api\/concepts\/graph/, { body: graph([node("c1", "Nucleus", 0.2)]) }],
    ]);
    expect(await loadPreflight("course-1", "lesson-1", fetcher)).toEqual({ status: "empty", reason: "no-concepts" });
  });

  it("reports no passages when no search hit carries a parseable sourceRef", async () => {
    const fetcher = stubFetch([
      [/\/api\/concepts\/graph/, { body: graph([node("c1", "Nucleus", 0.2, REF)]) }],
      [/\/api\/document-intelligence\/documents/, { body: search(hit("not-a-source-ref", "DNA lives in the nucleus.")) }],
    ]);
    expect(await loadPreflight("course-1", "lesson-1", fetcher)).toEqual({ status: "empty", reason: "no-passages" });
  });

  it("keeps the passages but reports no question when none is reviewed", async () => {
    const fetcher = stubFetch([
      [/\/api\/concepts\/graph/, { body: graph([node("c1", "Nucleus", 0.2, REF)]) }],
      [/\/api\/document-intelligence\/documents/, { body: search(hit(REF, "DNA lives in the nucleus.")) }],
      [/\/api\/study\/ask/, { body: { status: "no-reviewed-questions", reason: "No reviewed questions for this lesson yet.", nextAction: { kind: "author-question", label: "Create a question from course text" } } }],
    ]);
    const result = await loadPreflight("course-1", "lesson-1", fetcher);
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.concepts).toHaveLength(1);
    expect(result.question).toBeNull();
  });

  it("reports an error when the graph call fails", async () => {
    const fetcher = stubFetch([
      [/\/api\/concepts\/graph/, new Error("Network down")],
    ]);
    const result = await loadPreflight("course-1", "lesson-1", fetcher);
    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    expect(result.message).toContain("Network down");
  });
});
