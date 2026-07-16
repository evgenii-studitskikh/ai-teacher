import { describe, expect, it } from "vitest";
import { buildFirstMessage, buildPrompt, buildWindDownMessage } from "./prompt";
import type { Language, SessionConfig, SessionSummary, ToyInfo } from "./types";

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

const toy: ToyInfo = {
  name: "Buzz Lightyear",
  character: "a brave space-ranger action figure",
  personality: "confident, heroic, a little goofy",
  howToPlay: "blast off on pretend missions, count stars, rescue other toys",
};

const povConfig: SessionConfig = {
  ...base,
  agentName: "Buzz Lightyear", // POV: the agent speaks as the toy
  goal: "have fun exploring space together",
  directives: "Loves rockets. Praise a lot.",
  toy,
  toyMode: "pov",
};

const thirdConfig: SessionConfig = {
  ...povConfig,
  agentName: "Robo", // 3rd person: the guide keeps its own name
  toyMode: "third-person",
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

  it("tells the agent to treat garbled turns as its own mishearing", () => {
    const p = buildPrompt(base, null);
    expect(p).toContain("## Listening");
    expect(p).toContain("assume YOU misheard");
    expect(p).toContain("Never repeat garbled text back");
  });

  it("includes the Listening section in toy mode too", () => {
    expect(buildPrompt(povConfig, null)).toContain("## Listening");
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

// The agent greeted a Russian-speaking child in English: `buildFirstMessage`
// hardcoded an English sentence, and ElevenLabs speaks the `first_message`
// override verbatim — it does not translate it. (Probed against the live API:
// with `language: "ru"` and an English first message, the agent says "Hi Anya!
// I'm Robo. Are you ready to play?" out loud, while the speech recogniser is
// already listening for Russian.)
describe("the greeting is in the child's language", () => {
  const LANGUAGES: Language[] = ["en", "ru", "es", "de", "he", "tl", "uk"];

  it("greets in English when the language is English", () => {
    expect(buildFirstMessage({ ...base, language: "en" })).toBe("Hi Mia! I'm Robo. Are you ready to play?");
  });

  it("greets in Russian when the language is Russian", () => {
    const greeting = buildFirstMessage({ ...base, language: "ru" });
    expect(greeting).toMatch(/[Ѐ-ӿ]/); // Cyrillic
    // Every word we wrote is Russian. The only Latin left is the names, which
    // are whatever the parent typed and must pass through exactly as typed —
    // a child called "Mia" is called Mia in any language.
    const withoutNames = greeting.replace("Mia", "").replace("Robo", "");
    expect(withoutNames).not.toMatch(/[A-Za-z]/);
  });

  it("greets in Spanish and German too", () => {
    expect(buildFirstMessage({ ...base, language: "es" })).toContain("Hola");
    expect(buildFirstMessage({ ...base, language: "de" })).toContain("Hallo");
  });

  it("greets in Hebrew, Tagalog and Ukrainian too", () => {
    // Hebrew: Hebrew script present, and no Latin outside the names.
    const he = buildFirstMessage({ ...base, language: "he" });
    expect(he).toMatch(/[֐-׿]/);
    expect(he.replace("Mia", "").replace("Robo", "")).not.toMatch(/[A-Za-z]/);

    // Tagalog is written in Latin script.
    const tl = buildFirstMessage({ ...base, language: "tl" });
    expect(tl).toContain("Maglaro");

    // Ukrainian: Cyrillic present, and no Latin outside the names.
    const uk = buildFirstMessage({ ...base, language: "uk" });
    expect(uk).toMatch(/Привіт/);
    expect(uk.replace("Mia", "").replace("Robo", "")).not.toMatch(/[A-Za-z]/);
  });

  // The override canary compares the agent's first spoken turn against this
  // greeting AND requires both names to appear in it (lib/overrides.ts). A
  // translation that dropped a name would disable the app's only defence
  // against the child talking to an unguarded model.
  it("always contains the child's name and the agent's name", () => {
    for (const language of LANGUAGES) {
      const greeting = buildFirstMessage({ ...base, language });
      expect(greeting, language).toContain("Mia");
      expect(greeting, language).toContain("Robo");
    }
  });

  // Russian and Spanish inflect adjectives for gender, so a careless
  // translation of "Are you ready?" ("Готова"/"Готов", "¿Lista?"/"¿Listo?")
  // would assume the child's sex — which this app deliberately never does.
  it("never assumes the child's gender", () => {
    const ru = buildFirstMessage({ ...base, language: "ru" });
    expect(ru).not.toMatch(/готов/i);
    const es = buildFirstMessage({ ...base, language: "es" });
    expect(es).not.toMatch(/list[oa]/i);
    // Hebrew inflects both "ready" (מוכן/מוכנה) and the "come play"
    // imperative (בוא/בואי) for gender; the greeting must use neither.
    const he = buildFirstMessage({ ...base, language: "he" });
    expect(he).not.toMatch(/מוכנ|בוא/);
    // Ukrainian: "готовий/готова" would pick a gender, like Russian's готов.
    const uk = buildFirstMessage({ ...base, language: "uk" });
    expect(uk).not.toMatch(/готов/i);
  });
});

describe("buildPrompt states the language", () => {
  it("tells the agent which language to speak", () => {
    expect(buildPrompt({ ...base, language: "ru" }, null)).toContain("Russian");
    expect(buildPrompt({ ...base, language: "de" }, null)).toContain("German");
    expect(buildPrompt({ ...base, language: "he" }, null)).toContain("Hebrew");
    expect(buildPrompt({ ...base, language: "tl" }, null)).toContain("Tagalog");
    expect(buildPrompt({ ...base, language: "uk" }, null)).toContain("Ukrainian");
  });
});

describe("teacher personality", () => {
  it("weaves a non-empty personality into the lesson prompt", () => {
    const prompt = buildPrompt({ ...base, teacherPersonality: "A playful storyteller." }, null);
    expect(prompt).toContain("Your personality: A playful storyteller.");
  });

  it("adds no personality line when the field is absent or blank", () => {
    expect(buildPrompt(base, null)).not.toContain("Your personality:");
    expect(buildPrompt({ ...base, teacherPersonality: "   " }, null)).not.toContain("Your personality:");
  });

  it("weaves the helper's personality into a third-person toy prompt", () => {
    const prompt = buildPrompt(
      { ...thirdConfig, teacherPersonality: "Gentle and giggly." },
      null,
    );
    expect(prompt).toContain("Your personality: Gentle and giggly.");
    // The toy's own personality is still described separately.
    expect(prompt).toContain(`${toy.name}'s personality: ${toy.personality}`);
  });

  it("leaves the POV toy prompt to the toy's own personality", () => {
    const prompt = buildPrompt(
      { ...povConfig, teacherPersonality: "Should not appear." },
      null,
    );
    expect(prompt).not.toContain("Should not appear.");
  });
});

describe("buildPrompt — toy mode", () => {
  it("POV: tells the agent it IS the toy, in first person", () => {
    const p = buildPrompt(povConfig, null);
    expect(p).toContain("You ARE Buzz Lightyear");
    expect(p).toContain("first person");
    expect(p).toContain("blast off on pretend missions");
    expect(p).toContain("Mia");
  });

  it("3rd person: the agent guides play and is NOT the toy", () => {
    const p = buildPrompt(thirdConfig, null);
    expect(p).toContain("Robo");
    expect(p).toContain("Buzz Lightyear");
    expect(p).toContain("NOT the toy");
  });

  it("keeps the child-safety guardrails and swaps the real-person line for the toy-play one", () => {
    for (const cfg of [povConfig, thirdConfig]) {
      const p = buildPrompt(cfg, null);
      expect(p).toContain("wonderful question for their mum or dad");
      expect(p).toContain("Never ask for personal information");
      expect(p).toContain("never claim to be a real living person");
      expect(p).not.toContain("Never claim to be a real person");
    }
  });

  it("states the language in toy mode too", () => {
    expect(buildPrompt({ ...povConfig, language: "ru" }, null)).toContain("Russian");
  });

  const GENDERED_TOY = /\b(she|her|hers|herself|he|him|his|himself)\b/i;
  const neutralToy: SessionConfig = { ...povConfig, directives: "Loves rockets. Praise a lot." };
  for (const [label, cfg] of [
    ["pov", neutralToy],
    ["third-person", { ...neutralToy, agentName: "Robo", toyMode: "third-person" } as SessionConfig],
  ] as const) {
    it(`contains no gendered pronoun: ${label}`, () => {
      expect(buildPrompt(cfg, null)).not.toMatch(GENDERED_TOY);
    });
  }
});
