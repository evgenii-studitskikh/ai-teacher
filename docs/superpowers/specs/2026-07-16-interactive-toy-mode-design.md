# Interactive Toy Mode — Design

**Date:** 2026-07-16
**Status:** Approved, ready for planning

## Summary

Add a second way to start a session: instead of configuring a lesson, the parent
photographs a real physical toy, an AI vision model identifies it and builds a
child-safe persona, and the voice agent then either **becomes the toy** (POV) or
acts as a **guide who helps the child play with the toy** (3rd Person). After the
toy is confirmed, the parent fills in the same purpose/voice/child fields the
existing lesson flow already uses, and the session, end, and summary screens run
unchanged.

This reuses the entire existing session pipeline (`SessionView → EndView →
SummaryView`) and — importantly — leaves the ElevenLabs override **safety canary**
completely untouched.

## Background & constraints

The app (see `AGENTS.md`, `README.md`) is a Next.js voice teacher built on the
ElevenLabs Agents platform, with three hard constraints this design must respect:

1. **Stateless server, browser-only storage.** No database; profiles/sessions
   live in `localStorage` (`lib/browser-storage.ts`). New data must be optional
   so existing saved records still parse.
2. **The override canary is load-bearing** (`lib/overrides.ts`,
   `SessionView.tsx`). Everything that makes the app safe for a child — system
   prompt, first message, language, voice — is sent to ElevenLabs as a session
   *override*. If overrides are disabled on the agent, ElevenLabs silently
   ignores them and the child talks to an unguarded default agent. The only
   defence is comparing the agent's **first spoken turn** against
   `buildFirstMessage(config)` and requiring both the child's name and the
   agent's name to appear. **This design does not modify that mechanism.**
3. **Passcode gate.** `proxy.ts` gates every route including `/api/*`, so the new
   API route is protected automatically with no extra work.

## Original UX (from the request)

1. A UI element to switch into Interactive Toy mode.
2. Parent scans / captures a real physical toy.
3. The AI derives the toy's data.
4. Show the toy info; parent confirms.
5. Prefill the AI-teacher context; parent adds the interaction purpose, as today.
6. Two interaction modes: **POV** (agent acts as the toy) and **3rd Person**
   (agent acts as a guide helping the child play with the toy).

### Decisions taken during brainstorming

