# Audio AI Teacher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A local Next.js app where a parent configures a voice AI agent (name, voice, child's name/age, language, goal, directives, session length) and hands it to their child for a short spoken lesson, watching a live transcript and getting a Claude-written summary afterwards that seeds the next session.

**Architecture:** The ElevenLabs Agents Platform runs the entire real-time loop (mic → speech-to-text → LLM → text-to-speech → speaker) inside one browser session. One ElevenLabs agent is created by hand in their dashboard; everything configurable is passed at session start as *overrides* (system prompt, first message, language, voice) and *dynamic variables* (child's name, age, goal, …). Our Next.js server exists only to mint short-lived signed URLs, list the user's voices, and call Claude for the post-session summary — audio never touches it. Sessions and summaries are JSON files on disk.

**Tech Stack:** Next.js (App Router) + TypeScript, `@elevenlabs/react` (browser), `@elevenlabs/elevenlabs-js` (server), `@anthropic-ai/sdk` + `zod` (summaries), `vitest` (tests).

## Global Constraints

- Local-only. No auth, no deployment, no database. `npm run dev` is the only way it runs.
- Both API keys (`ELEVENLABS_API_KEY`, `ANTHROPIC_API_KEY`) live in `.env.local` and are read **server-side only**. The browser must never receive either. `.env.local` and `data/` are already in `.gitignore` — keep them there.
- The Claude model id is exactly `claude-opus-4-8`. Never append a date suffix.
- Age branch threshold: `childAge < 6` selects the young-child prompt rules. Exactly `6` and above selects the older-child rules.
- Node 20+.

---

### Task 1: Scaffold the app and prove a voice answers

This is the whole spike. The point is to get a talking agent in front of a real child before building anything on top of it. Setup, config, and the ElevenLabs dashboard steps are folded in here because nothing else can be tested until a voice comes out of the speaker.

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `.env.local.example`, `app/layout.tsx`, `app/page.tsx` (via `create-next-app`)
- Create: `SETUP.md`
- Create: `app/api/signed-url/route.ts`
- Create: `app/components/SessionView.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `GET /api/signed-url` → `{ signedUrl: string }`. Every later task's client code calls this exact route and reads that exact field.

- [ ] **Step 1: Scaffold Next.js**

```bash
cd /Users/evgeniistuditskikh/Projects/Personal/ai-teacher
npx create-next-app@latest . --typescript --app --no-tailwind --no-src-dir --no-import-alias --eslint --use-npm
npm install @elevenlabs/react @elevenlabs/elevenlabs-js @anthropic-ai/sdk zod
npm install -D vitest
```

Expected: `npm run dev` serves the Next.js starter page at http://localhost:3000.

- [ ] **Step 2: Write `SETUP.md` — the manual ElevenLabs steps**

These cannot be automated and they are the single most common way this project loses an afternoon. Write this file:

```markdown
# One-time setup

## 1. Create the ElevenLabs agent

1. Go to https://elevenlabs.io/app/agents and create a new agent. Any name; we override everything at runtime.
2. Copy its **Agent ID**.

## 2. Enable overrides (CRITICAL — silent failure if skipped)

In the agent's **Security** settings, enable overrides for **all** of:

- System prompt
- First message
- Language
- Voice

If these are not enabled, ElevenLabs **silently ignores** the values we send at
session start. The agent will run happily with its dashboard defaults and you
will have no error message to debug. If your prompt or voice "isn't taking",
this is why.

## 3. Fill in `.env.local`

    ELEVENLABS_API_KEY=...
    ELEVENLABS_AGENT_ID=...
    ANTHROPIC_API_KEY=...
```

Also write `.env.local.example` with those three keys and empty values.

- [ ] **Step 3: The signed-URL route**

The browser must never hold the ElevenLabs key. It asks our server for a short-lived signed URL instead.

```ts
// app/api/signed-url/route.ts
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

export async function GET() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const agentId = process.env.ELEVENLABS_AGENT_ID;
  if (!apiKey || !agentId) {
    return Response.json(
      { error: "ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID must be set in .env.local" },
      { status: 500 },
    );
  }

  const client = new ElevenLabsClient({ apiKey });
  const { signedUrl } = await client.conversationalAi.conversations.getSignedUrl({ agentId });
  return Response.json({ signedUrl });
}
```

- [ ] **Step 4: The minimal talking session**

Hardcode everything. No config form yet. The `console.log` in `onMessage` is deliberate: it is how you learn the exact shape of the SDK's message event, which Task 4 depends on.

```tsx
// app/components/SessionView.tsx
"use client";

