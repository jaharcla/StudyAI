import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import type { ShapeRecord } from "@quickdrawjs/react";
import { fitInkMLCanvas, inkMLProvenance, inkMLToCanvasDocument, parseInkML } from "../src/canvas/dataset-inkml.js";
import { emptyCanvasDocument, type CanvasDocument, type ScientificObject } from "../src/canvas/model.js";
import { saveCanvasDocument } from "../server/canvas-persistence/service.js";

const root = resolve("data/canvas-dataset-benchmark");
const sourceRoot = join(root, "source/mathwriting/test");
const dbPath = process.env.STUDYAI_DB ?? join(root, "studyai.sqlite");
process.env.STUDYAI_DB = dbPath;
const { db } = await import("../server/db.js");
const courseId = "dataset-canvas-benchmark";
const lessonId = "source-reconstruction";
const samples = [
  { id: "003ca9082c7047d3", name: "MathWriting · partial derivative fraction", note: "Nested partial derivative and barred variable" },
  { id: "009d124a50399bba", name: "MathWriting · indexed sum", note: "Summation, indexed variables, and derivative fraction" },
  { id: "010d0f9e951a7a44", name: "MathWriting · nested logistic expression", note: "Nested exponent, fraction, and multi-level indices" },
  { id: "02c9daf282f5a1e3", name: "MathWriting · bra-ket sum", note: "Set notation, summation, and paired ket symbols" },
  { id: "01e6c79f4d27bc54", name: "MathWriting · exponential decay", note: "Subscripts and nested exponent" },
  { id: "001083e26028da36", name: "MathWriting · gradient vector", note: "Nabla, indexed partials, and vector tuple" },
];

mkdirSync(join(root, "provenance"), { recursive: true });
mkdirSync(join(root, "scoring"), { recursive: true });
db.prepare("INSERT OR IGNORE INTO courses(id,title,code,color) VALUES(?,?,?,?)").run(courseId, "Dataset Canvas Benchmark", "DATASET", "#657ee8");
db.prepare("INSERT OR IGNORE INTO lessons(id,course_id,title) VALUES(?,?,?)").run(lessonId, courseId, "Source reconstructions");

const sampleManifest = [];
const mathTruth = [];
for (const sample of samples) {
  const sourceFile = `${sample.id}.inkml`;
  const sourcePath = join(sourceRoot, sourceFile);
  const ink = parseInkML(readFileSync(sourcePath, "utf8"));
  const transform = fitInkMLCanvas(ink);
  const document = inkMLToCanvasDocument(ink, sample.id, transform);
  persist(`mathwriting-${sample.id}`, sample.name, document);
  const provenance = inkMLProvenance(ink, `source/mathwriting/test/${sourceFile}`, transform);
  writeFileSync(join(root, "provenance", `mathwriting-${sample.id}.json`), JSON.stringify(provenance, null, 2));
  sampleManifest.push({ dataset: "MathWriting", split: ink.annotations.splitTagOriginal ?? "test", sampleId: sample.id, boardId: `mathwriting-${sample.id}`, note: sample.note, traces: ink.traces.length, points: provenance.pointCount, coordinateTransform: transform });
  mathTruth.push({ boardId: `mathwriting-${sample.id}`, sampleId: sample.id, normalizedLabel: ink.annotations.normalizedLabel ?? ink.annotations.label ?? null, scoring: "Compare canvas OCR output to this label after the declared MathWriting normalization; keep label outside canvas and Tutor context." });
}

