import { createHash } from "node:crypto";
import { stableJson } from "../stable-json.js";
import type { CanvasSceneEdge } from "./types.js";

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function shortHash(value: string): string {
  return sha256Hex(value).slice(0, 16);
}

export function sceneEdgeId(from: string, kind: CanvasSceneEdge["kind"], to: string, basis: CanvasSceneEdge["basis"]): string {
  return `e:${shortHash(`${from}|${kind}|${to}|${basis}`)}`;
}

export function graphHash(value: unknown): string {
  return sha256Hex(stableJson(value));
}
