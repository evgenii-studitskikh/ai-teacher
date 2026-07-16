// The languages the app can teach AND display in. This is a closed union
// derived from one const list, on purpose: every supported language needs a
// greeting the child hears as the very first thing the agent says (see
// LANGUAGES in lib/prompt.ts) and a full UI translation (see STRINGS in
// lib/i18n.ts). When it was a bare `string`, the language dropdown and the
// greeting had no relationship, so the agent greeted a Russian child in
// English. Adding a code here without giving it both is now a compile error.
export const LANGUAGE_CODES = ["en", "ru", "es", "de", "he", "tl", "uk"] as const;
export type Language = (typeof LANGUAGE_CODES)[number];

// Narrows a bare string to the union — for values read back from storage or
// a <select>, the two places a cast would otherwise creep in.
export function isLanguage(value: unknown): value is Language {
  return typeof value === "string" && (LANGUAGE_CODES as readonly string[]).includes(value);
}

export type SessionConfig = {
  agentName: string;
  voiceId: string;
  childName: string;
  childAge: number;
  language: Language;
  goal: string;
  directives: string;
  minutes: number;
  // Which saved kid/teacher this session was assembled from, for the session
  // record. Optional: nothing downstream depends on them.
  kidId?: string;
  teacherId?: string;
  // The teacher's personality prose, woven into the prompt when present.
  teacherPersonality?: string;
  // Present only for an Interactive Toy session. Their presence is what puts
  // buildPrompt into toy mode; absent, everything behaves as a normal lesson.
  toy?: ToyInfo;
  toyMode?: ToyMode;
};

export type ToyMode = "pov" | "third-person";

// What the vision model returns for a photographed toy, and what the toy-mode
// prompt is built from. Kept deliberately small: a name the agent introduces
// itself as, a one-line character, a personality, and grounded play ideas.
export type ToyInfo = {
  name: string; // "Buzz Lightyear"
  character: string; // "a brave space-ranger action figure"
  personality: string; // "confident, heroic, a little goofy"
  howToPlay: string; // grounded suggestions for play with this toy
};

// A child, as a first-class entity. Previously a "kid" was implicitly the last
// SessionConfig saved under a name; now name and age live here and the rest of
// a session's settings are assembled at start time.
export type Kid = {
  id: string; // crypto.randomUUID()
  name: string;
  age: number; // 2–12
  createdAt: string; // ISO
};

export type TeacherKind = "preset" | "custom" | "toy";

// A teacher profile. Presets live in code (lib/preset-teachers.ts) and are
// never stored; custom and toy teachers are stored in localStorage. A toy
// teacher is a scanned POV toy made reusable: its ToyInfo rides along and puts
// buildPrompt into toy mode when the session starts.
export type Teacher = {
  id: string; // uuid for stored teachers; "preset:<name>" for presets
  kind: TeacherKind;
  name: string;
  voiceId: string | null; // null = resolve automatically at start
  personality: string; // free-form English prose, woven into the prompt
  toy?: ToyInfo; // only for kind "toy"
  createdAt: string; // "" for presets (stable, never rendered)
};

// What the start sheet pre-fills for a kid: everything their previous session
// chose. Keyed by kid id in storage.
export type LastStart = {
  teacherId: string;
  goal: string;
  directives: string;
  minutes: number;
};

export type TranscriptTurn = {
  role: "agent" | "child";
  text: string;
  at: number; // ms since session start
};

export type SessionSummary = {
  whatWeDid: string;
  grasped: string[];
  struggled: string[];
  nextFocus: string;
  engagement: "low" | "medium" | "high";
  transcriptQuality: "good" | "poor";
};

export type SavedSession = {
  config: SessionConfig;
  transcript: TranscriptTurn[];
  summary: SessionSummary | null;
  startedAt: string;
  endedAt: string;
};
