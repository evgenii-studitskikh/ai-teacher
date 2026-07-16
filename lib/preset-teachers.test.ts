import { describe, expect, it } from "vitest";
import { PRESET_TEACHER_IDS, makePresetTeacher } from "./preset-teachers";

describe("preset teachers", () => {
  it("builds a well-formed Teacher for every preset", () => {
    for (const id of PRESET_TEACHER_IDS) {
      const t = makePresetTeacher(id, "Sunny");
      expect(t.id).toBe(`preset:${id}`);
      expect(t.kind).toBe("preset");
      expect(t.name).toBe("Sunny");
      expect(t.voiceId).toBeNull(); // presets never hardcode a voice
      expect(t.personality.length).toBeGreaterThan(20);
      expect(t.toy).toBeUndefined();
    }
  });

  it("has unique ids", () => {
    expect(new Set(PRESET_TEACHER_IDS).size).toBe(PRESET_TEACHER_IDS.length);
  });

  it("keeps personalities free of gendered pronouns about the child", () => {
    for (const id of PRESET_TEACHER_IDS) {
      const p = makePresetTeacher(id, "X").personality.toLowerCase();
      for (const pronoun of [" he ", " she ", " him ", " her ", " his ", " hers "]) {
        expect(p).not.toContain(pronoun);
      }
    }
  });
});
