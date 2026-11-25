// Browser-side probe shipped as plain JS text so it is never passed through the
// TypeScript/esbuild transform (keepNames injects __name into evaluated functions).
async function browserProbe() {
  const notes = ["Headless Chromium with a fake media device; no human listener."];
  const waitFor = (predicate, timeoutMs) => new Promise((resolve) => {
    const started = performance.now();
    if (predicate()) { resolve(true); return; }
    const timer = window.setInterval(() => {
      if (predicate() || performance.now() - started >= timeoutMs) {
        window.clearInterval(timer);
        resolve(predicate());
      }
    }, 20);
  });

  const Ctor = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
  const recognitionConstructor = globalThis.SpeechRecognition ? "SpeechRecognition" : globalThis.webkitSpeechRecognition ? "webkitSpeechRecognition" : null;
  let recognitionError = null;
  let recognitionInterim = false;
  let recognitionFinal = false;
  if (Ctor) {
    const recognition = new Ctor();
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onerror = (event) => { recognitionError = event.error || "unknown recognition error"; };
    recognition.onresult = (event) => {
      for (let index = 0; index < (event.results ? event.results.length : 0); index += 1) {
        if (event.results[index].isFinal) recognitionFinal = true;
        else recognitionInterim = true;
      }
    };
    try {
      recognition.start();
    } catch (error) {
      recognitionError = error instanceof Error ? error.message : String(error);
    }
    await waitFor(() => recognitionFinal || recognitionError !== null, 2500);
    recognition.abort();
  } else {
    notes.push("No SpeechRecognition constructor is exposed by this Chromium build.");
  }

  let voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) {
    await Promise.race([
      new Promise((resolve) => window.speechSynthesis.addEventListener("voiceschanged", () => resolve(), { once: true })),
      new Promise((resolve) => window.setTimeout(resolve, 1500)),
    ]);
    voices = window.speechSynthesis.getVoices();
  }
  if (voices.length === 0) notes.push("speechSynthesis.getVoices() returned no voices after waiting 1500 ms.");

  let synthesisStartMs = null;
  let bargeInMs = null;
  let cancellationVerified = false;
  if (voices.length > 0) {
    const utterance = new SpeechSynthesisUtterance("Review the passage once more.");
    utterance.lang = "en-US";
    const startedAt = performance.now();
    let cancelAt = 0;
    utterance.onstart = () => { synthesisStartMs = performance.now() - startedAt; };
    utterance.onend = () => { if (bargeInMs === null && cancelAt > 0) bargeInMs = performance.now() - cancelAt; };
    window.speechSynthesis.speak(utterance);
    await waitFor(() => synthesisStartMs !== null, 3000);
    if (synthesisStartMs !== null) {
      cancelAt = performance.now();
      window.speechSynthesis.cancel();
      await waitFor(() => bargeInMs !== null, 1500);
      cancellationVerified = !window.speechSynthesis.speaking;
    }
  }

  return {
    recognitionConstructor,
    voiceCount: voices.length,
    voiceNames: voices.map((voice) => voice.name),
    recognitionError,
    recognitionInterim,
    recognitionFinal,
    synthesisStartMs,
    bargeInMs,
    cancellationVerified,
    notes,
  };
}
