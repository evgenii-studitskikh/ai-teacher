// The languages the app can actually teach in. This is a closed union, not a
// string, on purpose: every supported language needs a greeting the child hears
// as the very first thing the agent says (see LANGUAGES in lib/prompt.ts). When
// it was a bare `string`, the language dropdown and the greeting had no
// relationship, so the agent greeted a Russian child in English. Adding a
// language here without giving it a greeting is now a compile error.
export type Language = "en" | "ru" | "es" | "de";

export type SessionConfig = {
  agentName: string;
  voiceId: string;
  childName: string;
  childAge: number;
  language: Language;
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
