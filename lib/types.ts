export type SessionConfig = {
  agentName: string;
  voiceId: string;
  childName: string;
  childAge: number;
  language: string;
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