import { useConversation } from "@elevenlabs/react";
import { useCallback, useState } from "react";

export default function SessionView() {
  const [error, setError] = useState<string | null>(null);

  const conversation = useConversation({
    onConnect: () => console.log("connected"),
    onDisconnect: () => console.log("disconnected"),
    onMessage: (msg) => console.log("MESSAGE EVENT SHAPE:", msg),
    onError: (e: Error) => setError(e.message),
    overrides: {
      agent: {
        prompt: { prompt: "You are Robo, a warm, playful teacher. Say hello and ask the child their name." },
        firstMessage: "Hi! I'm Robo. What's your name?",
        language: "en",
      },
    },
  });

  const start = useCallback(async () => {
    setError(null);
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("I need microphone permission to talk. Please allow it and try again.");
      return;
    }
    const res = await fetch("/api/signed-url");
    if (!res.ok) {
      setError("Could not start the session. Check your keys in .env.local.");
      return;
    }
    const { signedUrl } = await res.json();
    await conversation.startSession({ signedUrl });
  }, [conversation]);

  return (
    <main style={{ padding: 32, fontFamily: "system-ui" }}>
      <h1>AI Teacher</h1>
      <p>Status: {conversation.status}</p>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      <button onClick={start} disabled={conversation.status === "connected"}>
        Start
      </button>
      <button onClick={() => conversation.endSession()} disabled={conversation.status !== "connected"}>
        End session
      </button>
    </main>
  );
}
```

Replace `app/page.tsx` with:

```tsx
import SessionView from "./components/SessionView";
export default function Page() {
  return <SessionView />;
}
```

- [ ] **Step 5: Run it and talk to it**

Run: `npm run dev`, open http://localhost:3000, click Start, allow the mic, say hello.

Expected: a voice greets you and responds to what you say. In the browser console, `MESSAGE EVENT SHAPE:` prints for each turn — **write down the actual shape**, it is the input to Task 4.

If the voice ignores the "Robo" prompt, overrides are not enabled — go back to `SETUP.md` step 2.

- [ ] **Step 6: THE ACTUAL TEST — sit your child in front of it**

Not a formality. Let them talk to it for five minutes and read the console transcript afterwards. You are looking for one thing: **does speech recognition understand your child at all?** If the transcripts are garbage, stop and tell the user before building the remaining tasks — the design may need to shift toward listen-and-repeat rather than free conversation.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: talking agent — minimal ElevenLabs session"
```

---

### Task 2: The prompt template

A pure function, no I/O, and the file you will edit more than any other. It gets real tests because it fails silently — a mangled prompt still produces a friendly-sounding agent that just doesn't do its job.

**Files:**
- Create: `lib/types.ts`
- Create: `lib/prompt.ts`
- Create: `lib/prompt.test.ts`
- Create: `vitest.config.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: the types `SessionConfig`, `SessionSummary`, `TranscriptTurn`, `SavedSession` from `lib/types.ts`, and `buildPrompt(config: SessionConfig, lastSummary: SessionSummary | null): string` plus `buildFirstMessage(config: SessionConfig): string` from `lib/prompt.ts`. Tasks 3–5 all import these exact names.

- [ ] **Step 1: The types**

```ts
// lib/types.ts
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
```

- [ ] **Step 2: Vitest config**

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "node" } });
```

Add to `package.json` scripts: `"test": "vitest run"`.

- [ ] **Step 3: Write the failing tests**

