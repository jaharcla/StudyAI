export default function FreeKeyGuide() {
  return (
    <section data-testid="free-key-guide">
      <p>Use your own free provider keys: the provider's free tier is yours, and StudyAI never pays for your usage.</p>

      <details data-testid="free-key-groq">
        <summary>Get a free Groq key (recommended)</summary>
        <ol>
          <li>Sign up at <a href="https://console.groq.com" target="_blank" rel="noreferrer noopener">console.groq.com</a>.</li>
          <li>Open API Keys, then choose Create API Key.</li>
          <li>Add <code>GROQ_API_KEY=gsk_...</code> to your <code>.env</code> file.</li>
          <li>Restart the app.</li>
        </ol>
        <p>Free limits: 30 requests/min, 8,000 tokens/min, 200,000 tokens/day. No card required.</p>
      </details>

      <details data-testid="free-key-gemini">
        <summary>Google AI Studio — optional, Canvas math OCR</summary>
        <ol>
          <li>Create a key at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer noopener">aistudio.google.com/apikey</a>.</li>
          <li>Add <code>GOOGLE_AI_API_KEY=...</code> to your <code>.env</code> file.</li>
          <li>Restart the app.</li>
        </ol>
      </details>

      <p>Never commit <code>.env</code> — your keys stay on your machine.</p>
      <a data-testid="free-key-config-link" href="https://github.com/jaharcla/StudyAI/blob/main/docs/CONFIGURATION.md">All provider variables</a>
    </section>
  );
}
