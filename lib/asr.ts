import type { SessionConfig } from "./types";

// The words ElevenLabs' ASR is most likely to garble are exactly the ones
// every session repeats constantly: the child's name, the agent's name, and
// the toy's name. These become `asr.keywords` (recognition biasing) on the
// agent before each session. Deliberately minimal — no mining of the
// free-text goal (YAGNI, and noisy keywords dilute the boost).
//
// Input is the request body of /api/signed-url, i.e. untrusted JSON — so
// this validates shape defensively instead of assuming SessionConfig.
export function buildAsrKeywords(config: unknown): string[] {
  if (typeof config !== "object" || config === null) return [];
  const c = config as Partial<SessionConfig>;
  const keywords: string[] = [];
  for (const raw of [c.childName, c.agentName, c.toy?.name]) {
    if (typeof raw !== "string") continue;
    const word = raw.trim();
    if (word && !keywords.includes(word)) keywords.push(word);
  }
  return keywords;
}
