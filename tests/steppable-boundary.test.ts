import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("steppable worked-example boundary", () => {
  it("the pure player never reads or writes a board", () => {
    const source = read("src/canvas/replay/example-player.ts");
    for (const forbidden of ["postDocument", "saveCanvasDocument", "canvas-persistence", "fetch(", "localStorage", "from \"react\""]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("the rail is view only: no board write, no provider call", () => {
    const source = read("src/canvas/replay/ExamplePlayer.tsx");
    for (const forbidden of ["postDocument", "saveCanvasDocument", "setReplayPosition", "fetch("]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("the step compiler adds no board interpretation or persistence authority", () => {
    const source = read("src/canvas/ai/teaching-scene.ts");
    for (const forbidden of ["canvas-persistence", "server/agent", "postDocument", "better-sqlite3"]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("new files carry no type-suppression escape hatches", () => {
    const files = [
      "src/canvas/replay/example-player.ts",
      "src/canvas/replay/ExamplePlayer.tsx",
      "src/learning/activities/contracts.ts",
      "server/learning/activities/service.ts",
    ];
    for (const file of files) {
      const source = read(file);
      for (const forbidden of ["@ts-ignore", "@ts-nocheck", "as any", "as never"]) expect(source).not.toContain(forbidden);
    }
  });
});
