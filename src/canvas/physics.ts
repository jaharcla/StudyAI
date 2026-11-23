import type { ScientificObject } from "./model.js";
import { directionAngleDegrees, includedAngleDegrees } from "./geometry.js";

export type ForceRole = "gravity" | "normal" | "friction" | "tension" | "applied" | "unknown";

export type ForceAnalysis = {
  id: string;
  label: string;
  role: ForceRole;
  magnitude: number;
  angleDeg: number;
  components: [number, number, number];
  isPerpendicularToSurface?: boolean;
  isParallelToSurface?: boolean;
  angleOffsetDeg?: number;
};

export type PhysicsIssueCode =
  | "normal_not_perpendicular"
  | "gravity_not_downward"
  | "friction_not_parallel"
  | "unbalanced_normal_force"
  | "missing_gravity"
  | "missing_normal_force";

export type PhysicsIssue = {
  severity: "error" | "warning" | "info";
  code: PhysicsIssueCode;
  message: string;
  targetId?: string;
  expectedAngleDeg?: number;
  actualAngleDeg?: number;
  angleOffsetDeg?: number;
};

export type PhysicsCorrection = {
  targetId: string;
  correctedAngleDeg: number;
  reason: string;
};

export type PhysicsFBDAnalysis = {
  surfaceAngleDeg: number;
  isValid: boolean;
  forces: ForceAnalysis[];
  balance: {
    netForceX: number;
    netForceY: number;
    netForceParallel: number;
    netForcePerpendicular: number;
    isEquilibrium: boolean;
    perpendicularBalanced: boolean;
    parallelBalanced: boolean;
  };
  issues: PhysicsIssue[];
  suggestedCorrections: PhysicsCorrection[];
  summary: string;
};

export function classifyForceRole(label: string): ForceRole {
  const clean = label.trim().toLowerCase();
  if (/^(f_?n|n(ormal)?(\s+force)?|f_norm)$/i.test(clean)) return "normal";
  if (/^(f_?g|w(eight)?|mg|gravity)$/i.test(clean)) return "gravity";
  if (/^(f_?[ks]|f(riction)?(\s+force)?|\u03bc.*)$/i.test(clean)) return "friction";
  if (/^(t(ension)?(\s+force)?|t_\w+)$/i.test(clean)) return "tension";
  if (/^(f_?a(pp(lied)?)?(\s+force)?|p(ush)?)$/i.test(clean)) return "applied";
  return "unknown";
}

export function normalizeAngleDeg(angle: number): number {
  let a = angle % 360;
  if (a > 180) a -= 360;
  if (a <= -180) a += 360;
  return a;
}

