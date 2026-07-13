# Mobile-First UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the app's unstyled inline-style HTML with a playful, bold, mobile-first interface across all three screens (Setup, Session, Summary), and let a parent restart a saved child's lesson in one tap — without changing any behaviour behind the UI.

**Architecture:** A design-token layer in `app/globals.css` (CSS custom properties for colour, space, radius, type, motion) that every component consumes via a co-located CSS Module. Components keep their existing state logic and props exactly as they are; only their markup and styling change. One new read-only endpoint (`GET /api/profiles/list`) backs the saved-children cards.

**Tech Stack:** Next.js (App Router), TypeScript, CSS Modules, `next/font/google` (Nunito), `@elevenlabs/react`, vitest.

## Global Constraints

- **Do not change behaviour.** No edits to `lib/prompt.ts`, the session state machine in `SessionView.tsx` (the override canary, the wall-clock timer, `finish()`/`transcriptRef`, the empty-transcript guard), the save→summarize ordering in `EndView.tsx`, or the honesty of its copy. Markup and styles only, except where a task explicitly says otherwise.
- **All 56 existing tests must still pass**, unmodified.
- **The parent holds the device; the child never drives the screen.** The session screen is a parent's instrument panel.
- **The app runs on a laptop, not a phone.** Mobile-first is about *layout* (narrow viewport first, scaling up). Do not add HTTPS, tunnels, or any phone-serving infrastructure.
- **Two alarms must stay severe and must never be softened into decoration:** the "overrides are not enabled" abort in `SessionView`, and `transcriptQuality: "poor"` in `SummaryView`. Both keep `role="alert"`.
- Mobile-first: single column, `max-width: 32rem` centred, touch targets ≥ 44px, primary action sticky at the bottom.
- All motion disabled under `prefers-reduced-motion: reduce`.
- Text meets WCAG AA contrast (≥ 4.5:1 for body, ≥ 3:1 for large text). Visible focus rings.
- No new runtime dependencies beyond the `next/font` face.
- The Claude model id stays exactly `claude-opus-4-8`.

---

### Task 1: Design tokens, typography and the app shell

Establishes the vocabulary every later task speaks. Nothing visible changes on the three screens yet — this task's deliverable is the foundation plus a shell that proves the tokens and font load.

**Files:**
- Modify: `app/globals.css` (full rewrite)
- Modify: `app/layout.tsx`
- Create: `app/app.module.css`
- Modify: `app/page.tsx` (wrap the screens in the shell; do not change its state logic)

**Interfaces:**
- Consumes: nothing.
- Produces: the CSS custom properties below, available to every component. Later tasks MUST use these tokens and MUST NOT hardcode colours, spacing or radii.

- [ ] **Step 1: Swap the font to a rounded face**

Replace the Geist fonts in `app/layout.tsx`. `next/font/google` downloads at build time and self-hosts the files, so the running app needs no network.

```tsx
// app/layout.tsx
import type { Metadata } from "next";
import { Nunito } from "next/font/google";
import "./globals.css";

const nunito = Nunito({
  variable: "--font-rounded",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "600", "800"],
});

export const metadata: Metadata = {
  title: "AI Teacher",
  description: "A local voice AI teacher for kids, built on ElevenLabs Agents.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={nunito.variable}>
      <body>{children}</body>
    </html>
  );
}
```

Note the `cyrillic` subset — the parent may well have a Cyrillic-named child, and the storage layer already supports it.

- [ ] **Step 2: Write the token layer**

Full replacement for `app/globals.css`. Light mode only — the previous file's `prefers-color-scheme: dark` block is deliberately dropped (a half-done dark theme on a bright, playful palette is worse than none, and dark mode is a non-goal in the spec).

