# Mobile-First UI — Design

**Date:** 2026-07-13
**Status:** Approved, ready for implementation planning

## Summary

The app works but is unstyled: inline styles, default HTML controls, no visual
hierarchy. This redesigns all three screens — Setup, Session, Summary —
mobile-first, with a playful, childlike character. Nothing behind the UI
changes.

## Context and constraints

- **The parent holds the device.** The child talks into the air; they do not
  hold or drive the screen. The session screen is therefore a parent's
  instrument panel, not a child's toy.
- **It runs on the laptop, not on a phone.** Microphone access requires a
  secure context (HTTPS or `localhost`), so a phone hitting
  `http://192.168.x.x:3000` would be silently denied the mic. We are not
  solving that. "Mobile-first" here means the *layout* is designed for a
  narrow viewport and scales up — not that the app is served to a phone.
- **Aesthetic: playful and bold** (the parent's explicit choice, over a
  quieter alternative). Playfulness lives in shape, colour and motion — not
  in visual noise. One dominant element per screen; generous empty space. The
  parent must be able to read the app's state in half a second and get back
  to watching their child.

## Goals

- The parent can start a repeat lesson in one tap instead of retyping a form.
- The parent can tell, at a glance from across the room, whether the agent is
  listening or speaking.
- Speech-recognition failure remains obvious — the transcript stays
  first-class, and the poor-ASR warning stays loud.
- The whole thing looks like something made for a child, without costing the
  parent legibility.

## Non-goals

No HTTPS/tunnel setup. No serving to a real phone. No changes to the session
state machine, the prompt, storage, the override canary, or the
save→summarize ordering. No dark mode. No new dependencies beyond a font.

## Foundation

**Tokens.** A design-token layer in `app/globals.css` as CSS custom
properties: colour, spacing, radius, type scale, shadow, motion. Every
component consumes tokens. This replaces the inline `style={{…}}` attributes
scattered through the components today.

**Type.** A rounded, friendly face (Nunito) via `next/font/google`.
`next/font` downloads at build time and self-hosts the files, so the running
app needs no network. Bold weights, large sizes, generous line-height.

**Layout.** Mobile-first, single column, `max-width: 32rem`, centred — so it
does not sprawl on a laptop. Touch targets ≥ 44px. The primary action of each
screen is sticky at the bottom, in thumb reach.

**Motion.** Conveys state, never decorates. All of it is disabled under
`prefers-reduced-motion: reduce`.

**Accessibility.** Text meets WCAG AA contrast against its background. Visible
focus rings. The two alarms (below) are `role="alert"`.

## The two alarms — must not be prettied away

Bright, playful colour makes it dangerously easy to soften a warning into
"just more colour". These two are deliberately severe, high-contrast, and
never compete with decoration:

1. **Overrides disabled** (`SessionView`) — the agent is not running our
   configuration; the child would be talking to an unguarded model. The
   session is already aborted; the message must dominate the screen.
2. **`transcriptQuality: "poor"`** (`SummaryView`) — speech recognition could
   not understand the child. This is the project's single instrument for its
   largest risk. It stays loud.

## Screens

### 1. Setup (`ConfigForm`)

Today: ten stacked form fields, retyped every session.

- **Saved children as cards at the top.** Each card shows the child's name and
  what they last worked on. Tapping one fills the entire form from that
  child's saved profile. This is the largest UX win available and removes the
  nightly retyping.
- Fields grouped: **Who** (child's name, age, language) · **What** (goal,
  extra instructions) · **How** (agent name, voice, session length).
- **Voice picker**: a list with a play button per voice, replacing the bare
  `<audio controls>` element.
- Sticky **Start lesson** button.
- The existing behaviour is preserved exactly: the `touched`-field logic that
  stops a loaded profile from overwriting what the parent just typed, and the
  error states for a failed `/api/voices` call.

### 2. Session (`SessionView`)

Today: a status line, a countdown, an End button, and a bare transcript list.

- **Character orb** — the hero element, with three states, driven by real
  data, not animation for its own sake:
  - *connecting* — muted, waiting
  - *listening* — calm, slow breathing
  - *speaking* — pulsing (from the SDK's `isSpeaking`)

  This is what lets the parent tell from across the room whether the agent is
  hearing their child.
- **Countdown ring** around the orb, depleting. No mental arithmetic from a
  `mm:ss` string.
- **Transcript as chat bubbles** below — child and agent on opposite sides,
  auto-scrolling to the newest turn. This stays first-class: it is where
  ASR failure is spotted in real time.
- Sticky, unmissable **End session** button.

### 3. Summary (`EndView` / `SummaryView`)

The one screen the parent actually reads, so it carries the most warmth.

- A "how it went" card: `whatWeDid` as the lead, `engagement` as a friendly
  indicator, `grasped` / `struggled` as coloured chips, `nextFocus` called
  out as the takeaway.
- The saving/summarizing states and every failure path keep their current
  copy and their current honesty: the transcript is only ever described as
  saved once it actually is, and an unsaved session never offers a Done
  button that would discard it.

## New surface

`GET /api/profiles/list` → `{ profiles: SessionConfig[] }` — read-only, backs
the saved-children cards. It is the only non-presentational addition.
`lib/storage.ts` gains a `listProfiles()` to support it.

## Testing

- All 56 existing tests must still pass, unchanged.
- `listProfiles()` gets storage tests alongside the existing ones (round-trip;
  empty when no profiles exist).
- The visual work is not unit-tested — vitest runs in a `node` environment
  and there is no jsdom/Testing Library in the project. Verification is a
  real run of the app in a narrow viewport and at laptop width, checked
  against this spec.

## Risks

1. **Softened alarms.** Addressed above; called out explicitly for review.
2. **The orb stealing attention from the transcript.** The transcript remains
   the largest region of the session screen by area.
3. **Bright palette failing contrast.** Text is checked against WCAG AA.