export function analyzePhysicsFreeBodyDiagram(options: {
  objects: readonly ScientificObject[];
  surfaceAngleDeg?: number;
  angleToleranceDeg?: number;
  forceToleranceN?: number;
}): PhysicsFBDAnalysis {
  const surfaceAngle = normalizeAngleDeg(options.surfaceAngleDeg ?? 0);
  const angleTolerance = options.angleToleranceDeg ?? 5;
  const forceTolerance = options.forceToleranceN ?? 1;

  const forceObjects = options.objects.filter(
    (obj): obj is Extract<ScientificObject, { kind: "force" | "vector" }> =>
      obj.kind === "force" || obj.kind === "vector"
  );

  const forces: ForceAnalysis[] = [];
  const issues: PhysicsIssue[] = [];
  const suggestedCorrections: PhysicsCorrection[] = [];

  const expectedNormalAngle = normalizeAngleDeg(surfaceAngle + 90);
  const expectedGravityAngle = -90;

  for (const obj of forceObjects) {
    const role = classifyForceRole(obj.label ?? "");
    let angleDeg = 0;
    if (obj.geometry?.tail && obj.geometry?.tip) {
      angleDeg = directionAngleDegrees(obj.geometry.tail, obj.geometry.tip);
    } else {
      angleDeg = (Math.atan2(obj.components[1], obj.components[0]) * 180) / Math.PI;
    }
    angleDeg = Math.round(normalizeAngleDeg(angleDeg) * 10) / 10;

    const magnitude = Math.hypot(obj.components[0], obj.components[1], obj.components[2] ?? 0);

    const forceItem: ForceAnalysis = {
      id: obj.id,
      label: obj.label ?? "",
      role,
      magnitude,
      angleDeg,
      components: obj.components,
    };

    if (role === "normal") {
      const angleDiff = includedAngleDegrees(angleDeg, expectedNormalAngle);
      forceItem.isPerpendicularToSurface = angleDiff <= angleTolerance;
      forceItem.angleOffsetDeg = Math.round(angleDiff * 10) / 10;

      if (!forceItem.isPerpendicularToSurface) {
        issues.push({
          severity: "error",
          code: "normal_not_perpendicular",
          message: `Normal force must be perpendicular to the inclined surface (${expectedNormalAngle}°, but found ${angleDeg}°).`,
          targetId: obj.id,
          expectedAngleDeg: expectedNormalAngle,
          actualAngleDeg: angleDeg,
          angleOffsetDeg: forceItem.angleOffsetDeg,
        });
        suggestedCorrections.push({
          targetId: obj.id,
          correctedAngleDeg: expectedNormalAngle,
          reason: `Orient normal force perpendicular to the surface (${expectedNormalAngle}°).`,
        });
      }
    } else if (role === "gravity") {
      const angleDiff = includedAngleDegrees(angleDeg, expectedGravityAngle);
      if (angleDiff > angleTolerance) {
        issues.push({
          severity: "error",
          code: "gravity_not_downward",
          message: `Gravity must point directly downward towards Earth (-90°, but found ${angleDeg}°).`,
          targetId: obj.id,
          expectedAngleDeg: expectedGravityAngle,
          actualAngleDeg: angleDeg,
          angleOffsetDeg: Math.round(angleDiff * 10) / 10,
        });
        suggestedCorrections.push({
          targetId: obj.id,
          correctedAngleDeg: expectedGravityAngle,
          reason: "Orient gravity straight down (-90°).",
        });
      }
    } else if (role === "friction") {
      const parallelUp = surfaceAngle;
      const parallelDown = normalizeAngleDeg(surfaceAngle + 180);
      const diffUp = includedAngleDegrees(angleDeg, parallelUp);
      const diffDown = includedAngleDegrees(angleDeg, parallelDown);
      const minDiff = Math.min(diffUp, diffDown);
      forceItem.isParallelToSurface = minDiff <= angleTolerance;
      forceItem.angleOffsetDeg = Math.round(minDiff * 10) / 10;

      if (!forceItem.isParallelToSurface) {
        const expectedAngle = diffUp < diffDown ? parallelUp : parallelDown;
        issues.push({
          severity: "error",
          code: "friction_not_parallel",
          message: `Friction must act parallel to the contact surface (${expectedAngle}°, but found ${angleDeg}°).`,
          targetId: obj.id,
          expectedAngleDeg: expectedAngle,
          actualAngleDeg: angleDeg,
          angleOffsetDeg: forceItem.angleOffsetDeg,
        });
        suggestedCorrections.push({
          targetId: obj.id,
          correctedAngleDeg: expectedAngle,
          reason: `Orient friction parallel to the surface (${expectedAngle}°).`,
        });
      }
    }

    forces.push(forceItem);
  }

  // Calculate net force
  let netForceX = 0;
  let netForceY = 0;
  for (const force of forces) {
    const rad = (force.angleDeg * Math.PI) / 180;
    netForceX += force.magnitude * Math.cos(rad);
    netForceY += force.magnitude * Math.sin(rad);
  }

  const surfaceRad = (surfaceAngle * Math.PI) / 180;
  // Rotate by -surfaceAngle to decompose into parallel (x') and perpendicular (y')
  const netForceParallel = netForceX * Math.cos(surfaceRad) + netForceY * Math.sin(surfaceRad);
  const netForcePerpendicular = -netForceX * Math.sin(surfaceRad) + netForceY * Math.cos(surfaceRad);

  const perpendicularBalanced = Math.abs(netForcePerpendicular) <= forceTolerance;
  const parallelBalanced = Math.abs(netForceParallel) <= forceTolerance;
  const isEquilibrium = perpendicularBalanced && parallelBalanced;

  const isValid = issues.length === 0;

  const summary = isValid
    ? `Physics free-body diagram on ${surfaceAngle}° surface is physically consistent (Equilibrium: ${isEquilibrium ? "Yes" : "No"}).`
    : `Physics diagram has ${issues.length} issue(s): ${issues.map((i) => i.message).join("; ")}`;

  return {
    surfaceAngleDeg: surfaceAngle,
    isValid,
    forces,
    balance: {
      netForceX: Math.round(netForceX * 100) / 100,
      netForceY: Math.round(netForceY * 100) / 100,
      netForceParallel: Math.round(netForceParallel * 100) / 100,
      netForcePerpendicular: Math.round(netForcePerpendicular * 100) / 100,
      isEquilibrium,
      perpendicularBalanced,
      parallelBalanced,
    },
    issues,
    suggestedCorrections,
    summary,
  };
}
