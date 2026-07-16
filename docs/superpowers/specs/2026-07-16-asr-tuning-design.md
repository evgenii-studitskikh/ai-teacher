# ASR Tuning for Child Speech — Design

**Date:** 2026-07-16
**Status:** Approved

## Problem

Speech recognition in live sessions is noticeably worse than what the parent
experiences in the ChatGPT app. The agent mishears the child during the
conversation, in both English and Russian sessions. The root cause is the
quality of ElevenLabs' built-in ASR on a young child's voice, potentially
compounded by the agent running default ASR settings.

We do not control the ASR model directly — ElevenLabs Conversational AI is an
integrated pipeline — but the agent's `conversation_config.asr` and
`conversation_config.turn` are tunable via the agent PATCH API, and the docs
confirm the knobs we need: `provider: "scribe_realtime"` (their newest ASR),
`quality: "high"`, `keywords` (recognition biasing), and turn settings such as
`retranscribe_on_turn_timeout`.

**Decision made during brainstorming:** tune ElevenLabs first. If results are
still poor, phase 2 is a custom pipeline (OpenAI STT → LLM → ElevenLabs TTS) —
a separate design. ElevenLabs does not accept an external ASR plugged into its
agent pipeline, so "OpenAI for recognition only" means rebuilding the
conversation loop; that is deliberately out of scope here.

## Design

### 1. Per-session ASR upgrade in the signed-url route

`app/api/signed-url/route.ts` changes from GET to POST and receives the
session's `SessionConfig` in the request body (`SessionView.tsx` already has
`config` in scope at the call site).

Before minting the signed URL, the route PATCHes the agent's
`conversation_config`:

- `asr.provider: "scribe_realtime"`
- `asr.quality: "high"`
- `asr.keywords: buildAsrKeywords(config)`
- `turn.retranscribe_on_turn_timeout: true`, plus patient turn settings —
  children pause mid-sentence; without this the ASR commits a half-heard
  turn. Exact field names/values are verified against the current SDK during
  implementation, not assumed.

`buildAsrKeywords(config)` is a new pure function in `lib/` returning
`[childName, agentName, toy?.name]`, deduplicated, blanks removed. Keywords
are deliberately minimal — no mining of the free-text `goal` field.

Why per-session rather than a one-off configuration script: the agent is in a
known-good state at every session start, and keywords can vary per session
(different child name, different toy). Cost is one extra API call at session
start. This is a single-family app, so there are no concurrent-session races
on the shared agent config.

**Error handling:** if the PATCH fails, log a warning and still return the
signed URL. A session running with stale ASR config beats no session. The
overrides canary in `SessionView.tsx` is unaffected — it validates the first
agent message, not ASR settings.

### 2. Prompt hardening in `lib/prompt.ts`

Add guidance to the system prompt: the speaker is a child of `childAge` with
immature pronunciation; when a turn arrives garbled or nonsensical, playfully
ask the child to say it again rather than guessing or quoting the garbled
text back. Must follow the file's existing structure and its no-gender rule
(address the child by name or singular they; never infer pronouns).

### 3. Testing

- Unit tests for `buildAsrKeywords`: toy present/absent, deduplication,
  blank names.
- `lib/prompt.test.ts`: assert the new child-speech guidance appears in the
  built prompt, matching the existing test style.
- Route test for the signed-url POST with a mocked ElevenLabs client:
  asserts the PATCH payload (provider, quality, keywords), and that a PATCH
  failure still returns a signed URL.

### 4. Success criteria and measurement

The summarize route already classifies each session's
`transcriptQuality: "good" | "poor"`. After this ships, run several English
and Russian sessions:

- **Success:** transcripts come back `good` and the agent stops responding to
  things the child didn't say.
- **Failure:** recognition is still visibly poor → trigger phase 2 (custom
  OpenAI-STT pipeline, separate brainstorm/design).

## Out of scope

- Replacing the voice pipeline (phase 2, only if tuning fails).
- ElevenLabs dashboard language presets — the PATCH sets ASR config directly.
- Keyword mining from the `goal` free text.
