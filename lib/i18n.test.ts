import { describe, expect, it } from "vitest";
import { LANGUAGE_META, STRINGS } from "./i18n";
import { LANGUAGE_CODES } from "./types";

// Completeness (every language has every key) is enforced at compile time by
// the Record types — there is nothing useful to assert about it here. What
// the type system cannot see is the CONTENT of a translation: an
// interpolation function that drops its argument, or meta that marks Hebrew
// left-to-right. Those are what these tests pin down.

describe("LANGUAGE_META", () => {
  it("has a non-empty native name for every language", () => {
    for (const code of LANGUAGE_CODES) {
      expect(LANGUAGE_META[code].nativeName.length, code).toBeGreaterThan(0);
    }
  });

  it("marks Hebrew — and only Hebrew — right-to-left", () => {
    for (const code of LANGUAGE_CODES) {
      expect(LANGUAGE_META[code].dir, code).toBe(code === "he" ? "rtl" : "ltr");
    }
  });
});

describe("interpolation functions keep their arguments", () => {
  // Names must pass through into the displayed string in every language —
  // a translation that drops the child's or the voice's name reads as
  // nonsense ("Filled in from 's last session").
  it("every per-language function embeds the name it is given", () => {
    for (const code of LANGUAGE_CODES) {
      const t = STRINGS[code];
      expect(t.profileFilled("Mia", "goal"), code).toContain("Mia");
      expect(t.profileFilled("Mia", "goal"), code).toContain("goal");
      expect(t.profileMatches("Mia"), code).toContain("Mia");
      expect(t.voiceSubstituted("Aria"), code).toContain("Aria");
      expect(t.playPreview("Aria"), code).toContain("Aria");
      expect(t.stopPreview("Aria"), code).toContain("Aria");
      expect(t.howShouldToyPlay("Buzz"), code).toContain("Buzz");
      expect(t.beTheToyDesc("Buzz"), code).toContain("Buzz");
      expect(t.helpMePlayDesc("Buzz"), code).toContain("Buzz");
      expect(t.povIntro("Buzz"), code).toContain("Buzz");
      expect(t.agentListening("Robo"), code).toContain("Robo");
      expect(t.agentTalking("Robo"), code).toContain("Robo");
      expect(t.asrAlarm("Mia"), code).toContain("Mia");
      expect(t.voicesFailed("boom."), code).toContain("boom.");
      expect(t.photoHttpError(502), code).toContain("502");
    }
  });
});