```ts
// lib/prompt.test.ts
import { describe, expect, it } from "vitest";
import { buildPrompt } from "./prompt";
import type { SessionConfig, SessionSummary } from "./types";

const base: SessionConfig = {
  agentName: "Robo",
  voiceId: "v1",
  childName: "Mia",
  childAge: 5,
  language: "en",
  goal: "Count to 10",
  directives: "She is shy and loves dinosaurs.",
  minutes: 10,
};

describe("buildPrompt", () => {
  it("includes the agent name, child name, age and goal", () => {
    const p = buildPrompt(base, null);
    expect(p).toContain("Robo");
    expect(p).toContain("Mia");
    expect(p).toContain("5");
    expect(p).toContain("Count to 10");
  });

  it("includes the parent's directives verbatim", () => {
    expect(buildPrompt(base, null)).toContain("She is shy and loves dinosaurs.");
  });

  it("uses young-child rules below age 6", () => {
    expect(buildPrompt({ ...base, childAge: 5 }, null)).toContain("one short question at a time");
  });

  it("uses older-child rules at age 6 and above", () => {
    const p = buildPrompt({ ...base, childAge: 6 }, null);
    expect(p).not.toContain("one short question at a time");
    expect(p).toContain("back-and-forth");
  });

  it("includes the previous session's focus when a summary exists", () => {
    const summary: SessionSummary = {
      whatWeDid: "Counted together.",
      grasped: ["1 to 5"],
      struggled: ["7 and 8"],
      nextFocus: "Practice 7 and 8.",
      engagement: "high",
      transcriptQuality: "good",
    };
    const p = buildPrompt(base, summary);
    expect(p).toContain("7 and 8");
    expect(p).toContain("Practice 7 and 8.");
  });

  it("produces a clean prompt with no leftover markers when there is no summary", () => {
    const p = buildPrompt(base, null);
    expect(p).not.toContain("undefined");
    expect(p).not.toContain("null");
    expect(p).not.toMatch(/last time/i);
  });

  it("always includes the guardrails and the wind-down instruction", () => {
    const p = buildPrompt(base, null);
    expect(p).toContain("mum or dad");
    expect(p).toContain("10 minutes");
  });
});
```

- [ ] **Step 4: Run the tests and watch them fail**

Run: `npx vitest run lib/prompt.test.ts`
Expected: FAIL — `Failed to resolve import "./prompt"`.

- [ ] **Step 5: Implement `buildPrompt`**

```ts
// lib/prompt.ts
import type { SessionConfig, SessionSummary } from "./types";

const YOUNG_CHILD_RULES = `
- Ask one short question at a time. Prefer yes/no answers or single words.
- You will often mishear her. When that happens, do not press. Ask again cheerfully,
  or change the question entirely. Never say you don't understand twice in a row.
- Celebrate every attempt, not just correct answers.`;

const OLDER_CHILD_RULES = `
- Real back-and-forth conversation is fine. You can rely on understanding full answers.
- Ask follow-up questions. Let her explain her reasoning.`;

const GUARDRAILS = `
- Stay on today's goal. A little wandering is fine; a whole session about something
  else is not.
- Keep everything gentle and age-appropriate.
- If she raises something big or upsetting — death, scary news, family matters —
  warmly tell her that is a wonderful question for her mum or dad, and gently return
  to the lesson.
- Never claim to be a real person. Never ask for personal information.`;

export function buildPrompt(config: SessionConfig, lastSummary: SessionSummary | null): string {
  const ageRules = config.childAge < 6 ? YOUNG_CHILD_RULES : OLDER_CHILD_RULES;

  const continuity = lastSummary
    ? `
## Last time
${lastSummary.whatWeDid}
She was confident with: ${lastSummary.grasped.join(", ") || "nothing in particular"}.
She struggled with: ${lastSummary.struggled.join(", ") || "nothing in particular"}.
Focus for today: ${lastSummary.nextFocus}`
    : "";

  return `You are ${config.agentName}, a warm, playful teacher talking with ${config.childName}, who is ${config.childAge} years old.

## Today's goal
${config.goal}

Get there through play, not drilling. Games, silly voices, stories, counting things
she can see — anything but a quiz.

## How to talk to her
${ageRules}

## What her parent told you
${config.directives}
${continuity}

## Rules
${GUARDRAILS}

## Time
You have about ${config.minutes} minutes. When you are told that time is nearly up,
praise one specific thing she did today, then say a warm goodbye. Do not start
anything new.`;
}

export function buildFirstMessage(config: SessionConfig): string {
  return `Hi ${config.childName}! I'm ${config.agentName}. Are you ready to play?`;
}
```

- [ ] **Step 6: Run the tests and watch them pass**

Run: `npx vitest run lib/prompt.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 7: Commit**

```bash
git add lib vitest.config.ts package.json
git commit -m "feat: age-adaptive prompt template with tests"
```

---

### Task 3: Config form and voice picker

The parent-facing surface. "Pick the voice" is one of the three features asked for, and typing a UUID is not picking — hence the dropdown with a preview.

