import { z } from "zod";
import { compileExpression, evaluateScientificObjects } from "../../../src/canvas/expressions.js";
import { createMathWorkspaceState } from "../../../src/canvas/math-workspace.js";
import { createObject, type ScientificObject } from "../../../src/canvas/model.js";
import { ActivityCheckerResultSchema, type ActivityArtifact, type ActivityAttempt, type ActivityChecker, type ActivityResponse, type ActivitySpec } from "../../../src/learning/activities/contracts.js";

const finite = z.number().finite().min(-1_000_000).max(1_000_000);
const components = z.tuple([finite, finite, finite]);
const point = z.object({ x: finite, y: finite }).strict().default({ x: 150, y: 150 });
const ForceConfig = z.object({ label: z.string().trim().min(1).max(80), components, units: z.string().trim().min(1).max(24).default("N"), position: point }).strict();
const VectorConfig = z.object({ label: z.string().trim().min(1).max(80), components, units: z.string().trim().min(1).max(24).default("m/s"), position: point }).strict();
const MeasurementConfig = z.object({ label: z.string().trim().min(1).max(80), value: z.number().finite().min(0.000001).max(1_000_000), units: z.string().trim().min(1).max(24).default("kg"), position: point }).strict();
const LinearGraphConfig = z.object({
  slope: finite,
  intercept: finite,
  xRange: z.tuple([finite, finite]).refine(([min, max]) => max > min && max - min <= 20_000),
  xLabel: z.string().trim().min(1).max(40).default("x"),
  yLabel: z.string().trim().min(1).max(40).default("y"),
  position: point.default({ x: 540, y: 170 }),
  equationPosition: point.default({ x: 230, y: 150 }),
}).strict();

const ForceCheckerConfig = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("acceleration"), massArtifactId: z.string().min(1), forceArtifactIds: z.array(z.string().min(1)).min(1).max(8), tolerance: z.number().finite().min(0).max(100).default(0.01) }).strict(),
  z.object({ mode: z.literal("velocity-after-time"), massArtifactId: z.string().min(1), velocityArtifactId: z.string().min(1), forceArtifactIds: z.array(z.string().min(1)).min(1).max(8), timeSeconds: z.number().finite().min(0).max(10_000), tolerance: z.number().finite().min(0).max(100).default(0.01) }).strict(),
  z.object({ mode: z.literal("velocity-time-graph"), graphMode: z.enum(["slope", "intercept"]), massArtifactId: z.string().min(1), velocityArtifactId: z.string().min(1), forceArtifactIds: z.array(z.string().min(1)).min(1).max(8), graphArtifactId: z.string().min(1), tolerance: z.number().finite().min(0).max(100).default(0.01) }).strict(),
]);
const GraphCheckerConfig = z.object({
  mode: z.enum(["slope", "intercept", "value"]),
  graphArtifactId: z.string().min(1),
  atX: finite.default(0),
  tolerance: z.number().finite().min(0).max(100).default(0.01),
}).strict();

export type ArtifactInstance = { objects: Record<string, ScientificObject> };
export type ArtifactContext = { spec: ActivityArtifact; config: Record<string, unknown>; objects: Record<string, ScientificObject> };
export type CheckerContext = { spec: ActivityChecker; config: Record<string, unknown>; artifacts: Record<string, ArtifactContext>; response: ActivityResponse };

export type ActivityArtifactCapability = {
  id: string;
  version: number;
  configSchema: z.ZodType;
  supportedEditablePaths(config: Record<string, unknown>): string[];
  derivedPaths(config: Record<string, unknown>): string[];
  create(config: Record<string, unknown>): Promise<ArtifactInstance>;
};

export type ActivityCheckerCapability = {
  id: string;
  version: number;
  deterministic: boolean;
  configSchema: z.ZodType;
  requiredArtifacts(config: Record<string, unknown>): Array<{ id: string; capabilityId: string }>;
  check(input: CheckerContext): Promise<ReturnType<typeof ActivityCheckerResultSchema.parse>>;
};

export class ActivityCapabilityRegistry {
  private readonly artifacts = new Map<string, ActivityArtifactCapability>();
  private readonly checkers = new Map<string, ActivityCheckerCapability>();

  registerArtifact(capability: ActivityArtifactCapability) {
    if (this.artifacts.has(capability.id)) throw new Error(`Artifact capability is already registered: ${capability.id}`);
    this.artifacts.set(capability.id, capability);
    return this;
  }

  registerChecker(capability: ActivityCheckerCapability) {
    if (this.checkers.has(capability.id)) throw new Error(`Checker capability is already registered: ${capability.id}`);
    this.checkers.set(capability.id, capability);
    return this;
  }

