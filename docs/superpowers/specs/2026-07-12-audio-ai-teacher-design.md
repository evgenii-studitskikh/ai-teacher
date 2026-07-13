# Audio AI Teacher — Design

**Date:** 2026-07-12
**Status:** Approved, ready for implementation planning

## Summary

A local web app that lets a parent configure a voice AI agent and hand it to their child for a short, spoken, one-on-one lesson. The parent sets the agent's name, voice, the child's name, age, language, the learning goal, and free-text directives. The child talks to the agent through the browser. The parent watches a live transcript and can end the session at any moment. Afterwards the transcript is saved and summarized, and the summary seeds the next session.

## Goals

- A parent can configure and start a spoken lesson in under a minute.
- The child holds a real two-way voice conversation with the agent.
- Sessions are time-boxed and end warmly rather than being cut off.
- Each session produces a summary that makes the next session better.
- The parent can see and stop everything, in real time.

## Non-goals (explicitly out of scope for the MVP)

No accounts, auth, or multi-tenancy. No deployment — runs locally. No lesson authoring or curriculum system. No billing. No moderation model. No mobile or native app. No multi-child dashboard.

## Users

- **Parent** — configures the agent, supervises, reads summaries. The operator.
- **Child** — talks to the agent. Never touches the config.

## Key technical decisions

### One agent, configured per session

A single ElevenLabs agent is created once by hand in the dashboard. It is not recreated per topic or per child. Everything configurable is passed at session start:

- **Overrides** — system prompt, first message, `language`, and `voice_id`.
- **Dynamic variables** — `agent_name`, `child_name`, `child_age`, `goal`, `directives`, `last_session_summary`, `minutes`.

This means there is no agent-management layer to build. "Configuring the agent" is building a prompt string and a voice ID.

**Setup prerequisite:** overrides must be explicitly enabled per-field in the agent's security settings in the ElevenLabs dashboard, or they are silently ignored. This is a documented step in `SETUP.md`.

### ElevenLabs owns the real-time loop

STT, the LLM, TTS, and turn-taking all happen inside the ElevenLabs Agents Platform session. Audio never routes through our server. Our server exists only to mint signed URLs, to persist sessions, and to call Claude for summaries.

The transport is a **WebSocket**: the client starts the session with a signed URL (`startSession({ signedUrl })`), and passing a signed URL is what selects the websocket connection type in the SDK. (Not WebRTC — that path takes a conversation token instead.)

### Claude owns the summary

Claude (Anthropic API) generates the post-session summary from the saved transcript. Chosen over ElevenLabs' built-in post-call analysis because the summary → next-session-prompt loop is the part most worth iterating on, and it needs a prompt we control.

### Keys never reach the browser

Both the ElevenLabs and Anthropic keys live in `.env.local` and are used server-side only. The browser holds only a short-lived signed URL.

## Architecture

**Stack:** Next.js (App Router), TypeScript, `@elevenlabs/react`, `@anthropic-ai/sdk`. Local only, `npm run dev`.

### Components

| Component | Responsibility | Depends on |
|---|---|---|
| `lib/prompt.ts` | Pure function: config + last summary → system prompt string. No I/O. | nothing |
| `lib/storage.ts` | Read/write profiles and sessions as JSON files. The only disk access. | fs |
| `app/api/signed-url/route.ts` | Mint an ElevenLabs signed URL. | ElevenLabs key |
| `app/api/voices/route.ts` | List the user's ElevenLabs voices for the picker. | ElevenLabs key |
| `app/api/sessions/route.ts` | Write a finished session's transcript to disk (no summary yet); return its path. | storage |
| `app/api/summarize/route.ts` | Transcript → Claude → structured summary → attached to that saved session. | Anthropic key, storage |
| Config form (UI) | Collect and persist `SessionConfig`. | voices API, storage |
| Session view (UI) | Live transcript, timer, End button. | `@elevenlabs/react` |
| Summary view (UI) | Show the post-session summary. | summarize API |

### Session flow

1. Parent fills the config form. Saved to `data/profiles/<child>.json` for reuse.
2. Parent hits Start. Client requests a signed URL from `/api/signed-url`.
3. Client calls `startSession()` over the websocket with the signed URL and the overrides (rendered prompt, first message, language, `voice_id`). No dynamic variables are sent: `buildPrompt`/`buildFirstMessage` interpolate the config directly, so there are no placeholders left to fill.
4. Conversation runs. ElevenLabs handles mic, STT, LLM, TTS, turn-taking. The agent's first turn is checked against the first message we overrode: if it does not match, the overrides are not enabled on the agent, the session is aborted at once and the parent is told what to enable (see Safety).
5. Client renders the live transcript from SDK message events; an End session button is always visible.
6. At 80% of `minutes`, the client sends a contextual update to the session: time is nearly up, begin wrapping up.
7. Session ends — by the child, by the clock, or by the parent.
8. Client POSTs the transcript to `/api/sessions`, which writes `data/sessions/<childName>--<timestamp>.json` (transcript, `summary: null`) and returns its path. Nothing else happens until this succeeds; if it fails, the parent is told the transcript is *not* saved and can retry.
9. Only then does the client POST to `/api/summarize` with that path. Claude's summary is attached to the same file.
10. The next session for that child loads the newest summary and injects it into the prompt as the "Last time" section.

