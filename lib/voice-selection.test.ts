import { describe, expect, it } from "vitest";
import { resolveVoiceSelection, type VoiceOption } from "./voice-selection";

const VOICES: VoiceOption[] = [
  { voiceId: "voice-aria", name: "Aria" },
  { voiceId: "voice-mia", name: "Mia" },
];

describe("resolveVoiceSelection", () => {
  it("waits instead of judging a saved voice against a list that has not loaded", () => {
    // THE BUG. The saved-child cards (local readdir, ~1ms) render long before
    // /api/voices (remote HTTP, ~100s of ms) resolves, so this is the state the
    // parent is in when they tap a card. The old code ran `voices.some(...)`
    // against [] here, concluded the voice was gone, and blanked it.
    expect(resolveVoiceSelection("voice-mia", [])).toEqual({ kind: "wait" });
  });

  it("keeps the saved voice once the list arrives and contains it", () => {
    expect(resolveVoiceSelection("voice-mia", VOICES)).toEqual({ kind: "keep" });
  });

  it("walks the real timeline: tap card while loading -> voices resolve -> saved voice survives", () => {
    // t0: cards are up, voices are not. Parent taps "Mia".
    const whileLoading = resolveVoiceSelection("voice-mia", []);
    expect(whileLoading).toEqual({ kind: "wait" });

    // "wait" means ConfigForm leaves config.voiceId exactly as applyCard set
    // it, so the id carried into the next step is still the child's own.
    const afterTap = "voice-mia";

    // t1: /api/voices lands. The saved voice is validated for the first time.
    expect(resolveVoiceSelection(afterTap, VOICES)).toEqual({ kind: "keep" });
    // The child is taught by Mia — not by voices[0], "Aria".
  });

  it("picks a default for a fresh form without calling it a substitution", () => {
    expect(resolveVoiceSelection("", VOICES)).toEqual({ kind: "select", voiceId: "voice-aria" });
  });

  it("substitutes AND reports it when the saved voice was really deleted", () => {
    expect(resolveVoiceSelection("voice-deleted", VOICES)).toEqual({
      kind: "substitute",
      voiceId: "voice-aria",
      name: "Aria",
    });
  });

  it("never resolves to an empty voiceId while any voice exists, so Start cannot be enabled with nothing checked", () => {
    for (const saved of ["", "voice-deleted", "voice-mia"]) {
      const r = resolveVoiceSelection(saved, VOICES);
      if (r.kind === "select" || r.kind === "substitute") expect(r.voiceId).toBeTruthy();
    }
  });
});