**Files:**
- Create: `lib/storage.ts`
- Create: `lib/storage.test.ts`
- Create: `app/api/voices/route.ts`
- Create: `app/api/profiles/route.ts`
- Create: `app/components/ConfigForm.tsx`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `SessionConfig`, `SavedSession`, `SessionSummary` from `lib/types.ts` (Task 2).
- Produces:
  - `lib/storage.ts`: `saveProfile(config: SessionConfig): Promise<void>`, `loadProfile(childName: string): Promise<SessionConfig | null>`, `saveSession(session: SavedSession): Promise<string>` (returns the file path), `loadLatestSummary(childName: string): Promise<SessionSummary | null>`.
  - `GET /api/voices` → `{ voices: { voiceId: string; name: string; previewUrl: string }[] }`
  - `GET /api/profiles?childName=Mia` → `{ config: SessionConfig | null }`
  - `POST /api/profiles` with a `SessionConfig` body → `{ ok: true }`
  - `ConfigForm` component with prop `onStart: (config: SessionConfig) => void`.

- [ ] **Step 1: Write the failing storage tests**

```ts
// lib/storage.test.ts
import { afterEach, describe, expect, it } from "vitest";
import { rm } from "node:fs/promises";
import { loadLatestSummary, loadProfile, saveProfile, saveSession } from "./storage";
import type { SavedSession, SessionConfig } from "./types";

const config: SessionConfig = {
  agentName: "Robo",
  voiceId: "v1",
  childName: "TestKid",
  childAge: 5,
  language: "en",
  goal: "Count to 10",
  directives: "",
  minutes: 10,
};

afterEach(async () => {
  await rm("data", { recursive: true, force: true });
});

describe("storage", () => {
  it("round-trips a profile", async () => {
    await saveProfile(config);
    expect(await loadProfile("TestKid")).toEqual(config);
  });

  it("returns null for a child with no profile", async () => {
    expect(await loadProfile("Nobody")).toBeNull();
  });

  it("returns null when a child has no sessions yet", async () => {
    expect(await loadLatestSummary("TestKid")).toBeNull();
  });

  it("returns the summary of the most recently saved session", async () => {
    const make = (endedAt: string, nextFocus: string): SavedSession => ({
      config,
      transcript: [],
      startedAt: endedAt,
      endedAt,
      summary: {
        whatWeDid: "x",
        grasped: [],
        struggled: [],
        nextFocus,
        engagement: "medium",
        transcriptQuality: "good",
      },
    });
    await saveSession(make("2026-01-01T10:00:00.000Z", "older"));
    await saveSession(make("2026-01-02T10:00:00.000Z", "newer"));
    const summary = await loadLatestSummary("TestKid");
    expect(summary?.nextFocus).toBe("newer");
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run lib/storage.test.ts`
Expected: FAIL — cannot resolve `./storage`.

- [ ] **Step 3: Implement storage**

```ts
// lib/storage.ts
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SavedSession, SessionConfig, SessionSummary } from "./types";

const DATA = path.join(process.cwd(), "data");
const PROFILES = path.join(DATA, "profiles");
const SESSIONS = path.join(DATA, "sessions");

function slug(childName: string): string {
  return childName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "child";
}

export async function saveProfile(config: SessionConfig): Promise<void> {
  await mkdir(PROFILES, { recursive: true });
  await writeFile(
    path.join(PROFILES, `${slug(config.childName)}.json`),
    JSON.stringify(config, null, 2),
  );
}

export async function loadProfile(childName: string): Promise<SessionConfig | null> {
  try {
    const raw = await readFile(path.join(PROFILES, `${slug(childName)}.json`), "utf8");
    return JSON.parse(raw) as SessionConfig;
  } catch {
    return null;
  }
}

export async function saveSession(session: SavedSession): Promise<string> {
  await mkdir(SESSIONS, { recursive: true });
  const stamp = session.endedAt.replace(/[:.]/g, "-");
  const file = path.join(SESSIONS, `${slug(session.config.childName)}--${stamp}.json`);
  await writeFile(file, JSON.stringify(session, null, 2));
  return file;
}

export async function loadLatestSummary(childName: string): Promise<SessionSummary | null> {
  let files: string[];
  try {
    files = await readdir(SESSIONS);
  } catch {
    return null;
  }
  // Filenames embed an ISO timestamp, so lexicographic order is chronological order.
  const mine = files.filter((f) => f.startsWith(`${slug(childName)}--`)).sort();
  for (const f of mine.reverse()) {
    const saved = JSON.parse(await readFile(path.join(SESSIONS, f), "utf8")) as SavedSession;
    if (saved.summary) return saved.summary;
  }
  return null;
}
```

- [ ] **Step 4: Run and watch it pass**