  artifact(id: string) {
    const value = this.artifacts.get(id);
    if (!value) throw new Error(`Unsupported artifact capability: ${id}`);
    return value;
  }

  checker(id: string) {
    const value = this.checkers.get(id);
    if (!value) throw new Error(`Unsupported checker capability: ${id}`);
    return value;
  }

  validate(spec: ActivitySpec) {
    const artifacts = new Map<string, { definition: ActivityArtifact; capability: ActivityArtifactCapability; config: Record<string, unknown> }>();
    for (const definition of spec.artifacts) {
      if (artifacts.has(definition.id)) throw new Error(`Duplicate activity artifact: ${definition.id}`);
      const capability = this.artifact(definition.capabilityId);
      const config = capability.configSchema.parse(definition.config) as Record<string, unknown>;
      const allowedPaths = new Set(capability.supportedEditablePaths(config));
      if (definition.editablePaths.some((path) => !allowedPaths.has(path))) throw new Error(`Artifact ${definition.id} declares an unsupported editable field.`);
      artifacts.set(definition.id, { definition, capability, config });
    }

    const objectives = new Set(spec.objectives.map((item) => item.id));
    if (objectives.size !== spec.objectives.length) throw new Error("Activity objective IDs must be unique.");
    const checkers = new Map<string, { definition: ActivityChecker; capability: ActivityCheckerCapability; config: Record<string, unknown>; requirements: Array<{ id: string; capabilityId: string }> }>();
    for (const definition of spec.checkers) {
      if (checkers.has(definition.id)) throw new Error(`Duplicate activity checker: ${definition.id}`);
      const capability = this.checker(definition.capabilityId);
      const config = capability.configSchema.parse(definition.config) as Record<string, unknown>;
      checkers.set(definition.id, { definition, capability, config, requirements: capability.requiredArtifacts(config) });
    }

    const tasks = new Set<string>();
    for (const task of spec.tasks) {
      if (tasks.has(task.id)) throw new Error(`Duplicate activity task: ${task.id}`);
      tasks.add(task.id);
      if (!objectives.has(task.objectiveId)) throw new Error(`Task ${task.id} references an unknown objective.`);
      const checker = checkers.get(task.checkerId);
      if (!checker) throw new Error(`Task ${task.id} references an unknown checker.`);
      for (const artifactId of task.artifactIds) if (!artifacts.has(artifactId)) throw new Error(`Task ${task.id} references an unknown artifact.`);
      for (const required of checker.requirements) {
        if (!task.artifactIds.includes(required.id)) throw new Error(`Task ${task.id} omits a required checker artifact.`);
        if (artifacts.get(required.id)?.definition.capabilityId !== required.capabilityId) throw new Error(`Task ${task.id} has an unsupported checker and artifact combination.`);
      }
      if (task.assessment.mastery === "bkt" && !checker.capability.deterministic) throw new Error(`Task ${task.id} cannot update mastery with a nondeterministic checker.`);
    }
  }
}

function objectCapability(id: string, schema: z.ZodType, editable: string[], derived: string[], create: ActivityArtifactCapability["create"]): ActivityArtifactCapability {
  return { id, version: 1, configSchema: schema, supportedEditablePaths: () => editable, derivedPaths: () => derived, create };
}

