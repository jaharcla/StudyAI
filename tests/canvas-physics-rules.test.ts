import { describe, expect, it } from "vitest";
import type { ScientificObject } from "../src/canvas/model";
import {
  analyzePhysicsFreeBodyDiagram,
  classifyForceRole,
  type PhysicsFBDAnalysis,
} from "../server/canvas-intelligence/scene/physics-rules";

describe("Physics Rules Analyzer (Free-Body Diagrams and Incline Mechanics)", () => {
  it("classifies force roles correctly from labels", () => {
    expect(classifyForceRole("F_N")).toBe("normal");
    expect(classifyForceRole("N")).toBe("normal");
    expect(classifyForceRole("Normal Force")).toBe("normal");
    expect(classifyForceRole("F_g")).toBe("gravity");
    expect(classifyForceRole("W")).toBe("gravity");
    expect(classifyForceRole("Weight")).toBe("gravity");
    expect(classifyForceRole("mg")).toBe("gravity");
    expect(classifyForceRole("f_k")).toBe("friction");
    expect(classifyForceRole("f_s")).toBe("friction");
    expect(classifyForceRole("friction")).toBe("friction");
    expect(classifyForceRole("T")).toBe("tension");
    expect(classifyForceRole("F_app")).toBe("applied");
    expect(classifyForceRole("random_label")).toBe("unknown");
  });

  it("verifies a valid horizontal free-body diagram in equilibrium", () => {
    // Horizontal surface: incline = 0°
    // Normal force: 100N straight up (90°)
    // Gravity: 100N straight down (-90°)
    const objects: ScientificObject[] = [
      {
        id: "fn-1",
        kind: "force",
        x: 100,
        y: 100,
        width: 10,
        height: 50,
        components: [0, 100, 0],
        units: "N",
        label: "F_N",
        pointOfApplication: { x: 100, y: 100 },
        geometry: { tail: { x: 100, y: 100 }, tip: { x: 100, y: 50 }, unitsPerCanvasUnit: 2 },
      },
      {
        id: "fg-1",
        kind: "force",
        x: 100,
        y: 100,
        width: 10,
        height: 50,
        components: [0, -100, 0],
        units: "N",
        label: "F_g",
        pointOfApplication: { x: 100, y: 100 },
        geometry: { tail: { x: 100, y: 100 }, tip: { x: 100, y: 150 }, unitsPerCanvasUnit: 2 },
      },
    ];

    const result = analyzePhysicsFreeBodyDiagram({ objects, surfaceAngleDeg: 0 });

    expect(result.surfaceAngleDeg).toBe(0);
    expect(result.isValid).toBe(true);
    expect(result.issues).toHaveLength(0);
    expect(result.balance.isEquilibrium).toBe(true);
    expect(result.balance.perpendicularBalanced).toBe(true);
    expect(result.balance.parallelBalanced).toBe(true);
  });

  it("detects when a student draws Normal force straight up on a 30° inclined plane", () => {
    // Incline = 30°
    // Normal force should be 30° + 90° = 120°
    // But student drew Normal force at 90° (straight up!)
    // Gravity: 100N at -90°
    const objects: ScientificObject[] = [
      {
        id: "fn-wrong",
        kind: "force",
        x: 200,
        y: 200,
        width: 10,
        height: 50,
        components: [0, 86.6, 0], // drawn straight up
        units: "N",
        label: "F_N",
        pointOfApplication: { x: 200, y: 200 },
        geometry: { tail: { x: 200, y: 200 }, tip: { x: 200, y: 150 }, unitsPerCanvasUnit: 1 },
      },
      {
        id: "fg-1",
        kind: "force",
        x: 200,
        y: 200,
        width: 10,
        height: 50,
        components: [0, -100, 0], // straight down
        units: "N",
        label: "F_g",
        pointOfApplication: { x: 200, y: 200 },
        geometry: { tail: { x: 200, y: 200 }, tip: { x: 200, y: 250 }, unitsPerCanvasUnit: 1 },
      },
    ];

    const result = analyzePhysicsFreeBodyDiagram({ objects, surfaceAngleDeg: 30 });

    expect(result.isValid).toBe(false);
    const normalIssue = result.issues.find((issue) => issue.code === "normal_not_perpendicular");
    expect(normalIssue).toBeDefined();
    expect(normalIssue?.expectedAngleDeg).toBe(120);
    expect(normalIssue?.actualAngleDeg).toBe(90);
    expect(normalIssue?.angleOffsetDeg).toBe(30);
    expect(normalIssue?.message).toContain("Normal force must be perpendicular to the inclined surface");
    expect(result.suggestedCorrections).toHaveLength(1);
    expect(result.suggestedCorrections[0].targetId).toBe("fn-wrong");
    expect(result.suggestedCorrections[0].correctedAngleDeg).toBe(120);
  });

  it("verifies a physically correct inclined plane with gravity, normal, and friction", () => {
    // Incline = 30°
    // Mass m = 10 kg, g = 9.8 m/s² => W = 98 N (angle -90°)
    // Normal force: N = W * cos(30°) = 98 * 0.8660 = 84.87 N at 120°
    // Friction: f = W * sin(30°) = 98 * 0.5 = 49 N up the plane at 30°
    const thetaRad = (30 * Math.PI) / 180;
    const normalAngleRad = (120 * Math.PI) / 180;

    const N_mag = 98 * Math.cos(thetaRad);
    const f_mag = 98 * Math.sin(thetaRad);

    const objects: ScientificObject[] = [
      {
        id: "fg",
        kind: "force",
        x: 300,
        y: 300,
        width: 10,
        height: 50,
        components: [0, -98, 0],
        units: "N",
        label: "F_g",
        pointOfApplication: { x: 300, y: 300 },
        geometry: { tail: { x: 300, y: 300 }, tip: { x: 300, y: 398 }, unitsPerCanvasUnit: 1 },
      },
      {
        id: "fn",
        kind: "force",
        x: 300,
        y: 300,
        width: 10,
        height: 50,
        components: [N_mag * Math.cos(normalAngleRad), N_mag * Math.sin(normalAngleRad), 0],
        units: "N",
        label: "F_N",
        pointOfApplication: { x: 300, y: 300 },
        geometry: {
          tail: { x: 300, y: 300 },
          tip: { x: 300 + N_mag * Math.cos(normalAngleRad), y: 300 - N_mag * Math.sin(normalAngleRad) },
          unitsPerCanvasUnit: 1,
        },
      },
      {
        id: "f_friction",
        kind: "force",
        x: 300,
        y: 300,
        width: 10,
        height: 50,
        components: [f_mag * Math.cos(thetaRad), f_mag * Math.sin(thetaRad), 0],
        units: "N",
        label: "f_s",
        pointOfApplication: { x: 300, y: 300 },
        geometry: {
          tail: { x: 300, y: 300 },
          tip: { x: 300 + f_mag * Math.cos(thetaRad), y: 300 - f_mag * Math.sin(thetaRad) },
          unitsPerCanvasUnit: 1,
        },
      },
    ];

    const result = analyzePhysicsFreeBodyDiagram({ objects, surfaceAngleDeg: 30 });

    expect(result.isValid).toBe(true);
    expect(result.issues).toHaveLength(0);
    expect(result.balance.perpendicularBalanced).toBe(true);
    expect(result.balance.parallelBalanced).toBe(true);
    expect(result.balance.isEquilibrium).toBe(true);
  });

  it("detects friction pointing in an arbitrary non-parallel direction", () => {
    const objects: ScientificObject[] = [
      {
        id: "fg",
        kind: "force",
        x: 300,
        y: 300,
        width: 10,
        height: 50,
        components: [0, -100, 0],
        units: "N",
        label: "W",
        geometry: { tail: { x: 300, y: 300 }, tip: { x: 300, y: 400 }, unitsPerCanvasUnit: 1 },
      },
      {
        id: "fn",
        kind: "force",
        x: 300,
        y: 300,
        width: 10,
        height: 50,
        components: [-50, 86.6, 0],
        units: "N",
        label: "F_N",
        geometry: { tail: { x: 300, y: 300 }, tip: { x: 250, y: 213.4 }, unitsPerCanvasUnit: 1 },
      },
      {
        id: "f_bad",
        kind: "force",
        x: 300,
        y: 300,
        width: 10,
        height: 50,
        components: [0, 50, 0], // drawn straight up instead of along 30° incline
        units: "N",
        label: "f",
        geometry: { tail: { x: 300, y: 300 }, tip: { x: 300, y: 250 }, unitsPerCanvasUnit: 1 },
      },
    ];

    const result = analyzePhysicsFreeBodyDiagram({ objects, surfaceAngleDeg: 30 });

    expect(result.isValid).toBe(false);
    const frictionIssue = result.issues.find((issue) => issue.code === "friction_not_parallel");
    expect(frictionIssue).toBeDefined();
    expect(frictionIssue?.actualAngleDeg).toBe(90);
    expect(frictionIssue?.expectedAngleDeg).toBe(30);
  });
});