Run: `npx vitest run lib/storage.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: The voices route**

Uses the REST endpoint directly rather than an SDK method, so it can't drift with SDK versions.

```ts
// app/api/voices/route.ts
export async function GET() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return Response.json({ error: "ELEVENLABS_API_KEY not set" }, { status: 500 });

  const res = await fetch("https://api.elevenlabs.io/v2/voices?page_size=100", {
    headers: { "xi-api-key": apiKey },
  });
  if (!res.ok) return Response.json({ error: "Could not list voices" }, { status: 502 });

  const data = (await res.json()) as {
    voices: { voice_id: string; name: string; preview_url: string }[];
  };
  return Response.json({
    voices: data.voices.map((v) => ({
      voiceId: v.voice_id,
      name: v.name,
      previewUrl: v.preview_url,
    })),
  });
}
```

- [ ] **Step 6: The profiles route**

```ts
// app/api/profiles/route.ts
import { loadProfile, saveProfile } from "../../../lib/storage";
import type { SessionConfig } from "../../../lib/types";

export async function GET(request: Request) {
  const childName = new URL(request.url).searchParams.get("childName");
  if (!childName) return Response.json({ config: null });
  return Response.json({ config: await loadProfile(childName) });
}

export async function POST(request: Request) {
  const config = (await request.json()) as SessionConfig;
  await saveProfile(config);
  return Response.json({ ok: true });
}
```

- [ ] **Step 7: The config form**

```tsx
// app/components/ConfigForm.tsx
"use client";

import { useEffect, useState } from "react";
import type { SessionConfig } from "../../lib/types";

type Voice = { voiceId: string; name: string; previewUrl: string };

const DEFAULTS: SessionConfig = {
  agentName: "Robo",
  voiceId: "",
  childName: "",
  childAge: 5,
  language: "en",
  goal: "",
  directives: "",
  minutes: 10,
};

export default function ConfigForm({ onStart }: { onStart: (config: SessionConfig) => void }) {
  const [config, setConfig] = useState<SessionConfig>(DEFAULTS);
  const [voices, setVoices] = useState<Voice[]>([]);

  useEffect(() => {
    fetch("/api/voices")
      .then((r) => r.json())
      .then((d) => {
        setVoices(d.voices ?? []);
        setConfig((c) => (c.voiceId ? c : { ...c, voiceId: d.voices?.[0]?.voiceId ?? "" }));
      })
      .catch(() => setVoices([]));
  }, []);

  // Reload a saved profile when the parent finishes typing the child's name.
  async function loadSaved() {
    if (!config.childName) return;
    const res = await fetch(`/api/profiles?childName=${encodeURIComponent(config.childName)}`);
    const { config: saved } = await res.json();
    if (saved) setConfig(saved);
  }

  const set = <K extends keyof SessionConfig>(key: K, value: SessionConfig[K]) =>
    setConfig((c) => ({ ...c, [key]: value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/profiles", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(config),
    });
    onStart(config);
  }

  const selectedVoice = voices.find((v) => v.voiceId === config.voiceId);

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 12, maxWidth: 480 }}>
      <label>
        Agent name
        <input value={config.agentName} onChange={(e) => set("agentName", e.target.value)} required />
      </label>

      <label>
        Voice
        <select value={config.voiceId} onChange={(e) => set("voiceId", e.target.value)} required>
          {voices.map((v) => (
            <option key={v.voiceId} value={v.voiceId}>{v.name}</option>
          ))}
        </select>
      </label>
      {selectedVoice && <audio controls src={selectedVoice.previewUrl} />}

      <label>
        Child's name
        <input
          value={config.childName}
          onChange={(e) => set("childName", e.target.value)}
          onBlur={loadSaved}
          required
        />
      </label>

      <label>
        Child's age
        <input
          type="number"
          min={2}
          max={12}
          value={config.childAge}
          onChange={(e) => set("childAge", Number(e.target.value))}
          required
        />
      </label>

      <label>
        Language
        <select value={config.language} onChange={(e) => set("language", e.target.value)}>
          <option value="en">English</option>
          <option value="ru">Russian</option>
          <option value="es">Spanish</option>
          <option value="de">German</option>
        </select>
      </label>

      <label>
        Goal
        <input
          value={config.goal}
          onChange={(e) => set("goal", e.target.value)}
          placeholder="Count to 10"
          required
        />
      </label>

      <label>
        Extra instructions
        <textarea
          value={config.directives}
          onChange={(e) => set("directives", e.target.value)}
          placeholder="She's shy — praise her a lot. She loves dinosaurs."
          rows={3}
        />
      </label>

      <label>
        Session length (minutes)
        <input
          type="number"
          min={3}
          max={30}
          value={config.minutes}
          onChange={(e) => set("minutes", Number(e.target.value))}
          required
        />
      </label>

      <button type="submit" disabled={!config.voiceId}>Start session</button>
    </form>
  );
}
```

- [ ] **Step 8: Wire the form into the page**

```tsx
// app/page.tsx
"use client";

