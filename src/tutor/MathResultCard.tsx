import type { MathResult } from "../math/evaluator";

const cardStyle: React.CSSProperties = {
  position: "fixed",
  bottom: 12,
  left: "50%",
  transform: "translateX(-50%)",
  zIndex: 50,
  maxWidth: 360,
  display: "grid",
  gap: 4,
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid #e3e6ea",
  background: "#fff",
  boxShadow: "0 6px 24px rgba(20,24,30,.12)",
  font: "12px/1.4 Arial, sans-serif",
};
const labelStyle: React.CSSProperties = { fontSize: 9, letterSpacing: ".08em", fontWeight: 700, color: "#5f6670", textTransform: "uppercase" };
const valueStyle: React.CSSProperties = { fontSize: 16, fontWeight: 700, color: "#303640" };
const metaStyle: React.CSSProperties = { fontSize: 10, color: "#767e89" };
const errorStyle: React.CSSProperties = { margin: 0, color: "#a33", fontSize: 12 };

/** Calculation results are labelled as tool output and never carry a citation. */
export function MathResultCard({ result }: { result: MathResult | null }) {
  if (!result) return null;
  return (
    <div data-testid="math-result" role="status" className="math-result-card" style={cardStyle}>
      <span data-testid="math-result-label" style={labelStyle}>Calculated by StudyAI</span>
      {result.status === "ok" ? (
        <>
          <strong data-testid="math-result-value" style={valueStyle}>{result.result}</strong>
          <small style={metaStyle}>{result.method}</small>
        </>
      ) : (
        <p data-testid="math-result-error" role="alert" style={errorStyle}>{result.reason}</p>
      )}
    </div>
  );
}
