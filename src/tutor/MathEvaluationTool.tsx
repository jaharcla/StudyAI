import { useCallback, useEffect } from "react";
import { useFrontendTool } from "@copilotkit/react-core/v2";
import { mathEnvelopeSchema, type MathEnvelope } from "../../server/math/http";
import type { MathResult } from "../math/evaluator";

type Props = { onResult: (result: MathResult) => void };

/** Registered from the Tutor rail. The model proposes a typed operation;
 * the local API computes it and the App owns the rendered result. */
export function MathEvaluationTool({ onResult }: Props) {
  const handler = useCallback(async (input: MathEnvelope): Promise<MathResult> => {
    let result: MathResult;
    try {
      const response = await fetch("/api/math/evaluate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!response.ok) throw new Error("bad response");
      const payload = (await response.json()) as MathResult;
      if (!payload || (payload.status !== "ok" && payload.status !== "error")) throw new Error("bad payload");
      result = payload;
    } catch {
      result = { status: "error", reason: "The calculation could not be completed." };
    }
    onResult(result);
    return result;
  }, [onResult]);

  useFrontendTool({
    name: "calculate_math",
    description: "Use for arithmetic, linear equations, expression equivalence and unit conversions. Propose only the typed operation and its inputs; StudyAI computes the result locally. A calculation is not course material and must never be cited as coming from a student document.",
    parameters: mathEnvelopeSchema,
    handler,
  }, [handler]);

  useEffect(() => {
    const host = window as Window & { __studyaiCalculateMath?: typeof handler };
    if (import.meta.env.DEV) host.__studyaiCalculateMath = handler;
    return () => {
      delete host.__studyaiCalculateMath;
    };
  }, [handler]);

  return null;
}