import { useState } from "react";
import ConfigForm from "./components/ConfigForm";
import SessionView from "./components/SessionView";
import type { SessionConfig } from "../lib/types";

export default function Page() {
  const [config, setConfig] = useState<SessionConfig | null>(null);

  return (
    <main style={{ padding: 32, fontFamily: "system-ui" }}>
      <h1>AI Teacher</h1>
      {config ? (
        <SessionView config={config} onDone={() => setConfig(null)} />
      ) : (
        <ConfigForm onStart={setConfig} />
      )}
    </main>
  );
}
```

`SessionView` does not accept these props yet — that is Task 4. Expect a type error until then; do not "fix" it by loosening the types.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: config form, voice picker, profile storage"
```

---

### Task 4: The real session — prompt, transcript, timer, wind-down

The session view stops being a hardcoded demo. This is where the config actually reaches ElevenLabs, and where the wind-down signal (the difference between an agent that ends well and one that gets cut off mid-sentence) lives.

**Files:**
- Modify: `app/components/SessionView.tsx` (full rewrite)
- Create: `app/api/last-summary/route.ts`

**Interfaces:**
- Consumes: `buildPrompt`, `buildFirstMessage` (Task 2); `loadLatestSummary` (Task 3); `GET /api/signed-url` (Task 1).
- Produces: `SessionView` with props `{ config: SessionConfig; onDone: (session: Omit<SavedSession, "summary">) => void }`. `GET /api/last-summary?childName=Mia` → `{ summary: SessionSummary | null }`.

- [ ] **Step 1: The last-summary route**

The prompt must be built on the client (it needs the config the parent just typed), but the previous summary lives on disk, so the client fetches it.

```ts
// app/api/last-summary/route.ts
import { loadLatestSummary } from "../../../lib/storage";

export async function GET(request: Request) {
  const childName = new URL(request.url).searchParams.get("childName");
  if (!childName) return Response.json({ summary: null });
  return Response.json({ summary: await loadLatestSummary(childName) });
}
```

- [ ] **Step 2: Rewrite `SessionView`**

Three things here earn their complexity. **The prompt is built before `startSession`** and passed as an override. **The transcript is captured from `onMessage`** — check the shape you logged in Task 1 and adjust the `role` mapping if the SDK differs from what's written here. **The timer fires a contextual update at 80%** — the model has no clock, so this is the only thing that makes the wind-down happen.

