import { describe, expect, it } from "vitest";
import { checkApplicationQuestion } from "../src/artifacts/scenario-question";

const explanation = "Friction opposes the motion of a block sliding down an incline at angle theta. The normal force is mg cos(theta).";

describe("checkApplicationQuestion", () => {
  it("accepts a genuine application question built on a changed scenario", () => {
    const problems = checkApplicationQuestion({
      scenario: "A 4 kg crate rests on a 30 degree ramp. A 6 N force now pushes it up the slope, and the coefficient of kinetic friction is 0.20.",
      prompt: "Compute the direction of friction and its magnitude for the crate in this new situation.",
      answer: "The friction is 0.20 times the normal force for a 4 kg crate on a 30 degree slope.",
      explanationText: explanation,
    });
    expect(problems).toEqual([]);
  });

  it("rejects a cosmetic variable swap with a recall stem", () => {
    const problems = checkApplicationQuestion({
      scenario: "A block slides down an incline at angle alpha instead of theta.",
      prompt: "What is the normal force at angle alpha?",
      answer: "mg cos(alpha).",
      explanationText: explanation,
    });
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.some((problem) => problem.includes("apply"))).toBe(true);
  });

  it("rejects a scenario that merely paraphrases the explanation", () => {
    const problems = checkApplicationQuestion({
      scenario: "Friction opposes the motion of a block sliding down an incline at angle theta, and the normal force equals mg cos(theta) for that block.",
      prompt: "Compute the normal force using the 30 degree value.",
      answer: "The normal force is mg cos(30).",
      explanationText: explanation,
    });
    expect(problems.some((problem) => problem.includes("paraphrases"))).toBe(true);
  });

  it("accepts a derived answer that contains no literal scenario value", () => {
    const problems = checkApplicationQuestion({
      scenario: "A 4.0 m beam is pinned 1.0 m from its left end. A 30 N weight hangs at the center and a push is applied at the right end.",
      prompt: "Compute the upward force needed for equilibrium.",
      answer: "12 N",
      explanationText: explanation,
    });
    expect(problems).toEqual([]);
  });

  it("rejects an answer copied verbatim from the explanation", () => {
    const problems = checkApplicationQuestion({
      scenario: "A 2 kg crate rests on a 20 degree ramp with a 5 N applied force and friction of 1 N.",
      prompt: "Determine the friction direction for the 20 degree ramp.",
      answer: "Friction opposes the motion of a block sliding down an incline at angle theta. The normal force is mg cos(theta).",
      explanationText: explanation,
    });
    expect(problems.some((problem) => problem.includes("copied"))).toBe(true);
  });
});