const physalignDocument = buildPhysAlignSpringGraph();
persist("physalign-spring-graph", "PhysAlign · spring and force-length graph", physalignDocument);
const physalignSource = {
  dataset: "PhysAlign",
  split: "development",
  task: "T03-image",
  probeId: "PEX-cdbf0c780b9b3a326fcadf223aaf3cee474d85b5693d75e6dab4563d9a5c29b1",
  logicalProbeId: "PAE-c36ba1a2b37718a62cfbbce8a50e6974995d0caf8a1677faa2b07fda2d817f29",
  sourceImage: { imageId: "img_0", sha256: "fb437ff4e79c7c8f240f026c96e368cfb90161bd41264f7d5e5b354bb8a2fd54", width: 711, height: 258 },
  sourcePrompt: {
    statement: "As shown in Figure A, one end of a light spring is connected to a wall at point O. When the horizontal external force F (not shown) acting on the right end A changes, the spring length changes continuously. Taking the leftward direction as positive, the relationship between the external force F and the spring length is shown in Figure B.",
    question: "Which of the following statements is correct? ()",
    options: ["The natural length of the spring is 5 cm.", "The spring constant is 400 N/m.", "When l = 10 cm, the elastic force of the spring on the wall is directed to the right.", "The force of the wall on the spring and the horizontal external force F are a pair of interaction forces."],
    localQuestion: "Transcribe exactly the visible text at R3. Which candidate entity directly owns the quantity indicated at R3?",
  },
  anchor: { id: "R3", kind: "visual", bbox1000: [558, 27, 639, 151] },
  candidates: [
    { alias: "E1", boxes1000: [[63, 531, 79, 601], [15, 504, 53, 616]] },
    { alias: "E2", boxes1000: [[56, 287, 79, 818]] },
    { alias: "E3", boxes1000: [[70, 488, 316, 624]] },
    { alias: "E4", boxes1000: [[558, 27, 639, 151], [526, 47, 546, 876]] },
    { alias: "E5", boxes1000: [[304, 523, 321, 593], [333, 527, 367, 632]] },
  ],
  reconstruction: {
    fidelity: "image-only approximation; not original digital ink",
    components: ["freehand spring, wall, endpoint labels and graph-axis target label", "native graph curve with axis labels removed from its semantic fields", "editable text for source problem text and non-target tick labels"],
    approximations: ["source line digitized from visible endpoints (5, 40) and (25, -40)", "intermediate graph points linearly interpolated", "candidate alias boxes are stored as provenance and are not drawn as overlays"],
    omitted: ["external-force arrow, which the source says is not shown", "source raster image"],
  },
};
writeFileSync(join(root, "provenance", "physalign-spring-graph.json"), JSON.stringify(physalignSource, null, 2));
const manifest = {
  version: 1,
  database: "studyai.sqlite",
  scope: { courseId, lessonId },
  datasets: sampleManifest,
  reconstructions: [{ dataset: "PhysAlign", split: "development", task: "T03-image", probeId: physalignSource.probeId, logicalProbeId: physalignSource.logicalProbeId, boardId: "physalign-spring-graph", sourceImageSha256: physalignSource.sourceImage.sha256, note: "Image-only source rebuilt as editable QuickDraw ink plus an unlabeled native graph. No force arrow is added because the source says the external force is not shown." }],
};
writeFileSync(join(root, "manifest.json"), JSON.stringify(manifest, null, 2));
writeFileSync(join(root, "scoring", "ground-truth.json"), JSON.stringify({ mathWriting: mathTruth, physAlign: { boardId: "physalign-spring-graph", expectedReading: "F/N", owner: null, ownerStatus: "Not established from the released public input variant; requires independent human adjudication." } }, null, 2));
db.close();
process.stdout.write(`Prepared ${sampleManifest.length + 1} editable dataset canvases in ${dbPath}\n`);

function persist(id: string, name: string, document: CanvasDocument) {
  const existing = db.prepare("SELECT revision FROM canvases WHERE id=?").get(id) as { revision: number } | undefined;
  const result = saveCanvasDocument(db, { id, courseId, lessonId, name, expectedRevision: existing?.revision ?? 0, document });
  if (result.status !== 200) throw new Error(`${id}: ${result.body.error ?? "Canvas save failed."}`);
}

function draw(store: Record<string, ShapeRecord>, id: string, z: number, points: Array<[number, number]>, size = "s") {
  store[id] = { id, typeName: "shape", type: "draw", x: 0, y: 0, rot: 0, z, props: { pts: points.flatMap(([x, y]) => [x, y, 0.5]), color: "black", size, dash: "draw", done: true } };
}

function text(store: Record<string, ShapeRecord>, id: string, z: number, x: number, y: number, value: string, size = "s") {
  store[id] = { id, typeName: "shape", type: "text", x, y, rot: 0, z, props: { text: value, color: "black", size, font: "sans", autosize: true, scale: 1 } };
}

