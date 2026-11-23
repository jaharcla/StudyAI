import { describe, expect, it } from "vitest";
import { recognitionMetrics, type CorpusItem, type Prediction } from "./recognition";

const gold: CorpusItem[] = [
  {
    id: "g1",
    category: "chemistry-notation",
    goldText: "H2O",
    goldSymbols: ["H", "O"],
    goldBBox: { x: 0, y: 0, w: 10, h: 10 },
    goldAssociation: "atom-O",
  },
  {
    id: "g2",
    category: "handwritten-note",
    goldText: "the cat sat",
    goldSymbols: [],
    goldAssociation: "note-1",
  },
];

const predictions: Prediction[] = [
  {
    itemId: "g1",
    text: "H2O",
    symbols: ["H", "O"],
    confidence: 0.9,
    bbox: { x: 0, y: 0, w: 10, h: 10 },
    association: "atom-H",
    abstained: false,
  },
  {
    itemId: "g2",
    text: "the bat sat",
    symbols: [],
    confidence: 0.8,
    association: "note-1",
    abstained: false,
  },
];

describe("recognitionMetrics", () => {
  it("separates text accuracy from association, calibration and abstention", () => {
    const m = recognitionMetrics(predictions, gold);
    // Aggregate CER/WER over all non-abstained reference characters/words:
    // H2O (3 chars, 1 word) + "the cat sat" (11 chars, 3 words) = 14/4.
    expect(m.cer).toBeCloseTo(1 / 14, 5);
    expect(m.wer).toBeCloseTo(1 / 4, 5);
    expect(m.associationAccuracy).toBeCloseTo(0.5, 5);
    expect(m.stemSymbolAccuracy).toBe(1);
    expect(m.bboxIoU).toBe(1);
    expect(m.abstentionRate).toBe(0);
    expect(m.calibration).toBeCloseTo(0.45, 5);
  });

  it("counts a low-confidence abstention as correct, not as an OCR error", () => {
    const withAbstention: Prediction[] = [
      predictions[0],
      { itemId: "g2", text: "", confidence: 0.1, abstained: true },
    ];
    const m = recognitionMetrics(withAbstention, gold);
    expect(m.abstentionRate).toBe(0.5);
    expect(m.associationAccuracy).toBeCloseTo(0.5, 5);
    expect(m.cer).toBe(0);
    expect(m.wer).toBe(0);
  });
});
