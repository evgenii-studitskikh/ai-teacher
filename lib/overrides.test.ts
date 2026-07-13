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

// Regression coverage for the fail-open hole: SessionView.tsx used to mark
// its one-shot "first agent turn seen" flag *before* running this check, and
// firstMessageMatches used to return `true` for an empty `received`. An
// agent turn that arrives interrupted or zero-length (not exotic on
// ElevenLabs) would then trivially "match", the one-shot canary would be
// consumed on nothing, and the *real* first turn — the one that would have
// exposed a disabled override — would never be checked again for the rest of
// the session.
//
// The fix has two parts:
//   1. Here (pure logic, unit-tested below): firstMessageMatches no longer
//      treats an empty `received` (or `expected`) as a match. An empty
//      string is not evidence overrides are on, so it cannot pass.
//   2. In SessionView.tsx (React + a live audio SDK, not unit-tested — this
//      repo has no @testing-library/react or jsdom test environment, and
//      faking one just to poke a ref would not honestly exercise the real
//      ElevenLabs message-callback wiring): the one-shot flag is now only
//      set once an agent turn's normalized text is non-empty, so an empty
//      turn is skipped entirely and the *next* non-empty agent turn is the
//      one actually judged. Part 1 is what makes part 2 safe even in
//      isolation: even if a future change accidentally called this function
//      on an empty turn, it could not be mistaken for a match.
describe("firstMessageMatches — fail-open regression: an empty turn is never a match", () => {
  it("rejects an empty received message outright (this used to return true)", () => {
    expect(matches("")).toBe(false);
  });

  it("rejects when expected is empty too", () => {
    expect(firstMessageMatches("", "Hi Mia! I'm Robo. Are you ready to play?", [])).toBe(false);
  });

  it("rejects whitespace-only received text (normalizes to empty)", () => {
    expect(matches("   \n\t  ")).toBe(false);
  });

  it("sequence: [empty agent turn] -> [real turn that does NOT match] still fails closed", () => {
    // Turn 1: an interrupted/zero-length agent turn. SessionView's guard
    // means this call is never actually made against the canary in
    // production (the flag isn't set yet, so the check is skipped) — but
    // proving it returns false rather than true shows the underlying
    // invariant holds even if it were.
    expect(matches("")).toBe(false);
    // Turn 2: the real first turn — an unguarded default agent's greeting
    // that merely *looks* like ours. This is the one SessionView actually
    // checks (per the fix), and it must still be rejected.
    expect(matches("Hi! I'm Robo. Are you ready to play?")).toBe(false);
  });

  it("sequence: [empty agent turn] -> [real turn that DOES match] still proceeds", () => {
    expect(matches("")).toBe(false);
    // Turn 2: the genuine override-driven first message, arriving after an
    // empty/interrupted turn. A legitimate session must not be punished for
    // that hiccup.
    expect(matches(expected)).toBe(true);
  });

  it("a legitimate Cyrillic-named session still passes after a leading empty turn", () => {
    const ruConfig = { ...config, childName: "Аня", agentName: "Робо" };
    const ru = buildFirstMessage(ruConfig);
    expect(firstMessageMatches(ru, "", [ruConfig.childName, ruConfig.agentName])).toBe(false);
    expect(firstMessageMatches(ru, ru, [ruConfig.childName, ruConfig.agentName])).toBe(true);
  });
});
