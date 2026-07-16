import type { ToyInfo } from "./types";

// The slice of a voice the matching prompt needs. Shapes match what
// /api/voices passes through from ElevenLabs v2.
export type VoiceCatalogEntry = {
  voiceId: string;
  name: string;
  labels?: Record<string, string>;
  description?: string | null;
};

// A compact catalog for the vision model to pick from. Ids are what it must
// return, so they lead each line.
export function voiceCatalogPrompt(voices: VoiceCatalogEntry[]): string {
  return voices
    .map((v) => {
      const hints = [
        ...Object.entries(v.labels ?? {}).map(([k, val]) => `${k}: ${val}`),
        ...(v.description ? [v.description] : []),
      ].join("; ");
      return `- id "${v.voiceId}" — ${v.name}${hints ? ` (${hints})` : ""}`;
    })
    .join("\n");
}

// The model returns ids as free text; only an id that exists in the catalog it
// was shown may ever reach a Teacher record.
export function validateVoiceId(
  id: string | null | undefined,
  voices: VoiceCatalogEntry[],
): string | null {
  if (!id) return null;
  return voices.some((v) => v.voiceId === id) ? id : null;
}

// Voice Design requires a 20–1000 character description. Compose one from the
// toy, pad the degenerate short case, clamp the long one.
export function buildVoiceDescription(toy: ToyInfo): string {
  let d = `The voice of ${toy.name}, ${toy.character}. Sounds ${toy.personality}. A warm, friendly voice for a young child's toy.`;
  if (d.length < 20) d = d + " Gentle, playful and kind.";
  return d.slice(0, 1000);
}