function makeRegistry() {
  const registry = new ActivityCapabilityRegistry();
  registry
    .registerArtifact(objectCapability("canvas.force-vector", ForceConfig, ["object.components"], [], async (raw) => {
      const config = ForceConfig.parse(raw);
      const object = createObject("force", config.position.x, config.position.y);
      return { objects: { object: { ...object, label: config.label, components: config.components, units: config.units } } };
    }))
    .registerArtifact(objectCapability("canvas.vector", VectorConfig, ["object.components"], [], async (raw) => {
      const config = VectorConfig.parse(raw);
      const object = createObject("vector", config.position.x, config.position.y);
      return { objects: { object: { ...object, label: config.label, components: config.components, units: config.units } } };
    }))
    .registerArtifact(objectCapability("canvas.measurement", MeasurementConfig, ["object.value"], [], async (raw) => {
      const config = MeasurementConfig.parse(raw);
      const object = createObject("measurement", config.position.x, config.position.y);
      return { objects: { object: { ...object, label: config.label, value: config.value, units: config.units } } };
    }))
    .registerArtifact(objectCapability("canvas.linear-graph", LinearGraphConfig,
      ["equation.variables", "equation.mathWorkspace.parameters"], ["equation.result", "equation.evaluationError", "equation.mathWorkspace.revision", "graph.points", "graph.evaluationError"], async (raw) => {
        const config = LinearGraphConfig.parse(raw);
        const equationBase = createObject("equation", config.equationPosition.x, config.equationPosition.y);
        const equationState = await createMathWorkspaceState("mx+b", "m*x+b", undefined, { m: config.slope, b: config.intercept, x: 0 });
        const equation = { ...equationBase, expression: equationState.expression, variables: equationState.variables, mathWorkspace: equationState.mathWorkspace };
        const graphBase = createObject("graph", config.position.x, config.position.y);
        const graph = { ...graphBase, expression: equation.expression, sourceEquationId: equation.id, xRange: config.xRange, points: [], xLabel: config.xLabel, yLabel: config.yLabel };
        const evaluated = await evaluateScientificObjects([equation, graph]);
        return { objects: { equation: evaluated[0], graph: evaluated[1] } };
      }));

  registry
    .registerChecker({
      id: "physics.force-motion", version: 1, deterministic: true, configSchema: ForceCheckerConfig,
      requiredArtifacts: (raw) => {
        const config = ForceCheckerConfig.parse(raw);
        return [
          { id: config.massArtifactId, capabilityId: "canvas.measurement" },
          ...(config.mode !== "acceleration" ? [{ id: config.velocityArtifactId, capabilityId: "canvas.vector" }] : []),
          ...config.forceArtifactIds.map((id) => ({ id, capabilityId: "canvas.force-vector" })),
          ...(config.mode === "velocity-time-graph" ? [{ id: config.graphArtifactId, capabilityId: "canvas.linear-graph" }] : []),
        ];
      },
      check: async ({ spec, config: raw, artifacts, response }) => {
        const config = ForceCheckerConfig.parse(raw);
        const mass = artifacts[config.massArtifactId]?.objects.object;
        const forces = config.forceArtifactIds.map((id) => artifacts[id]?.objects.object);
        const velocity = config.mode !== "acceleration" ? artifacts[config.velocityArtifactId]?.objects.object : undefined;
        if (!mass || mass.kind !== "measurement" || !forces.length || forces.some((item) => !item || item.kind !== "force")) return result("unknown", spec, "The required force model is unavailable.");
        if (mass.units !== "kg" || mass.value <= 0 || forces.some((item) => item?.kind !== "force" || item.units !== "N" || Math.abs(item.components[1]) > 1e-9 || Math.abs(item.components[2]) > 1e-9)) return result("unknown", spec, "This checker only supports positive mass and horizontal forces measured in newtons.");
        if (config.mode !== "acceleration" && (!velocity || velocity.kind !== "vector" || velocity.units !== "m/s" || Math.abs(velocity.components[1]) > 1e-9 || Math.abs(velocity.components[2]) > 1e-9)) return result("unknown", spec, "This checker only supports horizontal initial velocity measured in m/s.");
        const netForce = forces.reduce((sum, item) => sum + (item?.kind === "force" ? item.components[0] : 0), 0);
        const acceleration = netForce / mass.value;
        const initialVelocity = velocity?.kind === "vector" ? velocity.components[0] : undefined;
        const expected = config.mode === "acceleration" ? acceleration : config.mode === "velocity-after-time" ? initialVelocity! + acceleration * config.timeSeconds : config.graphMode === "slope" ? acceleration : initialVelocity!;
        let graphValue: number | undefined;
        if (config.mode === "velocity-time-graph") {
          const equation = artifacts[config.graphArtifactId]?.objects.equation;
          if (!equation || equation.kind !== "equation" || !equation.mathWorkspace) return result("unknown", spec, "The linked velocity-time equation is unavailable.");
          try {
            const expression = await compileExpression(equation.expression);
            const parameters = Object.fromEntries(Object.entries(equation.mathWorkspace.parameters).map(([name, parameter]) => [name, parameter.value]));
            const at = (x: number) => expression.evaluate({ ...parameters, x });
            const atZero = at(0);
            if (config.graphMode === "intercept") graphValue = atZero;
            else {
              const atOne = at(1), atTwo = at(2);
              const first = atOne - atZero, second = atTwo - atOne;
              if (Math.abs(first - second) > 1e-7 * Math.max(1, Math.abs(first), Math.abs(second))) return result("unsupported", spec, "Velocity-time graph checking only supports linear equations.");
              graphValue = first;
            }
          } catch { return result("unknown", spec, "The linked graph equation is outside the supported expression domain."); }
        }
        const submitted = numericAnswer(response);
        if (submitted === undefined) return result("unknown", spec, "Enter one finite numeric value so the physical relationship can be checked.");
        const graphMatches = graphValue === undefined || Math.abs(graphValue - expected) <= config.tolerance;
        const correct = Math.abs(submitted - expected) <= config.tolerance && graphMatches;
        const summary = correct ? "The numeric relationship matches the supported one-dimensional model." : config.mode === "velocity-time-graph" && !graphMatches ? `The graph ${config.graphMode} does not match the current force and initial-velocity model.` : "The numeric relationship does not match the current one-dimensional model.";
        return result(correct ? "correct" : "incorrect", spec, summary, { netForce, mass: mass.value, acceleration, ...(initialVelocity === undefined ? {} : { initialVelocity }), ...(graphValue === undefined ? {} : { graphValue }), expected, units: config.mode === "velocity-after-time" || config.mode === "velocity-time-graph" && config.graphMode === "intercept" ? "m/s" : "m/s²" });
      },
    })
    .registerChecker({
      id: "math.graph-interpretation", version: 1, deterministic: true, configSchema: GraphCheckerConfig,
      requiredArtifacts: (raw) => [{ id: GraphCheckerConfig.parse(raw).graphArtifactId, capabilityId: "canvas.linear-graph" }],
      check: async ({ spec, config: raw, artifacts, response }) => {
        const config = GraphCheckerConfig.parse(raw);
        const graphArtifact = artifacts[config.graphArtifactId];
        const equation = graphArtifact?.objects.equation;
        if (!graphArtifact || !equation || equation.kind !== "equation" || !equation.mathWorkspace) return result("unknown", spec, "The linked graph equation is unavailable.");
        try {
          const expression = await compileExpression(equation.expression);
          const parameters = Object.fromEntries(Object.entries(equation.mathWorkspace.parameters).map(([name, parameter]) => [name, parameter.value]));
          const at = (x: number) => expression.evaluate({ ...parameters, x });
          let expected: number;
          if (config.mode === "value") expected = at(config.atX);
          else {
            const y0 = at(config.mode === "intercept" ? 0 : config.atX);
            if (config.mode === "intercept") expected = y0;
            else {
              const y1 = at(config.atX + 1), y2 = at(config.atX + 2);
              const first = y1 - y0, second = y2 - y1;
              if (Math.abs(first - second) > 1e-7 * Math.max(1, Math.abs(first), Math.abs(second))) return result("unsupported", spec, "Slope checking is limited to graphs that are linear across the sampled interval.");
              expected = first;
            }
          }
          const submitted = numericAnswer(response);
          if (submitted === undefined) return result("unknown", spec, "Enter one finite numeric value so the graph can be checked.");
          const correct = Math.abs(submitted - expected) <= config.tolerance;
          return result(correct ? "correct" : "incorrect", spec, correct ? "The answer matches the linked graph equation." : "The answer does not match the linked graph equation.", { mode: config.mode, atX: config.atX, expected });
        } catch {
          return result("unknown", spec, "The requested graph value is outside the expression engine's supported domain.");
        }
      },
    });
  return registry;
}

