import { describe, expect, it } from "vitest";
import { buildPrompt, buildWindDownMessage } from "./prompt";
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

  it("keeps every guardrail and age rule intact after the de-gendering rewrite", () => {
    const young = buildPrompt(base, null);
    expect(young).toContain("one short question at a time");
    expect(young).toContain("Never say you don't understand twice in a row");
    expect(young).toContain("mishear Mia");

    const older = buildPrompt({ ...base, childAge: 7 }, null);
    expect(older).toContain("back-and-forth");
    expect(older).toContain("Let Mia explain their reasoning");

    for (const p of [young, older]) {
      expect(p).toContain("death, scary news, family matters");
      expect(p).toContain("wonderful question for their mum or dad");
      expect(p).toContain("Never claim to be a real person");
      expect(p).toContain("Never ask for personal information");
      expect(p).toContain("praise one specific thing Mia did today");
      expect(p).toContain("warm goodbye");
      expect(p).toContain("Do not start\nanything new");
    }
  });
});

// The child's gender is not configurable and is not knowable, so no text we
// generate may assume it — this prompt is read out loud to the child for the
// whole lesson. Anything gendered has to come from the parent's own
// `directives`, which are inserted verbatim; `neutral` below therefore uses
// pronoun-free parent text so that what this asserts on is *our* wording.
const GENDERED = /\b(she|her|hers|herself|he|him|his|himself)\b/i;

const neutral: SessionConfig = { ...base, directives: "Loves dinosaurs. Praise a lot." };

describe("no gendered pronouns anywhere in what the agent is told", () => {
  const summary: SessionSummary = {
    whatWeDid: "Counted together.",
    grasped: ["1 to 5"],
    struggled: ["7 and 8"],
    nextFocus: "Practice 7 and 8.",
    engagement: "high",
    transcriptQuality: "good",
  };

  const prompts = [
    ["young child, no summary", buildPrompt(neutral, null)],
    ["young child, with summary", buildPrompt(neutral, summary)],
    ["older child, no summary", buildPrompt({ ...neutral, childAge: 9 }, null)],
    ["older child, with summary", buildPrompt({ ...neutral, childAge: 9 }, summary)],
    ["wind-down contextual update", buildWindDownMessage(neutral)],
  ] as const;

  for (const [label, text] of prompts) {
    it(`contains no gendered pronoun: ${label}`, () => {
      expect(text).not.toMatch(GENDERED);
    });
  }

  it("would catch a regression (the matcher is not vacuous)", () => {
    expect("Praise one specific thing she did today.").toMatch(GENDERED);
    expect("Let him explain his reasoning.").toMatch(GENDERED);
  });

  it("still lets the parent's own gendered directives through verbatim", () => {
    expect(buildPrompt(base, null)).toContain("She is shy and loves dinosaurs.");
  });
});
