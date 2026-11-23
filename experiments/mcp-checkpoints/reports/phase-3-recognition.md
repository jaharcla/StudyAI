# Phase 3 — Recognition accuracy and uncertainty

Status: **partial — metric harness and real bridge recognition tests run; no labelled corpus, no provider accuracy comparison.**

## What was actually run

### Harness metrics (RED → GREEN, with two test corrections)

```
npm test -- --config experiments/mcp-checkpoints/harness/vitest.config.ts experiments/mcp-checkpoints/harness/src/recognition.test.ts
```
- RED: `Cannot find module './recognition'`.
- Two intermediate failures were **test-expectation errors**, not implementation bugs, and were corrected in the test file:
  1. CER/WER are aggregate over all non-abstained reference characters/words (1/14 and 1/4 for the fixture), not per-erroneous-item (1/11, 1/3).
  2. Calibration is mean |confidence − correctness|; with confidences 0.9 (correct) and 0.8 (wrong) the mean is 0.45, not 0.15.
- GREEN: `Test Files 1 passed (1); Tests 2 passed (2)`.
- The tests pin that a low-confidence abstention counts as correct for text, symbol and association metrics, and that association accuracy is reported separately from CER/WER.

### Real StudyAI recognition tests

```
npx vitest run tests/canvas-recognition.test.ts tests/canvas-recognition-calibration.test.ts tests/canvas-recognition-feedback.test.ts tests/canvas-label-association.test.ts tests/canvas-ocr-selection.test.ts tests/canvas-ocr-recovery.test.ts
```
Result: `Test Files 6 passed (6); Tests 27 passed (27)`.

Notable passing tests:
- `canvas recognition renderer > renders deterministically and keeps a square canvas` (also relevant to Phase 6)
- calibration suite (5 tests), feedback suite (3 tests), OCR selection (5 tests), label association (2 tests), OCR recovery (1 test), recognition (11 tests)

These prove the bridge has working abstention/calibration/association/feedback machinery. They do **not** produce CER/WER or provider-comparison numbers.

### PaddleOCR provider — install and lifecycle verified, accuracy not run

Created `checkpoints/paddle-venv/` with uv/Python 3.13.12, installed `paddleocr-mcp==0.8.5` with `paddleocr==3.7.0`, and ran:

```
python -m paddleocr_mcp --help
```
The CLI started and listed the expected arguments: `--model`, `--ppocr_source {local,aistudio,qianfan,self_hosted}`, `--http`, timeouts, and provider credentials. This confirms the pinned provider is installable and its configuration surface matches the research. **No OCR model was downloaded or run**, so no PaddleOCR accuracy or latency number is reported.

### Handwriting OCR MCP

Not contacted. The hosted service needs OAuth and the local server needs an API token; sending any corpus to an external service would also require an explicit decision about student data. No lifecycle test was run.

## Corpus status

`fixtures/corpus/manifest.json` defines the six categories from the spec and distinguishes `locally-generated` from `user-provided`. **No items were created**: handwriting and mixed categories require user-provided data, and generating synthetic images would produce metrics about synthetic inputs, not about the material students actually put on the canvas. User consent is needed before filling this corpus.

## Answer to the campaign question

**Not answerable.** There is no labelled corpus and no provider output to compare, so "does changing the recognition provider improve what the tutor understands and creates?" has no measured answer. The harness is ready to compute CER, WER, STEM symbol accuracy, bounding-box IoU, association accuracy, calibration and abstention rate as separate fields once a corpus and provider predictions exist.

## To complete this phase

1. Obtain consented handwriting/mixed samples, or synthesize a clearly-labelled fixture corpus and mark it as synthetic.
2. Run PaddleOCR local models (`ocr` with PP-OCRv5/v6, `pp_structurev3`, `paddleocr_vl`) over the corpus and record predictions plus latency/resources.
3. Run the bridge's `read_canvas_ink` over the same items and feed both prediction sets to `recognitionMetrics`.
4. Decide explicitly whether Handwriting OCR may receive any corpus data; if yes, test submit/status/result/delete_after lifecycle.