## Data model

```ts
type SessionConfig = {
  agentName: string;   // "Robo"
  voiceId: string;     // from the parent's ElevenLabs voice library
  childName: string;   // "Mia"
  childAge: number;    // 5
  language: string;    // "en" | "ru" | ...
  goal: string;        // "Count to 10"
  directives: string;  // free text from the parent
  minutes: number;     // 10
};

type TranscriptTurn = {
  role: "agent" | "child";
  text: string;
  at: number;          // ms since session start
};

type SessionSummary = {
  whatWeDid: string;                    // one or two sentences, for the parent
  grasped: string[];                    // "counts 1-5 confidently"
  struggled: string[];                  // "7 and 8", "lost interest after 6 min"
  nextFocus: string;                    // seeds the next session's prompt
  engagement: "low" | "medium" | "high";
  transcriptQuality: "good" | "poor";   // ASR health canary
};

type SavedSession = {
  config: SessionConfig;
  transcript: TranscriptTurn[];
  summary: SessionSummary | null;       // null if summarization failed
  startedAt: string;                    // ISO
  endedAt: string;                      // ISO
};
```

`transcriptQuality` exists so the parent learns that speech recognition is failing without having to read every transcript. Child speech recognition is the project's largest technical risk; this is the cheapest possible instrument for it.

## The prompt template

`buildPrompt(config, lastSummary)` assembles a system prompt from these sections:

- **Identity** — the agent is `agentName`, a warm, playful teacher talking with `childName`, aged `childAge`.
- **Goal** — today's goal is `goal`; reach it through play, not drilling.
- **Age-adaptive rules** — branch on `childAge`:
  - **Under 6:** ask one short question at a time; prefer yes/no and one-word answers; expect to mishear and re-ask cheerfully rather than pressing; never say "I don't understand" twice in a row — change the question instead.
  - **6 and over:** free-form back-and-forth is allowed; the agent may rely on understanding full answers.
- **Directives** — the parent's free text, inserted verbatim.
- **Continuity** — `lastSummary` when one exists, phrased as what happened last time. Omitted cleanly when absent.
- **Guardrails** — stay on topic; keep everything age-appropriate; if the child raises something big or upsetting (death, scary news, family matters), warmly say it is a wonderful question for their mum or dad and gently return to the lesson; never claim to be a real person; never ask for personal information.
- **Time-box** — the agent has roughly `minutes` minutes; when told time is nearly up, it praises something specific the child did and says a warm goodbye.

The agent has no clock. The wind-down is driven by a client-side timer sending a contextual update, not by the model tracking time itself.

## Safety

Prompt-level guardrails (above) plus a hard stop: the live transcript is always on screen and an End session button is always visible. The parent is present. No moderation model in the MVP.

Every guardrail reaches the agent as an *override*, and an agent whose dashboard Security settings do not permit overrides ignores them silently — the child would then be talking to the raw default agent with no guardrails at all. So the client runs a canary: the agent's first turn must be the first message we sent (compared tolerantly — case, punctuation and whitespace insensitive, but the child's and agent's names must appear). A mismatch aborts the session immediately and tells the parent which dashboard setting to enable. Fail closed.

The prompt never assumes the child's gender: there is no gender field, and every string the agent is given uses the child's name or singular "they". A unit test asserts the prompt contains no gendered pronoun.

## Error handling

- **Mic permission denied** — caught before `startSession()`, surfaced in plain language.
- **Session drops mid-conversation** — surfaced clearly; whatever transcript exists is still summarized. A dropped call must not lose the session.
- **Summary call fails** — the transcript is written to disk *before* Claude is called, so a failure costs the summary, never the session. `summary` stays `null` and a Retry button re-runs it.

Everything else may throw.

## Testing

- `buildPrompt()` — real unit tests. It is pure, it is the most-edited code, and it fails silently. Assert: the age branch flips at 6; directives appear; `lastSummary` appears when present and produces a clean prompt when absent.
- `lib/storage.ts` — round-trip tests.
- The conversation itself is not unit-tested. Mocking a real-time audio session buys nothing; it is tested by the child.

## Risks

1. **ASR on young children.** The largest risk. Speech models are trained on adult speech. Mitigated by: age-adaptive prompting that tolerates bad transcripts, the live transcript, and the `transcriptQuality` field. The first milestone of implementation is a working talking agent precisely so this can be tested with a real child before anything is built on top of it.
2. **A non-native accent compounds the above.** Mitigated by setting the session `language` explicitly.
3. **Cost.** ElevenLabs conversational minutes are metered. Irrelevant at family scale; would need rethinking if this ever became a product.

## Implementation milestones

1. **Talking agent.** Next.js app, signed URL route, hardcoded config, `startSession()`. Goal: a voice answers. **Then test with the child before continuing.**
2. **Config form + voice picker + prompt template.** All parent-facing configuration works.
3. **Live transcript, timer, wind-down signal, End button.**
4. **Persistence + Claude summary + continuity into the next session.**