function buildPhysAlignSpringGraph(): CanvasDocument {
  const document = emptyCanvasDocument();
  const store = document.snapshot.document.store as Record<string, ShapeRecord>;
  let z = 1;
  text(store, "physalign-statement", z++, 70, 35, "As shown in Figure A, one end of a light spring is connected to a wall at point O.\nWhen the horizontal external force F (not shown) acting on the right end A changes,\nthe spring length changes continuously. Taking the leftward direction as positive,\nthe relationship between the external force F and the spring length is shown in Figure B.", "s");
  text(store, "physalign-question", z++, 70, 120, "Which of the following statements is correct?\nA. The natural length of the spring is 5 cm.\nB. The spring constant is 400 N/m.\nC. When l = 10 cm, the elastic force of the spring on the wall is directed to the right.\nD. The force of the wall on the spring and the horizontal external force F are a pair of interaction forces.", "s");
  text(store, "physalign-local-probe", z++, 70, 222, "Transcribe exactly the visible text at R3. Which candidate entity directly owns the quantity indicated at R3?", "s");

  draw(store, "physalign-wall", z++, [[240, 378], [240, 560]]);
  for (let y = 386; y <= 548; y += 18) draw(store, `physalign-wall-hatch-${y}`, z++, [[205, y + 10], [240, y - 3]]);
  draw(store, "physalign-spring", z++, [[240, 470], [255, 450], [270, 490], [285, 450], [300, 490], [315, 450], [330, 490], [345, 450], [360, 490], [375, 450], [390, 490], [405, 450], [420, 490], [435, 450], [450, 490], [465, 450], [480, 490], [495, 450], [510, 490], [525, 470]]);
  draw(store, "physalign-spring-end", z++, [[525, 470], [558, 470], [558, 458], [580, 470], [558, 482], [558, 470]]);
  draw(store, "physalign-O-label", z++, [[215, 442], [215, 427], [225, 422], [235, 427], [235, 442], [225, 447], [215, 442]]);
  draw(store, "physalign-A-label", z++, [[570, 452], [578, 430], [586, 452], [574, 445], [582, 445]]);
  text(store, "physalign-figure-a", z++, 330, 412, "Figure A", "s");
  text(store, "physalign-figure-b", z++, 865, 690, "Figure B", "s");

  const graphPoints = Array.from({ length: 81 }, (_, index): [number, number] => {
    const x = 5 + index / 80 * 20;
    return [Number(x.toFixed(3)), Number((40 - (x - 5) * 4).toFixed(3))];
  });
  const graph: ScientificObject = { id: "physalign-native-graph", kind: "graph", x: 875, y: 545, width: 360, height: 260, expression: "", xRange: [0, 25], points: graphPoints, xLabel: "", yLabel: "" };
  document.objects.push(graph);
  draw(store, "physalign-y-label-F", z++, [[742, 438], [742, 418], [758, 418], [742, 428], [754, 428]]);
  draw(store, "physalign-y-label-slash", z++, [[764, 438], [774, 418]]);
  draw(store, "physalign-y-label-N", z++, [[780, 438], [780, 418], [797, 438], [797, 418]]);
  drawDashed(store, "physalign-guide-x5", z, [792, 440], [792, 542], 8); z += 7;
  drawDashed(store, "physalign-guide-x25", z, [1040, 542], [1040, 645], 8); z += 7;
  drawDashed(store, "physalign-guide-y40", z, [730, 440], [792, 440], 8); z += 5;
  drawDashed(store, "physalign-guide-yminus40", z, [730, 645], [1040, 645], 8); z += 22;
  for (const [index, [label, x, y]] of ([ ["40", 700, 428], ["0", 706, 535], ["-40", 674, 637], ["5", 786, 548], ["10", 846, 548], ["15", 909, 548], ["20", 971, 548], ["25", 1033, 548], ["l/cm", 1048, 506] ] as const).entries()) text(store, `physalign-axis-${index}`, z++, x, y, label, "s");
  return document;
}

function drawDashed(store: Record<string, ShapeRecord>, prefix: string, z: number, from: [number, number], to: [number, number], dash: number) {
  const distance = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const count = Math.max(1, Math.floor(distance / (dash * 2)));
  for (let index = 0; index < count; index++) {
    const start = index * 2 * dash / distance;
    const end = Math.min(1, (index * 2 * dash + dash) / distance);
    draw(store, `${prefix}-${index}`, z + index, [
      [from[0] + (to[0] - from[0]) * start, from[1] + (to[1] - from[1]) * start],
      [from[0] + (to[0] - from[0]) * end, from[1] + (to[1] - from[1]) * end],
    ]);
  }
}
