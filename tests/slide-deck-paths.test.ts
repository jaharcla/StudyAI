import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { artifactDataDir } from "../server/presentations/paths";

const original = process.env.STUDYAI_ARTIFACTS_DIR;
afterEach(() => {
  if (original === undefined) delete process.env.STUDYAI_ARTIFACTS_DIR;
  else process.env.STUDYAI_ARTIFACTS_DIR = original;
});

describe("artifactDataDir", () => {
  it("defaults to data/artifacts under the working tree", () => {
    delete process.env.STUDYAI_ARTIFACTS_DIR;
    expect(artifactDataDir()).toMatch(/[\\/]data[\\/]artifacts$/);
  });

  it("uses the configured directory when set", () => {
    process.env.STUDYAI_ARTIFACTS_DIR = "C:/presenton-app-data";
    expect(artifactDataDir()).toBe(resolve("C:/presenton-app-data"));
  });
});