- **Toy identification is vision-based, not barcode-lookup.** A raw UPC/EAN is
  just a number an LLM cannot reliably map to a product. Instead the parent
  **photographs the toy** and Anthropic's vision model identifies it and builds
  the persona. (This reinterprets step 2 "scan a barcode" as "photograph the
  toy" — the reliable path to the same goal.)
- **Capture uses a native camera input** (`<input type="file" accept="image/*"
  capture="environment">`): opens the OS camera on phones/tablets, a file
  picker on desktop, zero extra libraries, works in every browser including
  Safari.

## Architecture

Top-level flow today (`app/page.tsx`) is state-switched:
`ConfigForm → SessionView → EndView → SummaryView`.

Toy mode inserts three light screens **before** a prefilled config step, then
rejoins the existing pipeline:

```
Landing (mode picker: Lesson | Interactive Toy)
  └─ Interactive Toy
       ├─ Scan screen        (native camera → /api/identify-toy)
       ├─ Toy confirmation   (Use this toy | Retake | manual name)
       └─ Toy config         (prefilled ConfigForm + purpose + mode radio)
              └─ SessionView → EndView → SummaryView   (unchanged)
```

### Screens

1. **Mode picker** — on the landing screen, above the existing "Pick up where
   you left off" cards: **Lesson** (today's flow, unchanged) vs **Interactive
   Toy**. This is the "UI element to turn to Interactive Toy mode."
2. **Scan screen** — a single "📷 Take a photo of the toy" button. The captured
   image is downscaled client-side and POSTed to `/api/identify-toy`.
3. **Toy confirmation** — shows the identified toy (name, character, one-line
   description) with **Use this toy** / **Retake photo**. If the model reports no
   toy (`recognized: false`), it says so and offers retake or manual name entry.
4. **Toy config** — the existing `ConfigForm` shape, prefilled from the toy. The
   parent adds the **interaction purpose** (existing Goal + Extra-instructions
   fields) and picks the **interaction mode** (POV vs 3rd Person). Child
   name/age, language, voice, and session length behave exactly as today.
5. **Session / End / Summary** — unchanged; `SessionView` already just consumes a
   `SessionConfig`.

## Data model (`lib/types.ts`)

Two additions to `SessionConfig`, both **optional** so every existing saved
profile/session still parses. A session is in toy mode iff `config.toy` is set.

```ts
export type ToyMode = "pov" | "third-person";

export type ToyInfo = {
  name: string;         // "Buzz Lightyear"
  character: string;    // short persona: "a brave space-ranger action figure"
  personality: string;  // "confident, heroic, a little goofy"
  howToPlay: string;    // grounded suggestions for play with this toy
};

// added to SessionConfig:
toy?: ToyInfo;
toyMode?: ToyMode;
```

## The two modes and the canary (no canary changes)

The canary requires the first spoken turn to contain `childName` **and**
`agentName`. We satisfy it by making `agentName` hold whatever name the agent
introduces itself as:

- **POV mode** — the agent *is* the toy. In the toy config the "Agent name" field
  is prefilled with the toy's name and relabeled ("How the toy introduces
  itself"). The existing greeting `"Hi {child}! I'm {agent}. Are you ready to
  play?"` becomes *"Hi Sasha! I'm Buzz Lightyear. Are you ready to play?"* →
  canary requires `childName` + `Buzz Lightyear`, both present. ✅
- **3rd-Person mode** — the agent is a friendly guide (default "Robo"). Greeting
  → *"Hi Sasha! I'm Robo. Are you ready to play?"* → canary requires `childName`
  + `Robo`. ✅

Therefore `buildFirstMessage` and the entire canary in `lib/overrides.ts` /
`SessionView.tsx` are **unchanged**. The only prompt change is a new toy-mode
branch in `buildPrompt` (`lib/prompt.ts`):

- **POV:** "You ARE {toy.name}, {toy.character}. You are a toy {child} is holding
  and playing with. Speak in first person as the toy…" + `personality` +
  `howToPlay`.
- **3rd-Person:** "You are {agentName}, helping {child} play with their
  {toy.name}. You are NOT the toy — you're a warm guide who suggests games, voices
  the toy now and then, and keeps {child} delighted…"

All existing guardrails carry over (age rules, "big/upsetting topics → ask mum or
dad", language-only rule, time, continuity). One wording change **in toy mode
only**: the current *"Never claim to be a real person"* becomes *"You may play the
part of {toy.name}, but never claim to be a real living person, and never ask for
personal information"* — a fictional toy persona is the point; impersonating a real
human still is not. The "Today's goal / get there through play" section is reworded
for toy mode to frame the purpose of play rather than a lesson objective.

## Backend — `/api/identify-toy`

New route mirroring `app/api/summarize/route.ts`: Anthropic + Zod structured
output, stateless, every path returns JSON.

- **Input:** JSON `{ image: "<base64 jpeg>" }`. The **client downscales before
  upload** (canvas → longest side ~1024px, JPEG quality ≈0.8) to stay well under
  Anthropic's image limits and keep latency and credit spend down.
- **Model:** `claude-opus-4-8` vision via `client.messages.parse` with a Zod
  schema → `{ recognized: boolean, toy: ToyInfo | null }`. The prompt instructs
  the model to identify the physical toy and build a child-safe persona; if the
  photo is not clearly a toy, return `recognized: false`.
- **Output:** `{ toy: ToyInfo | null, error?: string }`, with the same error
  discipline as summarize: malformed body → 400 JSON; missing `ANTHROPIC_API_KEY`
  → 500 JSON with a clear message; parse/model failure → 502 JSON. The
  confirmation screen renders `toy`; `recognized: false` → "Couldn't spot a toy —
  retake or type its name."

## Summary

Keep the `SessionSummary` type and `SummaryView` **unchanged** (no type churn).
The summarize prompt (`app/api/summarize/route.ts`) becomes mode-aware: when
`config.toy` is set it frames a **play** recap — what they played, what delighted
them, engagement — reusing the same fields (`grasped`/`struggled` read as
"enjoyed" / "got frustrated with" for a play session).

## Testing (vitest, matching existing test files)

- `buildPrompt` toy branches: both modes produce a persona + all guardrails and
  stay **pronoun-free** (extend the existing `prompt.test.ts` no-gendered-pronoun
  assertion to both toy sub-modes).
- Canary still passes for a POV greeting where `agentName` = the toy name
  (`overrides` / `firstMessageMatches`).
- `/api/identify-toy`: happy path parses to `ToyInfo`; `recognized: false` path
  returns `toy: null`; malformed/missing-key error paths return JSON.
- Mode-picker rendering and the toy-config prefill.

## Out of scope (YAGNI)

- Barcode/UPC database lookup (superseded by vision).
- A persisted toy catalog or toy "cards" like the child profile cards — a toy is
  captured per session; existing per-child profile persistence is unchanged.
- In-app live-camera (`getUserMedia`) capture — the native camera input covers
  the MVP.
- Changes to the `SessionSummary` shape or `SummaryView`.

## Files touched

- `lib/types.ts` — `ToyMode`, `ToyInfo`, optional `toy`/`toyMode` on `SessionConfig`.
- `lib/prompt.ts` — toy-mode branch in `buildPrompt`; greeting untouched.
- `app/page.tsx` — mode picker + toy-flow screen state.
- `app/components/` — new scan + confirmation components; toy-aware `ConfigForm`
  (prefill, purpose, mode radio) or a thin wrapper around it.
- `app/api/identify-toy/route.ts` — new vision route.
- `app/api/summarize/route.ts` — mode-aware prompt.
- Client image-downscale helper (e.g. `lib/image.ts`).
- Tests alongside each (`*.test.ts`).
- Unchanged: `lib/overrides.ts`, `SessionView.tsx`, `buildFirstMessage`,
  `SummaryView`, `lib/browser-storage.ts`.
