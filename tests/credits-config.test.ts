import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

describe("hosted credits configuration contract", () => {
  const example = readFileSync(resolve(process.cwd(), ".env.example"), "utf8");

  it("documents both build-time variables the credits UI needs", () => {
    expect(example).toContain("VITE_CREDITS_API_URL");
    expect(example).toContain("VITE_STUDYAI_CLIENT_TOKEN");
  });
});
