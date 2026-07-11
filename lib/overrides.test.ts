// The override canary is the thing standing between the child and an
// unguarded default agent, so its *comparison* — the part that decides whether
// to abort — is a pure function, and it is unit-tested here. (The wiring in
// SessionView.tsx that calls it and ends the session is React + a live audio
// SDK; that part is not unit-tested, see the report.)
//
// Two failure modes matter and they pull in opposite directions:
//   - a false NEGATIVE means the child talks to an unguarded agent;
//   - a false POSITIVE means a perfectly good lesson is aborted.
// So the tests below cover both: every plausible benign mangling of our own
// first message must still match, and a default-agent greeting must not.
import { describe, expect, it } from "vitest";
import { firstMessageMatches, normalizeSpokenText } from "./overrides";
import { buildFirstMessage } from "./prompt";
import type { SessionConfig } from "./types";

const config: SessionConfig = {
  agentName: "Robo",
  voiceId: "v1",
  childName: "Mia",
  childAge: 5,
  language: "en",
  goal: "Count to 10",
  directives: "",
  minutes: 10,
};

const expected = buildFirstMessage(config); // "Hi Mia! I'm Robo. Are you ready to play?"

// What SessionView passes: the two proper nouns that must survive into the
// agent's first turn if our override was honoured.
const names = [config.childName, config.agentName];
const matches = (received: string, expectedMessage = expected, mustMention = names) =>
  firstMessageMatches(expectedMessage, received, mustMention);

describe("normalizeSpokenText", () => {
  it("erases case, punctuation and whitespace differences", () => {
    expect(normalizeSpokenText("Hi Mia!  I'm Robo.")).toBe("hi mia i m robo");
  });

  it("keeps letters from non-Latin scripts", () => {
    expect(normalizeSpokenText("Привет, Аня!")).toBe("привет аня");
  });
});

describe("firstMessageMatches — must not abort a good session", () => {
  it("matches the message we sent, byte for byte", () => {
    expect(matches(expected)).toBe(true);
  });

  it("matches with different casing, spacing and trailing punctuation", () => {
    expect(matches("hi mia   i'm robo  are you ready to play")).toBe(true);
  });

  it("matches when the apostrophe comes back as a typographic one", () => {
    expect(matches("Hi Mia! I’m Robo. Are you ready to play?")).toBe(true);
  });

  it("matches when TTS-style normalization reshapes the punctuation", () => {
    expect(matches("Hi, Mia — I am Robo... are you ready to play!")).toBe(true);
  });

  it("matches when the text arrives truncated", () => {
    expect(matches("Hi Mia! I'm Robo.")).toBe(true);
  });

  it("matches when a stray word or two is added around it", () => {
    expect(matches("Hi Mia! I'm Robo. Are you ready to play today, friend?")).toBe(true);
  });

  it("does not abort on an empty message (nothing to judge)", () => {
    expect(matches("")).toBe(true);
  });

  it("works for a non-Latin name", () => {
    const ruConfig = { ...config, childName: "Аня", agentName: "Робо" };
    const ru = buildFirstMessage(ruConfig);
    expect(matches(ru, ru, [ruConfig.childName, ruConfig.agentName])).toBe(true);
  });
});

describe("firstMessageMatches — must abort an unguarded session", () => {
  it("rejects a stock ElevenLabs default greeting", () => {
    expect(matches("Hello! How can I help you today?")).toBe(false);
  });

  it("rejects a plausible dashboard-default agent opening", () => {
    expect(matches("Hi there, I'm an AI assistant. What would you like to talk about?")).toBe(false);
  });

  it("rejects a greeting that uses neither the child's nor the agent's name", () => {
    expect(matches("Hey! Ready to get started?")).toBe(false);
  });

  it("rejects a dashboard default with the same shape but no child's name", () => {
    // The nastiest near-miss: a leftover default greeting on the agent that
    // happens to read almost exactly like ours. Word-shape similarity alone
    // (Dice ≈ 0.8) would wave this through — requiring the child's name is
    // what catches it.
    expect(matches("Hi! I'm Robo. Are you ready to play?")).toBe(false);
  });

  it("rejects a first message built for a different child", () => {
    expect(matches(buildFirstMessage({ ...config, childName: "Sasha", agentName: "Buddy" }))).toBe(false);
  });
});