```css
/* app/globals.css */

:root {
  /* Colour — playful, bold, and checked for WCAG AA against its background. */
  --c-bg: #fff8f0;
  --c-surface: #ffffff;
  --c-ink: #2a1b3d;          /* body text on --c-bg / --c-surface: >12:1 */
  --c-ink-soft: #6b5b7b;     /* secondary text: >4.5:1 */

  --c-primary: #6c4ae0;      /* actions; white text on it: 6.1:1 */
  --c-primary-ink: #ffffff;
  --c-accent: #ffb020;       /* highlights; NEVER used for text on light bg */
  --c-child: #22a6a1;        /* the child's transcript bubbles */
  --c-agent: #6c4ae0;        /* the agent's transcript bubbles */

  --c-good: #1f9d55;
  --c-warn: #b3261e;         /* the alarms; white text on it: 5.9:1 */
  --c-warn-bg: #fdeceb;

  /* Space — a 4px scale. */
  --s-1: 0.25rem;
  --s-2: 0.5rem;
  --s-3: 0.75rem;
  --s-4: 1rem;
  --s-5: 1.5rem;
  --s-6: 2rem;
  --s-7: 3rem;

  /* Radius — big and round; this is where much of the "playful" lives. */
  --r-sm: 0.5rem;
  --r-md: 1rem;
  --r-lg: 1.5rem;
  --r-full: 999px;

  /* Type */
  --font: var(--font-rounded), system-ui, sans-serif;
  --t-xs: 0.8125rem;
  --t-sm: 0.9375rem;
  --t-md: 1.0625rem;
  --t-lg: 1.375rem;
  --t-xl: 1.875rem;
  --t-xxl: 2.5rem;

  --shadow: 0 2px 0 rgba(42, 27, 61, 0.08), 0 8px 24px rgba(42, 27, 61, 0.08);
  --shadow-lift: 0 4px 0 rgba(42, 27, 61, 0.12), 0 12px 32px rgba(42, 27, 61, 0.12);

  --ease: cubic-bezier(0.2, 0.8, 0.2, 1);

  --tap: 44px; /* minimum touch target */
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html {
  height: 100%;
}

body {
  min-height: 100%;
  background: var(--c-bg);
  color: var(--c-ink);
  font-family: var(--font);
  font-size: var(--t-md);
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

button {
  font: inherit;
  cursor: pointer;
  border: none;
  background: none;
  color: inherit;
}

input,
select,
textarea {
  font: inherit;
  color: inherit;
}

:focus-visible {
  outline: 3px solid var(--c-primary);
  outline-offset: 2px;
  border-radius: var(--r-sm);
}

/* Motion is used to convey state, never to decorate — and it is always
   optional. Everything animated in this app must survive this rule. */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 3: The app shell**

```css
/* app/app.module.css */
.shell {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.inner {
  width: 100%;
  max-width: 32rem;
  padding: var(--s-5) var(--s-4) calc(var(--s-7) + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  gap: var(--s-5);
  flex: 1;
}

.title {
  font-size: var(--t-xl);
  font-weight: 800;
  letter-spacing: -0.02em;
  text-align: center;
}
```

- [ ] **Step 4: Wire the shell into the page**

Only the wrapper markup changes. The `config` / `finished` state logic and the three-way branch stay exactly as they are.

```tsx
// app/page.tsx
"use client";

import { useState } from "react";
import ConfigForm from "./components/ConfigForm";
import EndView from "./components/EndView";
import SessionView from "./components/SessionView";
import type { SavedSession, SessionConfig } from "../lib/types";
import styles from "./app.module.css";

type Finished = Omit<SavedSession, "summary">;

export default function Page() {
  const [config, setConfig] = useState<SessionConfig | null>(null);
  const [finished, setFinished] = useState<Finished | null>(null);

  return (
    <main className={styles.shell}>
      <div className={styles.inner}>
        <h1 className={styles.title}>AI Teacher</h1>

        {finished ? (
          // EndView saves the transcript first and only then summarizes it; it
          // is the component that owns that ordering (see EndView.tsx).
          <EndView
            session={finished}
            onFinish={() => {
              setFinished(null);
              setConfig(null);
            }}
          />
        ) : config ? (
          <SessionView config={config} onDone={setFinished} />
        ) : (
          <ConfigForm onStart={setConfig} />
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 5: Verify**

Run: `npm test` → 56 passing. `npx tsc --noEmit` → clean. `npm run build` → succeeds. `npm run lint` → no new errors.

Then `npm run dev` and confirm: the page renders in the rounded font, on the cream background, centred and constrained on a wide window.

- [ ] **Step 6: Commit**

```bash
git add app/globals.css app/layout.tsx app/app.module.css app/page.tsx
git commit -m "Add design tokens, rounded type and the app shell"
```

---

### Task 2: List saved children

The data behind the one-tap resume. Pure plumbing, fully testable — done before any of the UI that consumes it.

**Files:**
- Modify: `lib/storage.ts`
- Modify: `lib/storage.test.ts`
- Create: `app/api/profiles/list/route.ts`

**Interfaces:**
- Consumes: `SessionConfig` from `lib/types.ts`; the existing `dataDir()` / `profilesDir` internals of `lib/storage.ts` (read the file — the data directory is resolved from a `DATA_DIR` env var, defaulting to `<cwd>/data`, and tests rely on that).
- Produces:
  - `listProfiles(): Promise<SessionConfig[]>` from `lib/storage.ts`.
  - `GET /api/profiles/list` → `{ profiles: SessionConfig[] }`. Task 3 fetches exactly this.

- [ ] **Step 1: Write the failing tests**

Append to `lib/storage.test.ts`. Use the same temp-`DATA_DIR` mechanism the existing tests use — read the top of the file and follow it exactly; do not introduce a second mechanism, and do not let these tests touch the real `data/` directory.

```ts
describe("listProfiles", () => {
  it("returns an empty list when no profiles exist", async () => {
    expect(await listProfiles()).toEqual([]);
  });

  it("returns every saved profile", async () => {
    const mia: SessionConfig = { ...config, childName: "Mia", goal: "Count to 10" };
    const anya: SessionConfig = { ...config, childName: "Аня", goal: "Animals" };
    await saveProfile(mia);
    await saveProfile(anya);

    const profiles = await listProfiles();
    expect(profiles).toHaveLength(2);
    expect(profiles.map((p) => p.childName).sort()).toEqual(["Mia", "Аня"]);
  });

  it("round-trips a profile's full config, not just the name", async () => {
    await saveProfile({ ...config, childName: "Mia", goal: "Count to 10", minutes: 15 });
    const [profile] = await listProfiles();
    expect(profile.goal).toBe("Count to 10");
    expect(profile.minutes).toBe(15);
  });
});
```

`config` is the existing shared fixture at the top of the file. Add `listProfiles` to the import from `./storage`.

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run lib/storage.test.ts`
Expected: FAIL — `listProfiles` is not exported.

- [ ] **Step 3: Implement `listProfiles`**

Add to `lib/storage.ts`, following the existing style (the file already has a `dataDir()`-based `profilesDir` — reuse it rather than recomputing the path).

```ts
export async function listProfiles(): Promise<SessionConfig[]> {
  let files: string[];
  try {
    files = await readdir(profilesDir());
  } catch {
    return []; // no profiles directory yet — no children saved
  }

  const profiles: SessionConfig[] = [];
  for (const file of files.filter((f) => f.endsWith(".json"))) {
    try {
      profiles.push(JSON.parse(await readFile(path.join(profilesDir(), file), "utf8")) as SessionConfig);
    } catch {
      // A corrupt or half-written profile must not take down the whole list —
      // the parent should still see their other children.
    }
  }
  return profiles;
}
```

Match the real names in the file: if the directory helper is `profilesDir` (a function) use `profilesDir()`; if it is a constant, use it directly. Read before you write.

- [ ] **Step 4: Run and watch them pass**

Run: `npm test`
Expected: PASS — 59 tests (56 existing + 3 new).

- [ ] **Step 5: The route**

```ts
// app/api/profiles/list/route.ts
import { listProfiles } from "../../../../lib/storage";

export async function GET() {
  return Response.json({ profiles: await listProfiles() });
}
```

- [ ] **Step 6: Verify and commit**

Run: `npx tsc --noEmit` (clean), `npm run build` (succeeds).

```bash
git add lib/storage.ts lib/storage.test.ts app/api/profiles/list/route.ts
git commit -m "List saved children profiles"
```

---

### Task 3: The Setup screen

The parent's first screen, and the one they touch most. Today it is ten stacked default form controls, retyped every session.

**Files:**
- Modify: `app/components/ConfigForm.tsx` (markup and styling; keep every piece of its state logic)
- Create: `app/components/ConfigForm.module.css`

**Interfaces:**
- Consumes: `GET /api/profiles/list` → `{ profiles: SessionConfig[] }` (Task 2); the tokens from Task 1.
- Produces: `ConfigForm` keeps its existing prop `{ onStart: (config: SessionConfig) => void }` — unchanged.

**READ THE EXISTING COMPONENT FIRST.** It has behaviour that took a review cycle to get right and MUST be preserved:
- a `touched` ref that records which fields the parent has edited, so that loading a saved profile on blur fills only the *untouched* fields and never silently overwrites what they just typed, and reports what it filled in;
- an error state when `/api/voices` fails (a bad `ELEVENLABS_API_KEY`), naming the env var — without it a bad key produces a dead form with no explanation;
- a separate message when the voice list comes back empty;
- Start disabled until a voice is selected.

Keep all of it. You are changing how it looks, not what it does.

- [ ] **Step 1: Saved-children cards**

Fetch the profiles on mount and render them above the form. Tapping a card fills the form from that child's saved config — this is the whole point of the task, and it removes the nightly retyping.

```tsx
const [profiles, setProfiles] = useState<SessionConfig[]>([]);

useEffect(() => {
  fetch("/api/profiles/list")
    .then((r) => r.json())
    .then((d) => setProfiles(d.profiles ?? []))
    .catch(() => setProfiles([]));
}, []);
```

Render (only when there is at least one):

```tsx
{profiles.length > 0 && (
  <section className={styles.recent} aria-label="Saved children">
    <h2 className={styles.sectionTitle}>Pick up where you left off</h2>
    <ul className={styles.cards}>
      {profiles.map((p) => (
        <li key={p.childName}>
          <button type="button" className={styles.card} onClick={() => setConfig(p)}>
            <span className={styles.cardName}>{p.childName}</span>
            <span className={styles.cardGoal}>{p.goal}</span>
          </button>
        </li>
      ))}
    </ul>
  </section>
)}
```

Tapping a card is an explicit, deliberate act by the parent, so replacing the whole config here is correct — unlike the blur-triggered load, which must not clobber typed input. Do not route the card tap through the `touched` logic.

- [ ] **Step 2: Group the fields and style the form**

Group into three labelled sections — **Who** (child's name, age, language) · **What** (goal, extra instructions) · **How** (agent name, voice, session length) — using `<fieldset>`/`<legend>` so the grouping is real for screen readers, not just visual.

Voice picker: a list of voices, each row a radio-like button with the voice's name and a play button that plays its `previewUrl`. Replace the bare `<audio controls>`.

The Start button is sticky at the bottom:

```css
/* app/components/ConfigForm.module.css — the load-bearing bits */
.card {
  width: 100%;
  min-height: var(--tap);
  display: flex;
  flex-direction: column;
  gap: var(--s-1);
  padding: var(--s-4);
  background: var(--c-surface);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow);
  text-align: left;
  transition: transform 0.15s var(--ease), box-shadow 0.15s var(--ease);
}
.card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-lift);
}
.cardName {
  font-size: var(--t-lg);
  font-weight: 800;
}
.cardGoal {
  font-size: var(--t-sm);
  color: var(--c-ink-soft);
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
}
.field input,
.field select,
.field textarea {
  min-height: var(--tap);
  padding: var(--s-3);
  background: var(--c-surface);
  border: 2px solid transparent;
  border-radius: var(--r-md);
  box-shadow: var(--shadow);
}
.field input:focus,
.field select:focus,
.field textarea:focus {
  border-color: var(--c-primary);
}

.start {
  position: sticky;
  bottom: var(--s-4);
  min-height: 56px;
  width: 100%;
  background: var(--c-primary);
  color: var(--c-primary-ink);
  font-size: var(--t-lg);
  font-weight: 800;
  border-radius: var(--r-full);
  box-shadow: var(--shadow-lift);
}
.start:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.error {
  padding: var(--s-4);
  background: var(--c-warn-bg);
  color: var(--c-warn);
  border-radius: var(--r-md);
  font-weight: 600;
}
```

- [ ] **Step 3: Verify**

Run: `npm test` (59 pass), `npx tsc --noEmit` (clean), `npm run build`, `npm run lint`.

Then `npm run dev` and check, at a 375px-wide viewport and at laptop width:
- A saved child appears as a card; tapping it fills the form.
- Typing a goal, *then* typing a child's name with a saved profile, does NOT wipe the goal. (This is the regression that matters — verify it by hand.)
- Every control is comfortably tappable.
- Start is sticky and reachable.

- [ ] **Step 4: Commit**

```bash
git add app/components/ConfigForm.tsx app/components/ConfigForm.module.css
git commit -m "Redesign the setup screen; add one-tap resume for a saved child"
```

---

### Task 4: The Session screen

The screen the parent watches while their child talks. It must be readable at a glance from across the room.

**Files:**
- Modify: `app/components/SessionView.tsx` (markup and styling ONLY)
- Create: `app/components/SessionView.module.css`

**Interfaces:**
- Consumes: the tokens from Task 1; `conversation.status` and `conversation.isSpeaking` from `@elevenlabs/react`'s `useConversation()`.
- Produces: `SessionView` keeps its existing props `{ config, onDone }` — unchanged.

**⚠️ DO NOT TOUCH THE LOGIC.** This file's state machine cost several review cycles. Leave every one of these exactly as it is, and do not reorder or "tidy" them:
- the **override canary** in `onMessage` (`firstAgentTurnSeen`, the empty-turn guard, `endSessionRef`) — it is what stops a child talking to an unguarded model;
- the **wall-clock timer** (derives remaining time from `Date.now()`, not by decrementing — a backgrounded tab must not stall the wind-down);
- `finish()` / `transcriptRef` / the `finished` guard;
- the **empty-transcript guard in `onDisconnect`** — it is what keeps a rejected-override error on screen instead of unmounting it;
- the mic-permission and signed-URL error paths.

Change the JSX and add classes. Nothing else.

- [ ] **Step 1: Read `isSpeaking` from the hook**

`useConversation()` returns `isSpeaking` alongside `status`. Verify this against `node_modules/@elevenlabs/react` before using it — read the `.d.ts`. If it is not there under that name, find the real one and use it; do not invent it, and do not fake the state with a timer.

- [ ] **Step 2: The orb and the countdown ring**

The hero element. Three states, each driven by real data:

```tsx
const orbState =
  conversation.status !== "connected" ? "idle" : conversation.isSpeaking ? "speaking" : "listening";
```

```tsx
<div className={styles.stage}>
  <svg className={styles.ring} viewBox="0 0 120 120" aria-hidden="true">
    <circle className={styles.ringTrack} cx="60" cy="60" r="56" />
    <circle
      className={styles.ringFill}
      cx="60" cy="60" r="56"
      style={{
        strokeDasharray: 2 * Math.PI * 56,
        strokeDashoffset: 2 * Math.PI * 56 * (1 - secondsLeft / (config.minutes * 60)),
      }}
    />
  </svg>
  <div className={`${styles.orb} ${styles[orbState]}`} />
  <p className={styles.clock}>{mins}:{secs}</p>
</div>

<p className={styles.state} role="status">
  {conversation.status === "connecting" && "Connecting…"}
  {orbState === "listening" && `${config.agentName} is listening`}
  {orbState === "speaking" && `${config.agentName} is talking`}
</p>
```

The `role="status"` line is not decoration — it is what makes the orb's meaning available to a screen reader, and it is also the thing you can read at a glance.

```css
/* app/components/SessionView.module.css — the load-bearing bits */
.stage {
  position: relative;
  display: grid;
  place-items: center;
  padding: var(--s-4);
}
.ring {
  width: 240px;
  height: 240px;
  transform: rotate(-90deg);
}
.ringTrack {
  fill: none;
  stroke: rgba(42, 27, 61, 0.08);
  stroke-width: 8;
}
.ringFill {
  fill: none;
  stroke: var(--c-accent);
  stroke-width: 8;
  stroke-linecap: round;
  transition: stroke-dashoffset 1s linear;
}
.orb {
  position: absolute;
  width: 168px;
  height: 168px;
  border-radius: var(--r-full);
  background: radial-gradient(circle at 35% 30%, #8f6cff, var(--c-primary));
  box-shadow: var(--shadow-lift);
}
.idle {
  background: radial-gradient(circle at 35% 30%, #cfc6e8, #a99cc4);
}
.listening {
  animation: breathe 3.6s var(--ease) infinite;
}
.speaking {
  animation: pulse 0.9s var(--ease) infinite;
}
@keyframes breathe {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.03); }
}
@keyframes pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.07); }
}
.clock {
  position: absolute;
  bottom: -0.25rem;
  font-size: var(--t-lg);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 3: The transcript as chat bubbles**

Keep the transcript the largest region of the screen by area — it is where speech-recognition failure is spotted, and that is the whole reason it exists. Child and agent on opposite sides; auto-scroll to the newest turn.

```css
.transcript {
  flex: 1;
  min-height: 12rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
  padding: var(--s-4);
  background: var(--c-surface);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow);
}
.bubble {
  max-width: 85%;
  padding: var(--s-3) var(--s-4);
  border-radius: var(--r-lg);
  font-size: var(--t-sm);
}
.fromAgent {
  align-self: flex-start;
  background: color-mix(in srgb, var(--c-agent) 12%, white);
  border-bottom-left-radius: var(--r-sm);
}
.fromChild {
  align-self: flex-end;
  background: color-mix(in srgb, var(--c-child) 16%, white);
  border-bottom-right-radius: var(--r-sm);
}
.who {
  display: block;
  font-size: var(--t-xs);
  font-weight: 800;
  color: var(--c-ink-soft);
  margin-bottom: var(--s-1);
}
```

Auto-scroll with a ref on the transcript container, in an effect keyed on `transcript.length`:

```tsx
const scroller = useRef<HTMLDivElement>(null);
useEffect(() => {
  scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
}, [transcript.length]);
```

- [ ] **Step 4: The End button and the alarm**

End is sticky, unmissable, and always reachable while connected:

```css
.end {
  position: sticky;
  bottom: var(--s-4);
  min-height: 56px;
  width: 100%;
  background: var(--c-warn);
  color: white;
  font-size: var(--t-lg);
  font-weight: 800;
  border-radius: var(--r-full);
  box-shadow: var(--shadow-lift);
}
```

The overrides-disabled alarm keeps `role="alert"` and stays severe — heavy border, warning colour, dominating the screen. It is telling the parent their child would otherwise be talking to an unguarded model. Do not let the playful palette dilute it:

```css
.alarm {
  padding: var(--s-5);
  background: var(--c-warn-bg);
  border: 3px solid var(--c-warn);
  border-radius: var(--r-lg);
  color: var(--c-warn);
}
.alarm h2 {
  font-size: var(--t-lg);
  font-weight: 800;
  margin-bottom: var(--s-2);
}
```

- [ ] **Step 5: Verify**

Run: `npm test` (59 pass), `npx tsc --noEmit` (clean), `npm run build`, `npm run lint`.

Then run a **real session** (`npm run dev`, real keys, talk to it) and confirm:
- the orb visibly pulses while the agent talks and settles while it listens;
- the ring depletes;
- turns appear as bubbles, correctly attributed (the child's words on the child's side — a mislabelled transcript would poison every summary);
- End works.

If you cannot run a live session, say so plainly rather than claiming you did.

- [ ] **Step 6: Commit**

```bash
git add app/components/SessionView.tsx app/components/SessionView.module.css
git commit -m "Redesign the session screen: speaking orb, countdown ring, chat transcript"
```

---

### Task 5: The Summary screen

The one screen the parent actually reads. It gets the most warmth — and carries the loudest alarm.

**Files:**
- Modify: `app/components/SummaryView.tsx` (markup and styling ONLY)
- Modify: `app/components/EndView.tsx` (markup and styling ONLY)
- Create: `app/components/SummaryView.module.css`

**Interfaces:**
- Consumes: the tokens from Task 1; `SessionSummary` from `lib/types.ts`.
- Produces: both components keep their existing props — unchanged.

**⚠️ DO NOT TOUCH THE LOGIC OR THE COPY'S HONESTY.** `EndView` owns the save→summarize ordering: the transcript is written to disk *before* Claude is called, the reassuring "the transcript is saved" text appears only once a save has actually succeeded, and an unsaved session never offers a Done button that would discard it. Every failure path must keep working. Read the file and preserve all of it.

- [ ] **Step 1: The report card**

```tsx
<article className={styles.card}>
  <h2 className={styles.heading}>How it went</h2>
  <p className={styles.lead}>{summary.whatWeDid}</p>

  <div className={styles.row}>
    <span className={styles.label}>Engagement</span>
    <span className={`${styles.pill} ${styles[summary.engagement]}`}>{summary.engagement}</span>
  </div>

  <Chips title="Confident with" items={summary.grasped} tone="good" />
  <Chips title="Still tricky" items={summary.struggled} tone="accent" />

  <div className={styles.next}>
    <span className={styles.label}>Next time</span>
    <p>{summary.nextFocus}</p>
  </div>
</article>
```

`Chips` is a small local component in the same file (it is used twice and nowhere else — it does not need its own file):

```tsx
function Chips({ title, items, tone }: { title: string; items: string[]; tone: "good" | "accent" }) {
  if (items.length === 0) return null;
  return (
    <div className={styles.chipGroup}>
      <span className={styles.label}>{title}</span>
      <ul className={styles.chips}>
        {items.map((item) => (
          <li key={item} className={`${styles.chip} ${styles[tone]}`}>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: The ASR alarm**

This is the project's single instrument for its largest risk — that speech recognition cannot understand the child. On a bright, friendly, chip-covered card it would be trivially easy to render this as just another coloured pill. Don't. It keeps `role="alert"`, sits apart from the card, and is visually severe:

```css
.asrAlarm {
  padding: var(--s-5);
  background: var(--c-warn-bg);
  border: 3px solid var(--c-warn);
  border-radius: var(--r-lg);
  color: var(--c-warn);
  font-weight: 600;
}
```

- [ ] **Step 3: Style the save/summarize states**

Loading, error, and Retry states get the token treatment (`.error`, and a Retry styled as a secondary button). The *words* do not change — they were written to be truthful about whether the transcript is on disk, and rewording them risks reintroducing a bug we already fixed once.

- [ ] **Step 4: Verify**

Run: `npm test` (59 pass), `npx tsc --noEmit` (clean), `npm run build`, `npm run lint`.

Then run a session end-to-end and read the summary at a 375px viewport. Confirm the poor-ASR warning is impossible to miss (force it by temporarily editing a saved session's JSON to `"transcriptQuality": "poor"` and re-running the summary view — revert afterwards).

- [ ] **Step 5: Commit**

```bash
git add app/components/SummaryView.tsx app/components/SummaryView.module.css app/components/EndView.tsx
git commit -m "Redesign the summary screen as a report card"
```
