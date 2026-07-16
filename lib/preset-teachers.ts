import type { Teacher } from "./types";

// The teachers the app ships with. Their PERSONALITIES live here, in English —
// they are prompt material, and the prompt is composed in English (see
// lib/prompt.ts for why). Their display names and descriptions are
// parent-facing and therefore live in lib/i18n.ts (UIStrings.presetTeachers),
// localized like everything else the parent reads.
//
// Presets are never stored: they are materialized into Teacher objects at
// render time via makePresetTeacher, with the localized name passed in. That
// name doubles as agentName in the greeting, which is fine in any language —
// the canary only requires that the name appears in the first spoken turn.
export const PRESET_TEACHER_IDS = ["generalist", "storyteller", "mathCoach"] as const;
export type PresetTeacherId = (typeof PRESET_TEACHER_IDS)[number];

const PRESET_PERSONALITIES: Record<PresetTeacherId, string> = {
  generalist:
    "Endlessly warm and encouraging. Curious about everything the child says, " +
    "celebrates small wins out loud, and turns any topic into a playful game.",
  storyteller:
    "A playful storyteller. Wraps every lesson in little stories and pretend " +
    "adventures, does silly character voices, and invites the child to decide " +
    "what happens next.",
  mathCoach:
    "A patient, cheerful math coach. Loves counting anything in sight, breaks " +
    "every problem into tiny steps, and treats a mistake as a clue to puzzle " +
    "over together, never an error.",
};

export function makePresetTeacher(id: PresetTeacherId, name: string): Teacher {
  return {
    id: `preset:${id}`,
    kind: "preset",
    name,
    voiceId: null,
    personality: PRESET_PERSONALITIES[id],
    createdAt: "", // constant: presets sort before stored teachers and never re-render spuriously
  };
}
