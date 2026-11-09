import { describe, expect, it } from "vitest";
import { evaluateScientificObjects } from "../src/canvas/expressions";
import { createObject, emptyCanvasDocument, parseCanvasDocument } from "../src/canvas/model";
import { createMathWorkspaceState, verifyMathOperation } from "../src/canvas/math-workspace";
import { applyCanvasProposal, MathProposalValidationError, proposeCanvasEdit } from "../src/canvas/tutor";

describe("mathematical workspace", () => {
  it("persists bounded typed state and rejects out-of-range or malformed saved values", async () => {
    const object = createObject("equation", 10, 20);
    if (object.kind !== "equation") throw Error();
    const state = await createMathWorkspaceState("x^2+a", "x^2+a", undefined, { a: 2 });
    const saved = parseCanvasDocument(JSON.parse(JSON.stringify({ ...emptyCanvasDocument(), objects: [{ ...object, ...state }] })));
    expect(saved.objects[0]).toMatchObject({ kind: "equation", expression: "x^2+a", variables: { x: 0, a: 2 }, mathWorkspace: { schemaVersion: 1, parameters: { a: { value: 2, min: -10, max: 10 } } } });
    await expect(createMathWorkspaceState("a", "a", state.mathWorkspace, { a: 11 })).rejects.toThrow("between -10 and 10");
    const invalid = structuredClone(saved);
    const equation = invalid.objects[0];
    if (equation.kind !== "equation" || !equation.mathWorkspace) throw Error();
    equation.mathWorkspace.parameters.a.value = 11;
    expect(() => parseCanvasDocument(invalid)).toThrow("parameter range");
    const malformed = structuredClone(saved);
    const malformedEquation = malformed.objects[0];
    if (malformedEquation.kind !== "equation" || !malformedEquation.mathWorkspace) throw Error();
    malformedEquation.mathWorkspace.verifiedSteps = [{ status: "valid" } as never];
    expect(() => parseCanvasDocument(malformed)).toThrow("step history");
  });

  it("synchronizes a linked graph from validated parameter values", async () => {
    const equation = createObject("equation", 0, 0);
    const graph = createObject("graph", 260, 0);
    if (equation.kind !== "equation" || graph.kind !== "graph") throw Error();
    const state = await createMathWorkspaceState("x^2+a", "x^2+a", undefined, { a: 1 });
    const linkedEquation = { ...equation, ...state, mathWorkspace: { ...state.mathWorkspace, dependencies: [graph.id] } };
    const linkedGraph = { ...graph, expression: linkedEquation.expression, sourceEquationId: linkedEquation.id, xRange: [-1, 1] as [number, number] };
    const changed = { ...linkedEquation, variables: { ...linkedEquation.variables, a: 4 }, mathWorkspace: { ...linkedEquation.mathWorkspace, parameters: { a: { ...linkedEquation.mathWorkspace.parameters.a, value: 4 } }, revision: linkedEquation.mathWorkspace.revision + 1 } };
    const evaluated = await evaluateScientificObjects([changed, linkedGraph]);
    expect(evaluated[1]).toMatchObject({ kind: "graph", sourceEquationId: equation.id, points: expect.arrayContaining([[0, 4]]) });
  });

  it("labels bounded operation outcomes and preserves domain restrictions", async () => {
    const state = await createMathWorkspaceState("x+1", "x+1");
    state.mathWorkspace.statement = { left: "x", right: "2" };
    state.mathWorkspace.assumptions = ["x != 0"];
    state.mathWorkspace.domainRestrictions = ["x > 0"];
    expect((await verifyMathOperation(state.mathWorkspace, { kind: "add-constant", value: 3 })).status).toBe("valid");
    expect(await verifyMathOperation(state.mathWorkspace, { kind: "divide-constant", value: 0 })).toMatchObject({ status: "invalid" });
    expect(await verifyMathOperation(state.mathWorkspace, { kind: "divide-by-variable", variable: "y" })).toMatchObject({ status: "unknown" });
    expect(await verifyMathOperation(state.mathWorkspace, { kind: "divide-by-variable", variable: "x" })).toMatchObject({ status: "valid", state: { domainRestrictions: ["x > 0"], verifiedSteps: [{ assumptions: ["x != 0"], domainRestrictions: ["x > 0"] }] } });
    expect(await verifyMathOperation(state.mathWorkspace, { kind: "expand" })).toMatchObject({ status: "unsupported" });
    expect(await verifyMathOperation({ ...state.mathWorkspace, statement: { left: "x=2", right: "2" } }, { kind: "add-constant", value: 1 })).toMatchObject({ status: "invalid" });
  });

  it("requires validated Tutor math operations and rechecks them before apply", async () => {
    const equation = createObject("equation", 0, 0);
    if (equation.kind !== "equation") throw Error();
    const state = await createMathWorkspaceState("x+1", "x+1");
    const workspace = { ...state.mathWorkspace, statement: { left: "x", right: "2" } };
    const current = { ...equation, ...state, mathWorkspace: workspace };
    const context = { boardId: "board-1", courseId: "course-1", lessonId: "lesson-1", revision: 4, objects: [current] };
    const edit = { boardId: context.boardId, objectId: current.id, patchJson: "{}", reason: "Add the same value to both sides" };
    await expect(proposeCanvasEdit(context, { ...edit, mathOperation: { kind: "divide-by-variable", variable: "y" } })).rejects.toMatchObject({ status: "unknown" });
    await expect(proposeCanvasEdit(context, { ...edit, mathOperation: { kind: "add-constant", value: 2 }, patchJson: JSON.stringify({ expression: "0" }) })).rejects.toThrow("validated notation or mathOperation");
    const proposal = await proposeCanvasEdit(context, { ...edit, mathOperation: { kind: "add-constant", value: 2 } });
    expect((await applyCanvasProposal(context, proposal))[0]).toMatchObject({ mathWorkspace: { statement: { left: "(x) + (2)", right: "(2) + (2)" }, verifiedSteps: [{ status: "valid" }] } });
    await expect(applyCanvasProposal({ ...context, revision: 5 }, proposal)).rejects.toThrow("stale");
    expect(new MathProposalValidationError("unsupported", "x")).toMatchObject({ status: "unsupported" });
  });
});
