import { describe, expect, it } from "vitest";
import { buildPrompt } from "./prompt";
import type { SessionConfig, SessionSummary } from "./types";

const base: SessionConfig = {
  agentName: "Robo",
  voiceId: "v1",
  childName: "Mia",
  childAge: 5,
  language: "en",
  goal: "Count to 10",
  directives: "She is shy and loves dinosaurs.",
  minutes: 10,
};

describe("buildPrompt", () => {
  it("includes the agent name, child name, age and goal", () => {
    const p = buildPrompt(base, null);
    expect(p).toContain("Robo");
    expect(p).toContain("Mia");
    expect(p).toContain("5");
    expect(p).toContain("Count to 10");
  });

  it("includes the parent's directives verbatim", () => {
    expect(buildPrompt(base, null)).toContain("She is shy and loves dinosaurs.");
  });

  it("uses young-child rules below age 6", () => {
    expect(buildPrompt({ ...base, childAge: 5 }, null)).toContain("one short question at a time");
  });

  it("uses older-child rules at age 6 and above", () => {
    const p = buildPrompt({ ...base, childAge: 6 }, null);
    expect(p).not.toContain("one short question at a time");
    expect(p).toContain("back-and-forth");
  });

  it("includes the previous session's focus when a summary exists", () => {
    const summary: SessionSummary = {
      whatWeDid: "Counted together.",
      grasped: ["1 to 5"],
      struggled: ["7 and 8"],
      nextFocus: "Practice 7 and 8.",
      engagement: "high",
      transcriptQuality: "good",
    };
    const p = buildPrompt(base, summary);
    expect(p).toContain("7 and 8");
    expect(p).toContain("Practice 7 and 8.");
  });

  it("produces a clean prompt with no leftover markers when there is no summary", () => {
    const p = buildPrompt(base, null);
    expect(p).not.toContain("undefined");
    expect(p).not.toContain("null");
    expect(p).not.toMatch(/last time/i);
  });

  it("always includes the guardrails and the wind-down instruction", () => {
    const p = buildPrompt(base, null);
    expect(p).toContain("mum or dad");
    expect(p).toContain("10 minutes");
  });
});
