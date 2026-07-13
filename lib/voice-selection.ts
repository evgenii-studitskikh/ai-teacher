// Deciding which voice the child actually gets.
//
// This is pulled out of ConfigForm as a pure function because the bug it
// exists to prevent is a *timing* bug, and timing bugs are exactly what a
// component's inline logic hides. The two data sources arrive hundreds of
// milliseconds apart:
//
//   /api/profiles/list  — a local readdir. Single-digit milliseconds.
//   /api/voices         — a proxied ElevenLabs HTTP call. Hundreds of ms.
//
// So the saved-child cards are on screen, tappable, and being tapped *before*
// the voices list exists. Any code that validates a saved voiceId against the
// voices array without first asking "has that array actually loaded?" is
// really asking "is this voice in the empty list?", to which the answer is
// always no. The old ConfigForm did exactly that, concluded the child's saved
// voice had been deleted, and replaced it with a substitute — silently.
//
// Hence `kind: "wait"`. An unloaded list is not evidence of anything, and the
// only correct action on no evidence is to leave the parent's saved choice
// alone until evidence arrives.

export type VoiceOption = { voiceId: string; name: string };

export type VoiceResolution =
  // The voices list hasn't loaded yet. Do NOT touch voiceId: we cannot tell a
  // deleted voice from a not-yet-fetched one, and guessing means handing the
  // child a different teacher's voice.
  | { kind: "wait" }
  // The current selection is a real voice in the account. Nothing to do.
  | { kind: "keep" }
  // Nothing was selected at all (a fresh form). Pick a default. This is not a
  // substitution — no saved choice was overridden — so it needs no announcement.
  | { kind: "select"; voiceId: string }
  // A voice *was* selected, the list has loaded, and the selection genuinely
  // is not in it: the voice was deleted from the ElevenLabs account since the
  // profile was saved. We must fall back to a real voice (otherwise Start
  // stays enabled while no radio is checked, and the parent hits the browser's
  // opaque "select one of these options" bubble) — but the parent has to be
  // TOLD, because their child is about to be taught by a different voice than
  // the one they chose.
  | { kind: "substitute"; voiceId: string; name: string };

export function resolveVoiceSelection(currentVoiceId: string, voices: VoiceOption[]): VoiceResolution {
  if (voices.length === 0) return { kind: "wait" };
  if (currentVoiceId && voices.some((v) => v.voiceId === currentVoiceId)) return { kind: "keep" };
  const fallback = voices[0];
  if (!currentVoiceId) return { kind: "select", voiceId: fallback.voiceId };
  return { kind: "substitute", voiceId: fallback.voiceId, name: fallback.name };
}