export const defaultActivityCapabilities = makeRegistry();

function result(status: "correct" | "incorrect" | "unknown" | "unsupported", checker: ActivityChecker, summary: string, details?: Record<string, unknown>) {
  return ActivityCheckerResultSchema.parse({ status, checkerId: checker.capabilityId, checkerVersion: 1, summary, ...(details ? { details } : {}) });
}

function numericAnswer(value: ActivityResponse): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  const text = value.trim();
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) return undefined;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function validateCapabilities(spec: ActivitySpec, registry = defaultActivityCapabilities) {
  registry.validate(spec);
}

export function artifactContexts(spec: ActivitySpec, bindings: ActivityAttempt["artifactBindings"], documentObjects: ScientificObject[], registry = defaultActivityCapabilities): Record<string, ArtifactContext> {
  const byId = new Map(documentObjects.map((item) => [item.id, item]));
  return Object.fromEntries(spec.artifacts.map((definition) => {
    const binding = bindings[definition.id];
    if (!binding) throw new Error(`Activity artifact binding is missing: ${definition.id}`);
    const objects = Object.fromEntries(Object.entries(binding).map(([role, objectId]) => {
      const object = byId.get(objectId);
      if (!object) throw new Error(`Activity canvas object is missing: ${definition.id}`);
      return [role, object];
    }));
    registry.artifact(definition.capabilityId).configSchema.parse(definition.config);
    return [definition.id, { spec: definition, config: definition.config, objects }];
  }));
}

export function artifactCapabilityPaths(artifact: ActivityArtifact, registry = defaultActivityCapabilities) {
  const capability = registry.artifact(artifact.capabilityId);
  const config = capability.configSchema.parse(artifact.config) as Record<string, unknown>;
  return { editable: artifact.editablePaths, derived: capability.derivedPaths(config) };
}