```tsx
// app/components/SessionView.tsx
"use client";

import { useConversation } from "@elevenlabs/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildFirstMessage, buildPrompt } from "../../lib/prompt";
import type { SavedSession, SessionConfig, SessionSummary, TranscriptTurn } from "../../lib/types";

type Props = {
  config: SessionConfig;
  onDone: (session: Omit<SavedSession, "summary">) => void;
};

export default function SessionView({ config, onDone }: Props) {
  const [lastSummary, setLastSummary] = useState<SessionSummary | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptTurn[]>([]);
  const [secondsLeft, setSecondsLeft] = useState(config.minutes * 60);

  const startedAt = useRef<number>(0);
  const windDownSent = useRef(false);
  const finished = useRef(false);

  // Fetch the previous summary before we can build the prompt.
  useEffect(() => {
    fetch(`/api/last-summary?childName=${encodeURIComponent(config.childName)}`)
      .then((r) => r.json())
      .then((d) => setLastSummary(d.summary))
      .catch(() => setLastSummary(null))
      .finally(() => setReady(true));
  }, [config.childName]);

  const systemPrompt = useMemo(
    () => buildPrompt(config, lastSummary),
    [config, lastSummary],
  );

  const conversation = useConversation({
    onMessage: (msg: { message: string; source: string }) => {
      // The exact shape was logged in Task 1. `source` is the speaker:
      // "ai" for the agent, "user" for the child.
      setTranscript((t) => [
        ...t,
        {
          role: msg.source === "ai" ? "agent" : "child",
          text: msg.message,
          at: Date.now() - startedAt.current,
        },
      ]);
    },
    onDisconnect: () => finish(),
    onError: (e: Error) => setError(e.message),
    overrides: {
      agent: {
        prompt: { prompt: systemPrompt },
        firstMessage: buildFirstMessage(config),
        language: config.language,
      },
      tts: { voiceId: config.voiceId },
    },
  });

  // A dropped connection must not lose the session — we hand back whatever
  // transcript we have, and the summary step runs on it regardless.
  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    onDone({
      config,
      transcript,
      startedAt: new Date(startedAt.current).toISOString(),
      endedAt: new Date().toISOString(),
    });
  }, [config, transcript, onDone]);

  const start = useCallback(async () => {
    setError(null);
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("I need microphone permission to talk. Please allow it in your browser and try again.");
      return;
    }
    const res = await fetch("/api/signed-url");
    if (!res.ok) {
      setError("Could not start the session. Check your keys in .env.local.");
      return;
    }
    const { signedUrl } = await res.json();
    startedAt.current = Date.now();
    await conversation.startSession({
      signedUrl,
      dynamicVariables: {
        agent_name: config.agentName,
        child_name: config.childName,
        child_age: config.childAge,
        goal: config.goal,
        minutes: config.minutes,
      },
    });
  }, [conversation, config]);

  // The clock. The model has none — at 80% of the session we tell it to wrap up.
  useEffect(() => {
    if (conversation.status !== "connected") return;
    const id = setInterval(() => {
      setSecondsLeft((s) => {
        const next = s - 1;
        const total = config.minutes * 60;
        if (!windDownSent.current && next <= total * 0.2) {
          windDownSent.current = true;
          conversation.sendContextualUpdate(
            "Time is nearly up. Praise one specific thing she did today, then say a warm goodbye. Do not start anything new.",
          );
        }
        if (next <= 0) {
          conversation.endSession();
          return 0;
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [conversation, conversation.status, config.minutes]);

  if (!ready) return <p>Getting ready…</p>;

  const mins = Math.floor(secondsLeft / 60);
  const secs = String(secondsLeft % 60).padStart(2, "0");

  return (
    <section>
      <p>
        Status: {conversation.status} · {mins}:{secs} left
      </p>
      {error && <p style={{ color: "crimson" }}>{error}</p>}

      {conversation.status === "connected" ? (
        <button onClick={() => conversation.endSession()}>End session</button>
      ) : (
        <button onClick={start}>Start</button>
      )}

      <h2>Transcript</h2>
      <div style={{ maxHeight: 400, overflowY: "auto", border: "1px solid #ccc", padding: 12 }}>
        {transcript.length === 0 && <p style={{ color: "#888" }}>Nothing said yet.</p>}
        {transcript.map((turn, i) => (
          <p key={i}>
            <strong>{turn.role === "agent" ? config.agentName : config.childName}:</strong> {turn.text}
          </p>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Adjust `onDone` in the page**

`app/page.tsx` currently passes `onDone={() => setConfig(null)}`, which drops the session. Leave it for now — Task 5 replaces it with the summary flow. Confirm the app compiles and a full configured session runs end to end.

Run: `npm run dev`, fill the form, run a two-minute session.
Expected: the agent uses the name/voice/goal you chose, the transcript fills in live, and at 80% elapsed it starts wrapping up.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: configured session with live transcript, timer and wind-down"
```

---

### Task 5: Persistence and the Claude summary

The loop that makes the thing compound. The transcript is written to disk **before** Claude is called, so a summary failure can never cost you the session.

**Files:**
- Create: `app/api/summarize/route.ts`
- Create: `app/components/SummaryView.tsx`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `saveSession` (Task 3); `SavedSession`, `SessionSummary` (Task 2); the `Omit<SavedSession, "summary">` object emitted by `SessionView.onDone` (Task 4).
- Produces: `POST /api/summarize` with an `Omit<SavedSession, "summary">` body → `{ summary: SessionSummary | null; error?: string }`.

- [ ] **Step 1: The summarize route**

`transcriptQuality` is the field that earns its keep: it tells the parent that speech recognition is failing without them having to read every transcript. That is the cheapest possible instrument for the project's biggest risk.

```ts
// app/api/summarize/route.ts
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { saveSession } from "../../../lib/storage";
import type { SavedSession, SessionSummary } from "../../../lib/types";

const SummarySchema = z.object({
  whatWeDid: z.string(),
  grasped: z.array(z.string()),
  struggled: z.array(z.string()),
  nextFocus: z.string(),
  engagement: z.enum(["low", "medium", "high"]),
  transcriptQuality: z.enum(["good", "poor"]),
});

export async function POST(request: Request) {
  const session = (await request.json()) as Omit<SavedSession, "summary">;

  // Write first. A summary failure must never cost us the session.
  await saveSession({ ...session, summary: null });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ summary: null, error: "ANTHROPIC_API_KEY not set" }, { status: 500 });
  }

  const lines = session.transcript
    .map((t) => `${t.role === "agent" ? session.config.agentName : session.config.childName}: ${t.text}`)
    .join("\n");

  const client = new Anthropic({ apiKey });

  try {
    const response = await client.messages.parse({
      model: "claude-opus-4-8",
      max_tokens: 2000,
      output_config: { format: zodOutputFormat(SummarySchema) },
      messages: [
        {
          role: "user",
          content: `You are helping a parent understand how their child's lesson went.

