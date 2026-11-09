import { describe, expect, it } from "vitest";
import { createScienceTools } from "../server/science-tools";

describe("deterministic tutor science tools", () => {
  const tools = new Map<string, { invoke(input: any): Promise<any> }>(createScienceTools().map((item) => [item.name, item] as [string, { invoke(input: any): Promise<any> }]));
  const invoke = async (name: string, args: unknown) => {
    const result = await tools.get(name)!.invoke({ type: "tool_call", name, id: "test-call", args } as never);
    return typeof result === "string" ? result : String(result.content);
  };

  it("evaluates bounded numeric expressions with provided variables", async () => {
    expect(JSON.parse(String(await invoke("calculate_expression", { expression: "m * 9.8", variables: { m: 2 } })))).toMatchObject({ verified: true, result: 19.6 });
  }, 15_000);

  it("calculates formal charge and vector magnitude", async () => {
    expect(JSON.parse(String(await invoke("calculate_formal_charge", { element: "O", nonbondingElectrons: 4, bondOrderSum: 2 })))).toMatchObject({ verified: true, formalCharge: 0 });
    expect(JSON.parse(String(await invoke("calculate_vector", { operation: "magnitude", vectorA: [3, 4, 0] })))).toMatchObject({ verified: true, result: 5 });
  });

  it("validates a bounded molecular structure without asserting drawing correctness", async () => {
    const result = JSON.parse(await invoke("validate_molecule", {
      name: "Water",
      atoms: [{ id: "o", element: "O", nonbondingElectrons: 4 }, { id: "h1", element: "H", nonbondingElectrons: 0 }, { id: "h2", element: "H", nonbondingElectrons: 0 }],
      resonanceForms: [{ id: "form-1", name: "Lewis", bonds: [{ id: "b1", from: "o", to: "h1", order: 1 }, { id: "b2", from: "o", to: "h2", order: 1 }] }],
      activeResonanceId: "form-1",
    }));
    expect(result).toMatchObject({ verified: true, valid: true, atomCount: 3, bondCount: 2, smiles: expect.any(String) });
  });

  it("rejects expressions outside the existing safe math allowlist", async () => {
    await expect(invoke("calculate_expression", { expression: 'import("x")', variables: {} })).rejects.toThrow();
    await expect(invoke("calculate_vector", { operation: "magnitude", vectorA: [1e101, 0, 0] })).rejects.toThrow();
  });
});
