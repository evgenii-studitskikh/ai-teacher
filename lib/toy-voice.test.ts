import { describe, expect, it } from "vitest";
import { buildVoiceDescription, validateVoiceId, voiceCatalogPrompt } from "./toy-voice";
import type { ToyInfo } from "./types";
import type { VoiceCatalogEntry } from "./toy-voice";

const voices: VoiceCatalogEntry[] = [
  { voiceId: "v1", name: "Bella", labels: { age: "young", gender: "female" }, description: "bright and airy" },
  { voiceId: "v2", name: "Rex", labels: {}, description: null },
];

const toy: ToyInfo = {
  name: "Buzz",
  character: "a space ranger",
  personality: "confident, heroic",
  howToPlay: "fly around",
};

describe("voiceCatalogPrompt", () => {
  it("lists every voice with id, name and hints", () => {
    const p = voiceCatalogPrompt(voices);
    expect(p).toContain("v1");
    expect(p).toContain("Bella");
    expect(p).toContain("age: young");
    expect(p).toContain("bright and airy");
    expect(p).toContain("v2");
  });
});

describe("validateVoiceId", () => {
  it("passes an id that is in the catalog", () => {
    expect(validateVoiceId("v2", voices)).toBe("v2");
  });
  it("rejects an id that is not in the catalog", () => {
    expect(validateVoiceId("hallucinated", voices)).toBeNull();
  });
  it("rejects null/undefined", () => {
    expect(validateVoiceId(null, voices)).toBeNull();
    expect(validateVoiceId(undefined, voices)).toBeNull();
  });
});

describe("buildVoiceDescription", () => {
  it("describes the toy from its character and personality", () => {
    const d = buildVoiceDescription(toy);
    expect(d).toContain("space ranger");
    expect(d).toContain("confident");
  });
  it("is always within Voice Design's 20–1000 char bounds", () => {
    const tiny = buildVoiceDescription({ name: "X", character: "a", personality: "b", howToPlay: "" });
    expect(tiny.length).toBeGreaterThanOrEqual(20);
    const huge = buildVoiceDescription({ ...toy, personality: "x".repeat(2000) });
    expect(huge.length).toBeLessThanOrEqual(1000);
  });
});
