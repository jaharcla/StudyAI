import { normalizeRecognitionLabel, type CanvasRecognitionDecision } from "./feedback.js";

/**
 * One recorded human decision on one stroke group, paired with what the CLIP
 * adapter actually offered for that group. `accept` means the offer was right;
 * `correct` and `reject` mean the top candidate should have been withheld.
 *
 * Probabilities come from a probe run with confidence/margin set to 0, so the
 * pair (top, second) is independent of the thresholds being swept.
 */
export type RecognitionCalibrationSample = {
  decision: CanvasRecognitionDecision;
  label: string | null;
  topLabel: string;
  topProbability: number;
  secondProbability: number;
};

export type ThresholdPoint = { minConfidence: number; minMargin: number };

export type ThresholdCell = ThresholdPoint & {
  positives: number;
  offeredPositives: number;
  agreements: number;
  negatives: number;
  offeredNegatives: number;
  coverage: number;
  falseOfferRate: number;
  /** Youden-style balance: coverage minus the false-offer rate, in [-1, 1]. */
  balanced: number;
};

export type ThresholdRecommendation = {
  current: ThresholdCell | null;
  best: ThresholdCell | null;
  changed: boolean;
  reason: string;
};

const MIN_IMPROVEMENT = 0.05;

export function calibrationMargin(sample: Pick<RecognitionCalibrationSample, "topProbability" | "secondProbability">): number {
  return sample.topProbability - sample.secondProbability;
}

export function offersCandidate(sample: RecognitionCalibrationSample, point: ThresholdPoint): boolean {
  return sample.topProbability >= point.minConfidence && calibrationMargin(sample) >= point.minMargin;
}

/** Accept = positive sample; correct/reject = the offer was wrong. */
function isPositive(sample: RecognitionCalibrationSample): boolean {
  return sample.decision === "accept";
}

export function evaluateThresholdPoint(samples: readonly RecognitionCalibrationSample[], point: ThresholdPoint): ThresholdCell {
  let positives = 0, offeredPositives = 0, agreements = 0, negatives = 0, offeredNegatives = 0;
  for (const sample of samples) {
    const offered = offersCandidate(sample, point);
    if (isPositive(sample)) {
      positives++;
      if (offered) {
        offeredPositives++;
        if (sample.label && normalizeRecognitionLabel(sample.label) === normalizeRecognitionLabel(sample.topLabel)) agreements++;
      }
    } else {
      negatives++;
      if (offered) offeredNegatives++;
    }
  }
  const coverage = positives ? offeredPositives / positives : 0;
  const falseOfferRate = negatives ? offeredNegatives / negatives : 0;
  return {
    ...point,
    positives,
    offeredPositives,
    agreements,
    negatives,
    offeredNegatives,
    coverage,
    falseOfferRate,
    balanced: coverage - falseOfferRate,
  };
}

export function sweepThresholdGrid(samples: readonly RecognitionCalibrationSample[], confidenceValues: readonly number[], marginValues: readonly number[]): ThresholdCell[] {
  const cells: ThresholdCell[] = [];
  for (const minConfidence of confidenceValues) {
    for (const minMargin of marginValues) {
      cells.push(evaluateThresholdPoint(samples, { minConfidence, minMargin }));
    }
  }
  return cells;
}

export function calibrationGrid(step = 0.01, maxConfidence = 0.5, maxMargin = 0.2): { confidenceValues: number[]; marginValues: number[] } {
  const range = (max: number) => {
    const values: number[] = [];
    for (let value = 0; value <= max + 1e-9; value += step) values.push(Number(value.toFixed(4)));
    return values;
  };
  return { confidenceValues: range(maxConfidence), marginValues: range(maxMargin) };
}

/**
 * A threshold change is only recommended when both classes are represented and
 * the best grid cell beats the current defaults by more than measurement noise.
 * Otherwise the defaults stay: the ADR forbids changing them without evidence.
 */
export function recommendThresholds(
  samples: readonly RecognitionCalibrationSample[],
  cells: readonly ThresholdCell[],
  current: ThresholdPoint,
  minimumClasses = { positives: 20, negatives: 5 },
): ThresholdRecommendation {
  const positives = samples.filter(isPositive).length;
  const negatives = samples.length - positives;
  const currentCell = cells.find((cell) => cell.minConfidence === current.minConfidence && cell.minMargin === current.minMargin) ?? evaluateThresholdPoint(samples, current);
  if (positives < minimumClasses.positives || negatives < minimumClasses.negatives) {
    return {
      current: currentCell,
      best: null,
      changed: false,
      reason: `Insufficient decisions: ${positives} accept(s) and ${negatives} correct/reject(s); need at least ${minimumClasses.positives} and ${minimumClasses.negatives}. Defaults unchanged.`,
    };
  }
  const ranked = [...cells].sort((a, b) =>
    b.balanced - a.balanced ||
    b.coverage - a.coverage ||
    a.minConfidence - b.minConfidence ||
    a.minMargin - b.minMargin);
  const best = ranked[0];
  if (!best || best.balanced < currentCell.balanced + MIN_IMPROVEMENT) {
    return {
      current: currentCell,
      best: best ?? null,
      changed: false,
      reason: `Best grid cell (${best?.minConfidence ?? "-"}/${best?.minMargin ?? "-"}, balanced ${best ? best.balanced.toFixed(3) : "-"}) does not beat the current defaults (balanced ${currentCell.balanced.toFixed(3)}) by ${MIN_IMPROVEMENT}. Defaults unchanged.`,
    };
  }
  return {
    current: currentCell,
    best,
    changed: true,
    reason: `Best grid cell minConfidence=${best.minConfidence} minMargin=${best.minMargin} improves balanced accuracy ${currentCell.balanced.toFixed(3)} -> ${best.balanced.toFixed(3)} (coverage ${best.coverage.toFixed(3)}, false-offer ${best.falseOfferRate.toFixed(3)}).`,
  };
}
