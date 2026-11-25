import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readme = readFileSync(resolve("README.md"), "utf8");
const envExample = readFileSync(resolve(".env.example"), "utf8");

describe("CopilotKit Intelligence opt-in disclosure", () => {
  it("explains the managed-service egress in the README", () => {
    expect(readme).toMatch(/CPK_INTELLIGENCE_API_KEY/);
    expect(readme).toMatch(/Intelligence/i);
    expect(readme).toMatch(/interaction history/i);
    expect(readme).toMatch(/external|managed|third[- ]party|off[- ]machine/i);
  });

  it("adds a commented key example without a secret", () => {
    expect(envExample).toMatch(/^#\s*CPK_INTELLIGENCE_API_KEY=\s*$/m);
    expect(envExample).toMatch(/Intelligence/i);
    expect(envExample).not.toMatch(/^CPK_INTELLIGENCE_API_KEY=.+/m);
  });
});
