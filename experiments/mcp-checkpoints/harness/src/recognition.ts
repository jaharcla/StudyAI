export type BBox = { x: number; y: number; w: number; h: number };

export type CorpusItem = {
  id: string;
  category: string;
  goldText: string;
  goldSymbols?: string[];
  goldBBox?: BBox;
  goldAssociation?: string;
  source?: "locally-generated" | "user-provided";
};

export type Prediction = {
  itemId: string;
  text: string;
  symbols?: string[];
  confidence?: number;
  bbox?: BBox;
  association?: string;
  abstained?: boolean;
};

export type RecognitionMetrics = {
  cer: number;
  wer: number;
  stemSymbolAccuracy: number;
  bboxIoU: number;
  associationAccuracy: number;
  calibration: number;
  abstentionRate: number;
};

function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        current[j - 1]! + 1,
        previous[j]! + 1,
        previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[b.length]!;
}

function iou(a: BBox, b: BBox): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.w * a.h + b.w * b.h - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function recognitionMetrics(
  predictions: Prediction[],
  gold: CorpusItem[]
): RecognitionMetrics {
  const byId = new Map(predictions.map((p) => [p.itemId, p]));

  let charErrors = 0;
  let charTotal = 0;
  let wordErrors = 0;
  let wordTotal = 0;
  let associationCorrect = 0;
  let symbolCorrect = 0;
  let symbolTotal = 0;
  let iouSum = 0;
  let iouCount = 0;
  let calibrationSum = 0;
  let calibrationCount = 0;
  let abstained = 0;

  for (const item of gold) {
    const prediction = byId.get(item.id);
    const isAbstained = prediction?.abstained === true;
    if (isAbstained) abstained++;

    if (!isAbstained && prediction) {
      charErrors += editDistance(prediction.text, item.goldText);
      charTotal += item.goldText.length;
      const goldWords = item.goldText.split(/\s+/);
      const predWords = prediction.text.split(/\s+/);
      wordErrors += editDistance(goldWords.join(" "), predWords.join(" ")) === 0
        ? 0
        : goldWords.reduce(
            (sum, word, index) => sum + (word === predWords[index] ? 0 : 1),
            0
          );
      wordTotal += goldWords.length;

      if (typeof prediction.confidence === "number") {
        calibrationSum +=
          Math.abs(prediction.confidence - (prediction.text === item.goldText ? 1 : 0));
        calibrationCount++;
      }
    }

    if (isAbstained || prediction?.association === item.goldAssociation) {
      associationCorrect++;
    }

    if (item.goldSymbols && item.goldSymbols.length > 0) {
      symbolTotal++;
      const predictedSymbols = prediction?.symbols ?? [];
      const same =
        isAbstained ||
        (item.goldSymbols.length === predictedSymbols.length &&
          item.goldSymbols.every((s) => predictedSymbols.includes(s)));
      if (same) symbolCorrect++;
    }

    if (item.goldBBox && prediction?.bbox && !isAbstained) {
      iouSum += iou(item.goldBBox, prediction.bbox);
      iouCount++;
    }
  }

  return {
    cer: charTotal === 0 ? 0 : charErrors / charTotal,
    wer: wordTotal === 0 ? 0 : wordErrors / wordTotal,
    stemSymbolAccuracy: symbolTotal === 0 ? 1 : symbolCorrect / symbolTotal,
    bboxIoU: iouCount === 0 ? 1 : iouSum / iouCount,
    associationAccuracy: gold.length === 0 ? 1 : associationCorrect / gold.length,
    calibration: calibrationCount === 0 ? 0 : calibrationSum / calibrationCount,
    abstentionRate: gold.length === 0 ? 0 : abstained / gold.length,
  };
}