The child is ${session.config.childName}, aged ${session.config.childAge}.
The goal of the session was: ${session.config.goal}
The teacher agent is called ${session.config.agentName}.

Here is the transcript:

${lines || "(the child said nothing)"}

Write a short, honest summary for the parent.

Be specific about what she grasped and what she struggled with — "counts 1 to 5
confidently", not "did well". If she lost interest, say when.

For transcriptQuality, judge whether the child's turns look like real speech that
was understood correctly, or like garbled nonsense. If speech recognition clearly
failed to understand her, mark it "poor" — this is how the parent finds out.`,
        },
      ],
    });

    const summary = response.parsed_output as SessionSummary | null;
    if (!summary) return Response.json({ summary: null, error: "Could not parse the summary" }, { status: 502 });

    await saveSession({ ...session, summary });
    return Response.json({ summary });
  } catch (e) {
    return Response.json(
      { summary: null, error: e instanceof Error ? e.message : "Summary failed" },
      { status: 502 },
    );
  }
}
```

- [ ] **Step 2: The summary view**

```tsx
// app/components/SummaryView.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import type { SavedSession, SessionSummary } from "../../lib/types";

type Props = {
  session: Omit<SavedSession, "summary">;
  onFinish: () => void;
};

export default function SummaryView({ session, onFinish }: Props) {
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const summarize = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/summarize", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(session),
    });
    const data = await res.json();
    setLoading(false);
    if (data.summary) setSummary(data.summary);
    else setError(data.error ?? "Could not write the summary. The transcript is saved.");
  }, [session]);

  useEffect(() => {
    summarize();
  }, [summarize]);

  if (loading) return <p>Writing the summary…</p>;

  if (error) {
    return (
      <section>
        <p style={{ color: "crimson" }}>{error}</p>
        <p>The transcript is saved either way.</p>
        <button onClick={summarize}>Retry</button>
        <button onClick={onFinish}>Done</button>
      </section>
    );
  }

  if (!summary) return null;

  return (
    <section>
      <h2>How it went</h2>
      <p>{summary.whatWeDid}</p>
      <p><strong>Confident with:</strong> {summary.grasped.join(", ") || "—"}</p>
      <p><strong>Struggled with:</strong> {summary.struggled.join(", ") || "—"}</p>
      <p><strong>Next time:</strong> {summary.nextFocus}</p>
      <p><strong>Engagement:</strong> {summary.engagement}</p>
      {summary.transcriptQuality === "poor" && (
        <p style={{ color: "crimson" }}>
          Heads up: speech recognition struggled to understand her this session. If this
          keeps happening, the transcripts are worth reading yourself.
        </p>
      )}
      <button onClick={onFinish}>Done</button>
    </section>
  );
}
```

- [ ] **Step 3: Wire the three views together**

```tsx
// app/page.tsx
"use client";

import { useState } from "react";
import ConfigForm from "./components/ConfigForm";
import SessionView from "./components/SessionView";
import SummaryView from "./components/SummaryView";
import type { SavedSession, SessionConfig } from "../lib/types";

type Finished = Omit<SavedSession, "summary">;

export default function Page() {
  const [config, setConfig] = useState<SessionConfig | null>(null);
  const [finished, setFinished] = useState<Finished | null>(null);

  return (
    <main style={{ padding: 32, fontFamily: "system-ui" }}>
      <h1>AI Teacher</h1>

      {finished ? (
        <SummaryView
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
    </main>
  );
}
```

- [ ] **Step 4: Run the whole loop twice**

Run: `npm run dev`. Configure a session for "Mia", run it, end it, read the summary. Then start a **second** session for Mia.

Expected: `data/sessions/mia--*.json` contains the transcript and summary. The second session's system prompt contains a "## Last time" section carrying the first session's `nextFocus`. Verify by logging `systemPrompt` in `SessionView` before `startSession`, or by observing that the agent references what happened last time.

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS, 11 tests (7 prompt, 4 storage).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: session persistence and Claude summary that seeds the next session"
```
