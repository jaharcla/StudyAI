import Database from "better-sqlite3";
import type { Page } from "@playwright/test";
import { produceCanvasAnalysisForPersistedBoard, type CanvasAnalysisRequest } from "../../server/canvas-analysis/producer.js";
import { clearCanvasRecognitionCache, understandCanvas, type UnderstandCanvasArgs } from "../../server/canvas-intelligence/service.js";

export async function useMockGroqCanvasAnalysis(page: Page, courseId: string, lessonId: string) {
  const capture: { crops: Array<{ id: string; sourceIds: string[]; worldBounds: unknown; cropBounds: unknown; pixelWidth: number; pixelHeight: number; pixelToWorld: unknown }>; ocrCalls: number } = { crops: [], ocrCalls: 0 };
  await page.route(/\/api\/canvases\/[^/]+\/analysis\?/, async (route) => {
    const url = new URL(route.request().url());
    const boardId = url.pathname.split("/").at(-2)!;
    const payload = route.request().postDataJSON() as CanvasAnalysisRequest;
    const response = await page.request.get(`/api/canvases/${encodeURIComponent(boardId)}?course=${encodeURIComponent(courseId)}&lesson=${encodeURIComponent(lessonId)}`);
    const row = await response.json() as { id: string; course_id: string; lesson_id: string; revision: number; document: string };
    const database = new Database(":memory:");
    database.exec("CREATE TABLE lessons(id TEXT,course_id TEXT,PRIMARY KEY(course_id,id)); CREATE TABLE canvases(id TEXT PRIMARY KEY,course_id TEXT,lesson_id TEXT,revision INTEGER,document TEXT);");
    database.prepare("INSERT INTO lessons(id,course_id) VALUES(?,?)").run(row.lesson_id, row.course_id);
    database.prepare("INSERT INTO canvases(id,course_id,lesson_id,revision,document) VALUES(?,?,?,?,?)").run(row.id, row.course_id, row.lesson_id, row.revision, row.document);
    for (const region of payload.image?.regions ?? []) capture.crops.push({ id: region.id, sourceIds: region.sourceIds, worldBounds: region.worldBounds, cropBounds: region.cropBounds, pixelWidth: region.pixelWidth, pixelHeight: region.pixelHeight, pixelToWorld: region.pixelToWorld });

    const keys = ["CANVAS_INFERENCE_PROVIDER", "CANVAS_OCR_PROVIDER", "GROQ_API_KEY", "CANVAS_GROQ_MAX_REQUESTS_PER_MINUTE"] as const;
    const previous = new Map(keys.map((key) => [key, process.env[key]]));
    process.env.CANVAS_INFERENCE_PROVIDER = "groq";
    process.env.CANVAS_OCR_PROVIDER = "groq";
    process.env.GROQ_API_KEY = "playwright-mock-key";
    process.env.CANVAS_GROQ_MAX_REQUESTS_PER_MINUTE = "100";
    clearCanvasRecognitionCache();
    const fetcher = (async (_input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      if (Array.isArray(body.messages?.[1]?.content)) {
        capture.ocrCalls++;
        return Response.json({ choices: [{ message: { content: JSON.stringify({ items: [{ text: "F = 5 N", kind: "equation", confidence: 0.99, alternatives: [], sourceIds: ["made-up-stroke"], imageRegion: { x: 999, y: 999, width: 20, height: 10 } }], uncertain: false }) } }] });
      }
      return Response.json({ choices: [{ message: { content: JSON.stringify({ objects: [], relationships: [], observations: [], ambiguities: [], answer: "The handwriting appears to read F = 5 N.", associations: [], uncertainties: [] }) } }] });
    }) as typeof fetch;
    try {
      const analyze = (args: UnderstandCanvasArgs) => understandCanvas({ ...args, fetcher });
      const analysis = await produceCanvasAnalysisForPersistedBoard(database, { boardId: row.id, courseId: row.course_id, lessonId: row.lesson_id }, payload, { analyze });
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ analysis }) });
    } catch (error) {
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: error instanceof Error ? error.message : "Mock analysis failed." }) });
    } finally {
      database.close();
      for (const key of keys) {
        const value = previous.get(key);
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
  return capture;
}

export async function chooseCanvasTool(page: Page, name: string) {
  const opener = page.getByRole("button", { name: "Open canvas tools", exact: true });
  if (await opener.isVisible()) await opener.click();
  await page.getByRole("button", { name, exact: true }).click();
}

export async function drawHandwrittenF5N(page: Page, x: number, y: number) {
  const strokes = [
    [[0, 0], [0, 24]], [[0, 0], [15, 0]], [[0, 12], [12, 12]],
    [[26, 7], [40, 7]], [[26, 17], [40, 17]],
    [[52, 0], [66, 0]], [[52, 0], [52, 11]], [[52, 11], [65, 11], [65, 24], [52, 24]],
    [[79, 24], [79, 0], [96, 24], [96, 0]],
  ];
  for (const stroke of strokes) {
    await page.mouse.move(x + stroke[0][0], y + stroke[0][1]);
    await page.mouse.down();
    for (const point of stroke.slice(1)) await page.mouse.move(x + point[0], y + point[1], { steps: 3 });
    await page.mouse.up();
  }
}

export async function drawForce(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await chooseCanvasTool(page, "Force");
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
}

export async function setForceUnits(page: Page, unitsPerCanvasUnit = 0.05) {
  await page.getByRole("button", { name: "Inspect selected object" }).click();
  await page.getByRole("spinbutton", { name: "Units per canvas unit", exact: true }).fill(String(unitsPerCanvasUnit));
  await page.getByLabel("Units", { exact: true }).fill("N");
  await page.locator(".canvas-object-editor").getByRole("button", { name: "Done" }).click();
}
