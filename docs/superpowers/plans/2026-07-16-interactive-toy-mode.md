# Interactive Toy Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a parent photograph a real physical toy, have an AI vision model identify it and build a child-safe persona, then run a voice session where the agent either *is* the toy (POV) or *guides play* with it (3rd Person).

**Architecture:** Three new pre-config screens (mode picker → scan → confirm) feed a prefilled version of the existing `ConfigForm`, then rejoin the untouched `SessionView → EndView → SummaryView` pipeline. Toy identity rides in two new optional `SessionConfig` fields, so a session is "toy mode" purely by their presence. The ElevenLabs override safety canary is left **completely unmodified** — POV mode satisfies it by setting `agentName` to the toy's spoken name.

**Tech Stack:** Next.js 16 (App Router, `proxy.ts` gate), React client components, `@anthropic-ai/sdk` with `messages.parse` + `zodOutputFormat` for structured/vision output, `@elevenlabs/react`, vitest (node env).

## Global Constraints

- **Server is stateless; no disk I/O.** All persistence is browser `localStorage` (`lib/browser-storage.ts`). New `SessionConfig` fields MUST be optional so existing saved records still parse.
- **Do NOT modify the override canary.** `lib/overrides.ts`, `buildFirstMessage`, and the canary logic in `SessionView.tsx` stay byte-for-byte unchanged. Toy mode works *within* the canary by making `agentName` the name the agent speaks.
- **No gendered pronouns in any text the agent is told or speaks.** Address the child by name or use singular "they". `lib/prompt.test.ts` enforces this and its coverage is extended to toy prompts.
- **Every API route returns JSON on every path** (matching `app/api/summarize/route.ts`): malformed body → 400, missing `ANTHROPIC_API_KEY` → 500, model/parse failure → 502.
- **Anthropic model id:** `claude-opus-4-8` (as already used in `summarize/route.ts`).
- **Anthropic base64 image block shape** (verified against installed SDK): `{ type: "image", source: { type: "base64", media_type: "image/jpeg" | "image/png", data } }` where `data` is base64 **without** the `data:` URL prefix.
- **Test env is node-only** (`vitest.config.ts` → `environment: "node"`). There is no jsdom/React testing stack. Test pure functions and route error-paths; verify UI/browser-only code by running the app (verify/run skill), not with unit tests.
- **New agent/persona text is pronoun-free**, child-safe, and keeps the existing guardrails (age rules, "big/upsetting topics → mum or dad", never ask for personal info, language-only rule, time/wind-down).

---

## File Structure

**Create:**
- `app/api/identify-toy/route.ts` — vision route: base64 image → `ToyInfo`.
- `app/api/identify-toy/route.test.ts` — error-path tests.
- `lib/image.ts` — `fitWithin` (pure) + `downscaleImage` (browser canvas).
- `lib/image.test.ts` — `fitWithin` tests.
- `app/components/ModePicker.tsx` + `ModePicker.module.css` — Lesson vs Interactive Toy.
- `app/components/ToyScan.tsx` + `ToyScan.module.css` — camera capture → identify.
- `app/components/ToyConfirm.tsx` + `ToyConfirm.module.css` — show toy, confirm/retake.

**Modify:**
- `lib/types.ts` — add `ToyMode`, `ToyInfo`, optional `toy`/`toyMode` on `SessionConfig`.
- `lib/prompt.ts` — add `buildPrompt` toy-mode branch (greeting untouched).
- `lib/prompt.test.ts` — toy-mode prompt tests.
- `app/page.tsx` — stage machine + new screens.
- `app/components/ConfigForm.tsx` — optional `toy` prop: prefill, purpose label, mode radio, POV agent-name handling, skip profile save/load in toy mode.
- `app/components/ConfigForm.module.css` — mode-radio styles.
- `app/api/summarize/route.ts` — extract `buildSummaryPrompt`, make it mode-aware.

**Unchanged (do not touch):** `lib/overrides.ts`, `app/components/SessionView.tsx`, `buildFirstMessage`/`buildWindDownMessage`, `SummaryView.tsx`, `lib/browser-storage.ts`, `proxy.ts`.

---

## Task 1: Toy types + `buildPrompt` toy-mode branch

**Files:**
- Modify: `lib/types.ts`
- Modify: `lib/prompt.ts`
- Test: `lib/prompt.test.ts`

**Interfaces:**
- Produces: `ToyMode = "pov" | "third-person"`; `ToyInfo = { name; character; personality; howToPlay }` (all `string`); `SessionConfig.toy?: ToyInfo`; `SessionConfig.toyMode?: ToyMode`. `buildPrompt(config, lastSummary)` unchanged signature — returns a toy prompt when `config.toy` is set, else the existing lesson prompt.
- Consumes: existing `youngChildRules`, `olderChildRules`, `LANGUAGES` (module-private in `lib/prompt.ts`).

- [ ] **Step 1: Add the types**

In `lib/types.ts`, after the `SessionConfig` type add:

```ts
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
```

And add two optional fields to `SessionConfig` (leave every existing field as-is):

```ts
  minutes: number;
  // Present only for an Interactive Toy session. Their presence is what puts
  // buildPrompt into toy mode; absent, everything behaves as a normal lesson.
  toy?: ToyInfo;
  toyMode?: ToyMode;
```

- [ ] **Step 2: Write the failing toy-prompt tests**

In `lib/prompt.test.ts`, add a toy base config near the top (after `base`):

```ts
import type { Language, SessionConfig, SessionSummary, ToyInfo } from "./types";

const toy: ToyInfo = {
  name: "Buzz Lightyear",
  character: "a brave space-ranger action figure",
  personality: "confident, heroic, a little goofy",
  howToPlay: "blast off on pretend missions, count stars, rescue other toys",
};

const povConfig: SessionConfig = {
  ...base,
  agentName: "Buzz Lightyear", // POV: the agent speaks as the toy
  goal: "have fun exploring space together",
  directives: "Loves rockets. Praise a lot.",
  toy,
  toyMode: "pov",
};

const thirdConfig: SessionConfig = {
  ...povConfig,
  agentName: "Robo", // 3rd person: the guide keeps its own name
  toyMode: "third-person",
};
```

Then add this describe block:

```ts
describe("buildPrompt — toy mode", () => {
  it("POV: tells the agent it IS the toy, in first person", () => {
    const p = buildPrompt(povConfig, null);
    expect(p).toContain("You ARE Buzz Lightyear");
    expect(p).toContain("first person");
    expect(p).toContain("blast off on pretend missions");
    expect(p).toContain("Mia");
  });

  it("3rd person: the agent guides play and is NOT the toy", () => {
    const p = buildPrompt(thirdConfig, null);
    expect(p).toContain("Robo");
    expect(p).toContain("Buzz Lightyear");
    expect(p).toContain("NOT the toy");
  });

  it("keeps the child-safety guardrails and swaps the real-person line for the toy-play one", () => {
    for (const cfg of [povConfig, thirdConfig]) {
      const p = buildPrompt(cfg, null);
      expect(p).toContain("wonderful question for their mum or dad");
      expect(p).toContain("Never ask for personal information");
      expect(p).toContain("never claim to be a real living person");
      expect(p).not.toContain("Never claim to be a real person");
    }
  });

  it("states the language in toy mode too", () => {
    expect(buildPrompt({ ...povConfig, language: "ru" }, null)).toContain("Russian");
  });

  const GENDERED_TOY = /\b(she|her|hers|herself|he|him|his|himself)\b/i;
  const neutralToy: SessionConfig = { ...povConfig, directives: "Loves rockets. Praise a lot." };
  for (const [label, cfg] of [
    ["pov", neutralToy],
    ["third-person", { ...neutralToy, agentName: "Robo", toyMode: "third-person" } as SessionConfig],
  ] as const) {
    it(`contains no gendered pronoun: ${label}`, () => {
      expect(buildPrompt(cfg, null)).not.toMatch(GENDERED_TOY);
    });
  }
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run lib/prompt.test.ts`
Expected: FAIL — the toy assertions fail because `buildPrompt` still returns the lesson prompt (no `"You ARE Buzz Lightyear"`).

- [ ] **Step 4: Implement the toy-mode branch in `lib/prompt.ts`**

Add these helpers **above** `buildPrompt` (after `guardrails`):

```ts
// Toy-mode guardrails. Identical child-safety spine as guardrails() above, with
// one deliberate change: a child playing with a toy character is the whole
// point, so "Never claim to be a real person" is replaced by a line that allows
// the fictional toy persona while still forbidding impersonating a real human.
function toyGuardrails(name: string, toyName: string): string {
  return `
- Keep everything gentle and age-appropriate.
- If ${name} raises something big or upsetting — death, scary news, family matters —
  warmly say that is a wonderful question for their mum or dad, and gently return
  to playing.
- You may play the part of ${toyName}, but never claim to be a real living person.
- Never ask for personal information.`;
}

// The opening + persona paragraph, which is the only part that differs between
// the two toy modes.
function toyPersona(config: SessionConfig, toy: ToyInfo): string {
  const name = config.childName;
  if (config.toyMode === "third-person") {
    return `You are ${config.agentName}, a warm, playful guide helping ${name}, who is ${config.childAge}, play with their ${toy.name} — ${toy.character}.
You are NOT the toy. You are a friendly helper who suggests games, cheers ${name} on, and voices ${toy.name} now and then to bring it to life.
${toy.name}'s personality: ${toy.personality}.`;
  }
  return `You ARE ${toy.name} — ${toy.character}. You are a toy, and ${name}, who is ${config.childAge}, is holding you and playing with you right now.
Speak in the first person, always as ${toy.name}. Stay in character the whole time — react and sound like ${toy.name} would.
Your personality: ${toy.personality}.`;
}

function buildToyPrompt(config: SessionConfig, toy: ToyInfo, lastSummary: SessionSummary | null): string {
  const name = config.childName;
  const ageRules = config.childAge < 6 ? youngChildRules(name) : olderChildRules(name);
  const language = LANGUAGES[config.language].name;
  const continuity = lastSummary
    ? `
## Last time
Last time, ${name} played: ${lastSummary.whatWeDid}`
    : "";

  return `${toyPersona(config, toy)}

## Language
Speak ONLY in ${language}. Every word you say to ${name} is in ${language}, including
your praise and your goodbye. ${name} may not understand any other language.

## What ${name} wants to do
${config.goal}

Make this playful, not a lesson — games, silly voices, stories, pretend adventures.
Follow ${name}'s lead. Ideas for playing with ${name}: ${toy.howToPlay}

## How to talk to ${name}
${ageRules}

## What ${name}'s parent told you
${config.directives}
${continuity}

## Rules
${toyGuardrails(name, toy.name)}

## Time
You have about ${config.minutes} minutes. When you are told that time is nearly up,
praise one specific thing ${name} did today, then say a warm goodbye. Do not start
anything new.`;
}
```

Then, at the very top of `buildPrompt`, add the branch (before the existing `const name = ...` line):

```ts
export function buildPrompt(config: SessionConfig, lastSummary: SessionSummary | null): string {
  // A toy session is identified purely by config.toy being present. Everything
  // below this line is the unchanged lesson prompt.
  if (config.toy) return buildToyPrompt(config, config.toy, lastSummary);

  const name = config.childName;
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run lib/prompt.test.ts`
Expected: PASS — all toy tests plus the unchanged lesson/greeting/pronoun tests.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add lib/types.ts lib/prompt.ts lib/prompt.test.ts
git commit -m "feat: toy types and buildPrompt toy-mode branch"
```

---

## Task 2: `/api/identify-toy` vision route

**Files:**
- Create: `app/api/identify-toy/route.ts`
- Test: `app/api/identify-toy/route.test.ts`

**Interfaces:**
- Consumes: `ToyInfo` from `lib/types.ts`; `claude-opus-4-8`; Anthropic base64 image block.
- Produces: `POST` accepting JSON `{ image: string /* base64, no data-URL prefix */, mediaType?: "image/jpeg" | "image/png" }`, returning `{ toy: ToyInfo | null, error?: string }`. `toy: null` with 200 means "no toy recognized"; `toy: null` with 4xx/5xx means an error (message in `error`).

- [ ] **Step 1: Write the failing error-path tests**

Create `app/api/identify-toy/route.test.ts`:

```ts
// app/api/identify-toy/route.test.ts
//
// The route is stateless: base64 image in, ToyInfo (or null) out, no disk.
// These cover the failure modes that must come back as JSON rather than an
// unhandled exception — a malformed body, a missing image field, and a missing
// ANTHROPIC_API_KEY (which stands in for any Claude-side failure without a
// network call). Every path out of this route must be JSON.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST } from "./route";

function postRequest(body: string): Request {
  return new Request("http://localhost/api/identify-toy", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

let realKey: string | undefined;
beforeEach(() => {
  realKey = process.env.ANTHROPIC_API_KEY;
});
afterEach(() => {
  if (realKey === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = realKey;
});

describe("POST /api/identify-toy — failure paths always return JSON", () => {
  it("returns a JSON 400 for a malformed body", async () => {
    const res = await POST(postRequest("not json"));
    expect(res.status).toBe(400);
    const data = (await res.json()) as { toy: unknown; error?: string };
    expect(data.toy).toBeNull();
    expect(typeof data.error).toBe("string");
  });

  it("returns a JSON 400 when no image is provided", async () => {
    const res = await POST(postRequest(JSON.stringify({})));
    expect(res.status).toBe(400);
    const data = (await res.json()) as { toy: unknown; error?: string };
    expect(data.toy).toBeNull();
    expect(typeof data.error).toBe("string");
  });

  it("returns a JSON 500 when Claude can't be called", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = await POST(postRequest(JSON.stringify({ image: "abc123" })));
    expect(res.status).toBe(500);
    const data = (await res.json()) as { toy: unknown; error?: string };
    expect(data.toy).toBeNull();
    expect(typeof data.error).toBe("string");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run app/api/identify-toy/route.test.ts`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Implement the route**

Create `app/api/identify-toy/route.ts`:

```ts
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { ToyInfo } from "../../../lib/types";

// Stateless, like the summarize route: a base64 photo in, a toy persona out,
// nothing touched on disk. The passcode proxy (proxy.ts) already gates this.
type IdentifyRequest = { image?: unknown; mediaType?: unknown };

const ToyIdentificationSchema = z.object({
  // The model reports whether it actually saw a toy. A photo of a wall or a
  // hand is not a toy; we surface that to the parent rather than inventing one.
  recognized: z.boolean(),
  toy: z
    .object({
      name: z.string(),
      character: z.string(),
      personality: z.string(),
      howToPlay: z.string(),
    })
    .nullable(),
});

export async function POST(request: Request) {
  let body: IdentifyRequest;
  try {
    body = (await request.json()) as IdentifyRequest;
  } catch {
    return Response.json({ toy: null, error: "Malformed request body" }, { status: 400 });
  }

  const image = typeof body.image === "string" ? body.image : "";
  if (!image) {
    return Response.json({ toy: null, error: "No image provided" }, { status: 400 });
  }
  const mediaType = body.mediaType === "image/png" ? "image/png" : "image/jpeg";

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return Response.json({ toy: null, error: "ANTHROPIC_API_KEY not set" }, { status: 500 });
    }

    const client = new Anthropic({ apiKey });
    const response = await client.messages.parse({
      model: "claude-opus-4-8",
      max_tokens: 1000,
      output_config: { format: zodOutputFormat(ToyIdentificationSchema) },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: image } },
            {
              type: "text",
              text: `A parent has photographed a physical toy so their young child can play with it, voiced by an AI.

Identify the toy in this photo and build a warm, child-safe persona for it.

- name: what the toy is / the character it depicts, as it would introduce itself
  out loud to a child (e.g. "Buzz Lightyear", "the fluffy brown teddy bear").
- character: one short phrase describing what it is.
- personality: a few friendly, age-appropriate traits.
- howToPlay: grounded, concrete ideas for imaginative play with THIS toy.

If the photo does not clearly show a toy, set recognized to false and toy to null.
Keep everything gentle and suitable for a young child. Never invent scary,
violent, or adult themes even if the toy could suggest them.`,
            },
          ],
        },
      ],
    });

    const result = response.parsed_output;
    if (!result) {
      return Response.json({ toy: null, error: "Could not read the photo" }, { status: 502 });
    }
    // Not an error — the model looked and there was no toy. 200 with toy:null so
    // the client can show "couldn't spot a toy" rather than a failure.
    if (!result.recognized || !result.toy) {
      return Response.json({ toy: null });
    }
    return Response.json({ toy: result.toy as ToyInfo });
  } catch (e) {
    return Response.json(
      { toy: null, error: e instanceof Error ? e.message : "Identification failed" },
      { status: 502 },
    );
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run app/api/identify-toy/route.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add app/api/identify-toy/route.ts app/api/identify-toy/route.test.ts
git commit -m "feat: /api/identify-toy vision route"
```

---

## Task 3: Client image downscale helper

**Files:**
- Create: `lib/image.ts`
- Test: `lib/image.test.ts`

**Interfaces:**
- Produces: `fitWithin(width: number, height: number, max: number): { width: number; height: number }` (pure); `downscaleImage(file: File, max?: number): Promise<{ data: string; mediaType: "image/jpeg" }>` (browser-only; `data` is base64 with no data-URL prefix).
- Consumed by: `ToyScan.tsx` (Task 5).

- [ ] **Step 1: Write the failing `fitWithin` tests**

Create `lib/image.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { fitWithin } from "./image";

describe("fitWithin", () => {
  it("leaves an already-small image untouched", () => {
    expect(fitWithin(800, 600, 1024)).toEqual({ width: 800, height: 600 });
  });

  it("scales a large landscape image down to the max longest side", () => {
    expect(fitWithin(4000, 3000, 1024)).toEqual({ width: 1024, height: 768 });
  });

  it("scales a large portrait image down to the max longest side", () => {
    expect(fitWithin(3000, 4000, 1024)).toEqual({ width: 768, height: 1024 });
  });

  it("handles a square image", () => {
    expect(fitWithin(2048, 2048, 1024)).toEqual({ width: 1024, height: 1024 });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/image.test.ts`
Expected: FAIL — `Cannot find module './image'`.

- [ ] **Step 3: Implement `lib/image.ts`**

```ts
// Photo handling for the toy scanner. Native camera photos are multi-megabyte;
// we downscale in the browser before upload so we stay well under Anthropic's
// image limits and keep latency and credit spend down.

// Pure: the target dimensions that fit within `max` on the longest side while
// preserving aspect ratio. Separated out so it can be unit-tested without a DOM.
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  if (width <= max && height <= max) return { width, height };
  const scale = max / Math.max(width, height);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

// Browser-only: decode `file`, draw it downscaled onto a canvas, and return
// base64 JPEG WITHOUT the "data:image/jpeg;base64," prefix (what the
// identify-toy route and the Anthropic image block expect).
export async function downscaleImage(
  file: File,
  max = 1024,
): Promise<{ data: string; mediaType: "image/jpeg" }> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = fitWithin(bitmap.width, bitmap.height, max);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process the photo on this device.");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
  return { data: dataUrl.split(",")[1] ?? "", mediaType: "image/jpeg" };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/image.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/image.ts lib/image.test.ts
git commit -m "feat: client image downscale helper"
```

---

## Task 4: Mode picker + page stage machine

**Files:**
- Create: `app/components/ModePicker.tsx`
- Create: `app/components/ModePicker.module.css`
- Modify: `app/page.tsx`

**Interfaces:**
- Produces: `ModePicker` with props `{ onLesson: () => void; onToy: () => void }`. `page.tsx` gains a `Stage` machine: `home → lessonConfig | toyScan → toyConfirm → toyConfig`, then the existing `config`/`finished` states drive `SessionView`/`EndView`.
- Consumes: `ToyScan`/`ToyConfirm` are added in Task 5; this task routes to them via placeholders so the Lesson path is fully working and reviewable on its own.

- [ ] **Step 1: Create `ModePicker`**

`app/components/ModePicker.tsx`:

```tsx
"use client";

import styles from "./ModePicker.module.css";

// The landing choice: run a normal lesson (the original flow) or start an
// Interactive Toy session (photograph a real toy, then play with it by voice).
export default function ModePicker({ onLesson, onToy }: { onLesson: () => void; onToy: () => void }) {
  return (
    <section className={styles.picker} aria-label="Choose a mode">
      <button type="button" className={styles.tile} onClick={onLesson}>
        <span className={styles.emoji} aria-hidden="true">📚</span>
        <span className={styles.tileTitle}>Lesson</span>
        <span className={styles.tileSub}>A short spoken lesson toward a goal you set.</span>
      </button>
      <button type="button" className={styles.tile} onClick={onToy}>
        <span className={styles.emoji} aria-hidden="true">🧸</span>
        <span className={styles.tileTitle}>Interactive Toy</span>
        <span className={styles.tileSub}>Scan a real toy and bring it to life to play with.</span>
      </button>
    </section>
  );
}
```

`app/components/ModePicker.module.css`:

```css
.picker {
  display: grid;
  gap: 16px;
  margin-top: 8px;
}
.tile {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  padding: 20px;
  border: 1px solid var(--border, #d7d7e0);
  border-radius: 16px;
  background: var(--card, #fff);
  text-align: left;
  cursor: pointer;
}
.tile:hover {
  border-color: var(--accent, #6c5ce7);
}
.emoji {
  font-size: 32px;
}
.tileTitle {
  font-size: 18px;
  font-weight: 600;
}
.tileSub {
  font-size: 14px;
  opacity: 0.75;
}
```

- [ ] **Step 2: Rewrite `app/page.tsx` with the stage machine**

Replace the entire file with:

```tsx
"use client";

import { useState } from "react";
import ConfigForm from "./components/ConfigForm";
import EndView from "./components/EndView";
import SessionView from "./components/SessionView";
import ModePicker from "./components/ModePicker";
import ToyScan from "./components/ToyScan";
import ToyConfirm from "./components/ToyConfirm";
import type { SavedSession, SessionConfig, ToyInfo } from "../lib/types";
import styles from "./app.module.css";

type Finished = Omit<SavedSession, "summary">;

// Pre-config navigation. Once `config` is set we hand off to SessionView, and
// once `finished` is set, to EndView — both unchanged from before.
type Stage =
  | { name: "home" }
  | { name: "lessonConfig" }
  | { name: "toyScan" }
  | { name: "toyConfirm"; toy: ToyInfo }
  | { name: "toyConfig"; toy: ToyInfo };

export default function Page() {
  const [config, setConfig] = useState<SessionConfig | null>(null);
  const [finished, setFinished] = useState<Finished | null>(null);
  const [stage, setStage] = useState<Stage>({ name: "home" });

  const reset = () => {
    setFinished(null);
    setConfig(null);
    setStage({ name: "home" });
  };

  let body: React.ReactNode;
  if (finished) {
    body = <EndView session={finished} onFinish={reset} />;
  } else if (config) {
    body = <SessionView config={config} onDone={setFinished} />;
  } else if (stage.name === "home") {
    body = (
      <ModePicker
        onLesson={() => setStage({ name: "lessonConfig" })}
        onToy={() => setStage({ name: "toyScan" })}
      />
    );
  } else if (stage.name === "lessonConfig") {
    body = <ConfigForm onStart={setConfig} />;
  } else if (stage.name === "toyScan") {
    body = (
      <ToyScan
        onIdentified={(toy) => setStage({ name: "toyConfirm", toy })}
        onBack={() => setStage({ name: "home" })}
      />
    );
  } else if (stage.name === "toyConfirm") {
    body = (
      <ToyConfirm
        toy={stage.toy}
        onConfirm={() => setStage({ name: "toyConfig", toy: stage.toy })}
        onRetake={() => setStage({ name: "toyScan" })}
      />
    );
  } else {
    body = <ConfigForm toy={stage.toy} onStart={setConfig} />;
  }

  return (
    <main className={styles.shell}>
      <div className={styles.inner}>
        <h1 className={styles.title}>AI Teacher</h1>
        {body}
      </div>
    </main>
  );
}
```

Note: `ToyScan`, `ToyConfirm`, and `ConfigForm`'s `toy` prop are implemented in Tasks 5–6. To keep this task independently runnable, create **temporary stub files** so it compiles:

`app/components/ToyScan.tsx` (stub — replaced in Task 5):

```tsx
"use client";
import type { ToyInfo } from "../../lib/types";
export default function ToyScan({ onBack }: { onIdentified: (toy: ToyInfo) => void; onBack: () => void }) {
  return <button onClick={onBack}>Toy scan coming next</button>;
}
```

`app/components/ToyConfirm.tsx` (stub — replaced in Task 5):

```tsx
"use client";
import type { ToyInfo } from "../../lib/types";
export default function ToyConfirm({ toy, onConfirm }: { toy: ToyInfo; onConfirm: () => void; onRetake: () => void }) {
  return <button onClick={onConfirm}>Use {toy.name}</button>;
}
```

And make `ConfigForm` accept an ignored optional `toy` prop for now — in `app/components/ConfigForm.tsx` change the signature to:

```tsx
export default function ConfigForm({ onStart }: { onStart: (config: SessionConfig) => void; toy?: ToyInfo }) {
```

and add `import type { SessionConfig, ToyInfo } from "../../lib/types";` (extend the existing type import). Task 6 gives `toy` its real behavior.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Verify the Lesson path still works end-to-end**

Run the app (`npm run dev`, unlock with `APP_PASSCODE`). Confirm: the landing screen shows the two tiles; **Lesson** → the existing config form → a session starts and the override canary still passes; **Interactive Toy** → the stub button appears and **Back** returns home. Use the verify/run skill to drive this.

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx app/components/ModePicker.tsx app/components/ModePicker.module.css app/components/ToyScan.tsx app/components/ToyConfirm.tsx app/components/ConfigForm.tsx
git commit -m "feat: mode picker and page stage machine"
```

---

## Task 5: Scan + confirmation screens

**Files:**
- Modify: `app/components/ToyScan.tsx` (replace stub)
- Create: `app/components/ToyScan.module.css`
- Modify: `app/components/ToyConfirm.tsx` (replace stub)
- Create: `app/components/ToyConfirm.module.css`

**Interfaces:**
- Consumes: `downscaleImage` (`lib/image.ts`), `POST /api/identify-toy`, `ToyInfo`.
- Produces: `ToyScan` props `{ onIdentified: (toy: ToyInfo) => void; onBack: () => void }`; `ToyConfirm` props `{ toy: ToyInfo; onConfirm: () => void; onRetake: () => void }`.

- [ ] **Step 1: Implement `ToyScan`**

Replace `app/components/ToyScan.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";
import { downscaleImage } from "../../lib/image";
import type { ToyInfo } from "../../lib/types";
import styles from "./ToyScan.module.css";

type Props = { onIdentified: (toy: ToyInfo) => void; onBack: () => void };

// A single "take a photo" button. `capture="environment"` opens the rear camera
// on phones/tablets and a file picker on desktop — no camera libraries. The
// photo is downscaled in the browser, then sent to /api/identify-toy.
export default function ToyScan({ onIdentified, onBack }: Props) {
  const [status, setStatus] = useState<"idle" | "working">("idle");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset the input so picking the same file again still fires onChange.
    e.target.value = "";
    if (!file) return;

    setError(null);
    setStatus("working");
    try {
      const { data, mediaType } = await downscaleImage(file);
      const res = await fetch("/api/identify-toy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ image: data, mediaType }),
      });
      const payload: { toy?: ToyInfo | null; error?: string } = await res
        .json()
        .catch(() => ({}) as { toy?: ToyInfo | null; error?: string });
      if (!res.ok) {
        throw new Error(payload.error ?? `The photo could not be processed (HTTP ${res.status}).`);
      }
      if (!payload.toy) {
        setError("I couldn't spot a toy in that photo. Try again with the toy filling the frame.");
        setStatus("idle");
        return;
      }
      onIdentified(payload.toy);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong reading the photo.");
      setStatus("idle");
    }
  }

  return (
    <section className={styles.scan} aria-label="Scan a toy">
      <p className={styles.lead}>Take a clear photo of the toy, filling the frame.</p>

      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onFile}
        hidden
      />

      <button
        type="button"
        className={styles.shutter}
        onClick={() => inputRef.current?.click()}
        disabled={status === "working"}
      >
        {status === "working" ? "Looking at the toy…" : "📷 Take a photo of the toy"}
      </button>

      <button type="button" className={styles.back} onClick={onBack} disabled={status === "working"}>
        Back
      </button>
    </section>
  );
}
```

`app/components/ToyScan.module.css`:

```css
.scan {
  display: grid;
  gap: 16px;
  text-align: center;
}
.lead {
  opacity: 0.8;
}
.shutter {
  padding: 18px;
  font-size: 17px;
  font-weight: 600;
  border: none;
  border-radius: 16px;
  background: var(--accent, #6c5ce7);
  color: #fff;
  cursor: pointer;
}
.shutter:disabled {
  opacity: 0.6;
  cursor: default;
}
.back {
  padding: 10px;
  background: none;
  border: none;
  color: var(--accent, #6c5ce7);
  cursor: pointer;
}
.error {
  color: #b00020;
  background: #fde7ea;
  padding: 10px 12px;
  border-radius: 10px;
}
```

- [ ] **Step 2: Implement `ToyConfirm`**

Replace `app/components/ToyConfirm.tsx`:

```tsx
"use client";

import type { ToyInfo } from "../../lib/types";
import styles from "./ToyConfirm.module.css";

type Props = { toy: ToyInfo; onConfirm: () => void; onRetake: () => void };

// Show what the vision model saw and let the parent confirm before it becomes
// the agent's persona. Retake goes back to the camera.
export default function ToyConfirm({ toy, onConfirm, onRetake }: Props) {
  return (
    <section className={styles.confirm} aria-label="Confirm the toy">
      <span className={styles.emoji} aria-hidden="true">🧸</span>
      <h2 className={styles.name}>{toy.name}</h2>
      <p className={styles.character}>{toy.character}</p>
      <dl className={styles.detail}>
        <dt>Personality</dt>
        <dd>{toy.personality}</dd>
        <dt>How you'll play</dt>
        <dd>{toy.howToPlay}</dd>
      </dl>
      <button type="button" className={styles.use} onClick={onConfirm}>
        Use this toy
      </button>
      <button type="button" className={styles.retake} onClick={onRetake}>
        Retake photo
      </button>
    </section>
  );
}
```

`app/components/ToyConfirm.module.css`:

```css
.confirm {
  display: grid;
  gap: 10px;
  text-align: center;
  justify-items: center;
}
.emoji {
  font-size: 40px;
}
.name {
  margin: 0;
  font-size: 22px;
}
.character {
  opacity: 0.8;
  margin: 0;
}
.detail {
  text-align: left;
  width: 100%;
  display: grid;
  gap: 4px;
  margin: 8px 0;
}
.detail dt {
  font-weight: 600;
  font-size: 13px;
  opacity: 0.7;
}
.detail dd {
  margin: 0 0 8px;
}
.use {
  width: 100%;
  padding: 16px;
  font-size: 16px;
  font-weight: 600;
  border: none;
  border-radius: 16px;
  background: var(--accent, #6c5ce7);
  color: #fff;
  cursor: pointer;
}
.retake {
  background: none;
  border: none;
  color: var(--accent, #6c5ce7);
  cursor: pointer;
  padding: 8px;
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Verify scan → confirm**

Run the app. Choose **Interactive Toy**, photograph a toy (or, on desktop, pick a saved toy photo via the same file dialog). Confirm the identified toy card renders name/character/personality/howToPlay, that a non-toy photo shows the "couldn't spot a toy" message, and that **Retake** returns to the camera. Use the verify/run skill.

- [ ] **Step 5: Commit**

```bash
git add app/components/ToyScan.tsx app/components/ToyScan.module.css app/components/ToyConfirm.tsx app/components/ToyConfirm.module.css
git commit -m "feat: toy scan and confirmation screens"
```

---

## Task 6: Toy-aware `ConfigForm` (prefill, mode radio, POV naming)

**Files:**
- Modify: `app/components/ConfigForm.tsx`
- Modify: `app/components/ConfigForm.module.css`

**Interfaces:**
- Consumes: `ToyInfo`, `ToyMode` from `lib/types.ts`; the `toy?: ToyInfo` prop wired in Task 4.
- Produces: when `toy` is set, `onStart` receives a `SessionConfig` carrying `toy`, `toyMode`, and an `agentName` equal to the toy's name in POV mode (so the greeting/canary name the toy).

- [ ] **Step 1: Add toy state and prop handling**

In `app/components/ConfigForm.tsx`:

1. Extend the type import (already done in Task 4): ensure `import type { SessionConfig, ToyInfo, ToyMode } from "../../lib/types";`.

2. The signature is `{ onStart, toy }` (from Task 4). Compute the initial config from `toy`. Replace the `useState<SessionConfig>(DEFAULTS)` initializer with a lazy initializer:

```tsx
  const [config, setConfig] = useState<SessionConfig>(() =>
    toy
      ? { ...DEFAULTS, agentName: toy.name, goal: "", toy, toyMode: "pov" as ToyMode }
      : DEFAULTS,
  );
```

- [ ] **Step 2: Guard profile load/cards behind lesson mode**

Toy sessions must not pull in or overwrite a child's saved *lesson* profile (a saved `toy` field would otherwise silently push a later lesson into toy mode). Make three changes:

1. In `loadSaved()`, first line:

```tsx
  function loadSaved() {
    if (toy) return; // toy sessions never load a stored lesson profile
    if (!config.childName) return;
```

2. In `submit()`, skip the profile save when in toy mode. Replace the `try { saveProfile(chosen); } catch {}` block with:

```tsx
    // Toy sessions are ephemeral and must not overwrite the child's saved
    // lesson profile (which would also poison a later lesson with toy fields).
    if (!toy) {
      try {
        saveProfile(chosen);
      } catch {
        // Saving the profile is a convenience; losing it must not block the session.
      }
    }
```

3. Hide the "Pick up where you left off" cards in toy mode — wrap the existing `{profiles.length > 0 && (...)}` section start condition:

```tsx
      {!toy && profiles.length > 0 && (
```

- [ ] **Step 3: Add the interaction-mode radio and POV agent-name handling**

Add a `toyMode` setter helper near `set` (it reuses `set`, which marks the field touched):

```tsx
  const setToyMode = (mode: ToyMode) => {
    // In POV the agent speaks AS the toy, so its introduced name must be the
    // toy's name (the greeting says "I'm {agentName}", and the safety canary
    // requires that name in the first spoken turn). Switching to POV forces it;
    // switching to 3rd person restores a guide name if the toy name was in place.
    setConfig((c) => ({
      ...c,
      toyMode: mode,
      agentName: mode === "pov" ? (toy?.name ?? c.agentName) : c.agentName === toy?.name ? "Robo" : c.agentName,
    }));
  };
```

Then, inside the `What` fieldset, when `toy` is present, render a mode selector and relabel the goal. Replace the `Goal` field's `<label>` text conditionally, and add the radio group above it. Concretely, inside `<fieldset>` for `What`, at the top add:

```tsx
          {toy && (
            <div className={styles.field}>
              <span className={styles.modeLabel}>How should {config.agentName || toy.name} play?</span>
              <div className={styles.modeGroup} role="radiogroup" aria-label="Interaction mode">
                <label className={styles.modeOption}>
                  <input
                    type="radio"
                    name={`${formId}-toyMode`}
                    checked={config.toyMode === "pov"}
                    onChange={() => setToyMode("pov")}
                  />
                  <span>
                    <strong>Be the toy</strong> — the AI talks as {toy.name}.
                  </span>
                </label>
                <label className={styles.modeOption}>
                  <input
                    type="radio"
                    name={`${formId}-toyMode`}
                    checked={config.toyMode === "third-person"}
                    onChange={() => setToyMode("third-person")}
                  />
                  <span>
                    <strong>Help me play</strong> — a guide helps the child play with {toy.name}.
                  </span>
                </label>
              </div>
            </div>
          )}
```

And change the Goal label to be purpose-aware:

```tsx
            <label htmlFor={`${formId}-goal`}>{toy ? "Purpose of play" : "Goal"}</label>
```

with the goal input's `placeholder` also conditional:

```tsx
              placeholder={toy ? "Practice colours; wind down before bed" : "Count to 10"}
```

- [ ] **Step 4: Handle the Agent-name field in toy mode**

In POV mode the agent name is forced to the toy name and must not be freely edited (editing it would desync the persona from the spoken greeting). In the `How` fieldset, replace the existing Agent-name `<div className={styles.field}>…</div>` with:

```tsx
          {toy && config.toyMode === "pov" ? (
            <p className={styles.note}>
              {toy.name} will introduce itself by name when the session starts.
            </p>
          ) : (
            <div className={styles.field}>
              <label htmlFor={`${formId}-agentName`}>{toy ? "Helper's name" : "Agent name"}</label>
              <input
                id={`${formId}-agentName`}
                value={config.agentName}
                onChange={(e) => set("agentName", e.target.value)}
                required
              />
            </div>
          )}
```

- [ ] **Step 5: Add the mode-radio styles**

Append to `app/components/ConfigForm.module.css`:

```css
.modeLabel {
  display: block;
  font-weight: 600;
  margin-bottom: 8px;
}
.modeGroup {
  display: grid;
  gap: 10px;
}
.modeOption {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 12px;
  border: 1px solid var(--border, #d7d7e0);
  border-radius: 12px;
  cursor: pointer;
}
.modeOption input {
  margin-top: 3px;
}
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Verify a full toy session (both modes)**

Run the app. Complete Interactive Toy → scan → confirm → toy config. Check:
- The mode radio shows; **Be the toy** hides the agent-name field and shows the "introduces itself" note; **Help me play** shows a "Helper's name" field defaulting to "Robo".
- Set child name/age, purpose, pick a voice, start.
- **POV:** the agent's first spoken line is *"Hi {child}! I'm {toy name}. Are you ready to play?"* and the session does NOT trip the "overrides are not enabled" alarm (the canary passes because `agentName` = toy name).
- **3rd Person:** the agent introduces itself as Robo and talks about playing with the toy.

Use the verify/run skill and confirm against the real ElevenLabs session.

- [ ] **Step 8: Commit**

```bash
git add app/components/ConfigForm.tsx app/components/ConfigForm.module.css
git commit -m "feat: toy-aware config form with POV/3rd-person modes"
```

---

## Task 7: Mode-aware summary

**Files:**
- Modify: `app/api/summarize/route.ts`
- Test: `app/api/summarize/route.test.ts`

**Interfaces:**
- Produces: `buildSummaryPrompt(session: Omit<SavedSession, "summary">, lines: string): string` (exported, pure) that frames a *play recap* when `session.config.toy` is set and a *lesson summary* otherwise. `SessionSummary` and `SummaryView` are unchanged.

- [ ] **Step 1: Write the failing prompt-shape tests**

Add to `app/api/summarize/route.test.ts`:

```ts
import { POST, buildSummaryPrompt } from "./route";
import type { ToyInfo } from "../../../lib/types";

const toy: ToyInfo = {
  name: "Buzz Lightyear",
  character: "a brave space-ranger action figure",
  personality: "confident, heroic",
  howToPlay: "pretend space missions",
};

describe("buildSummaryPrompt framing", () => {
  it("frames a lesson summary when there is no toy", () => {
    const p = buildSummaryPrompt(validSession, "child: hi");
    expect(p).toContain("lesson");
    expect(p).not.toContain("Buzz Lightyear");
  });

  it("frames a play recap when the session has a toy", () => {
    const toySession = { ...validSession, config: { ...config, toy, toyMode: "pov" as const } };
    const p = buildSummaryPrompt(toySession, "child: hi");
    expect(p).toContain("Buzz Lightyear");
    expect(p).toMatch(/play|played/i);
  });
});
```

(Requires `import { describe, expect, it } from "vitest"` — already present.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run app/api/summarize/route.test.ts`
Expected: FAIL — `buildSummaryPrompt` is not exported.

- [ ] **Step 3: Extract and branch the prompt in `app/api/summarize/route.ts`**

Add this exported function above `POST` (after the `SummarizeRequest` type):

```ts
// The prompt text, pulled out so it can be unit-tested and so the toy/lesson
// framing lives in one place. A toy session is a play session, not a lesson, so
// the same SessionSummary fields are asked for in play terms (what delighted
// them, where they lost interest) rather than lesson terms.
export function buildSummaryPrompt(session: SummarizeRequest, lines: string): string {
  const { config } = session;
  if (config.toy) {
    return `You are helping a parent understand how their child's play session went.

The child is ${config.childName}, aged ${config.childAge}.
They played with ${config.toy.name} (${config.toy.character}).
The point of the play was: ${config.goal}

Here is the transcript:

${lines || "(the child said nothing)"}

Write a short, honest recap for the parent.

Be specific about what delighted ${config.childName} and what they enjoyed most —
"loved sending Buzz on rescue missions", not "had fun". If they lost interest, say
when. Use the fields as: grasped = what they engaged with happily, struggled =
what fell flat or frustrated them, nextFocus = an idea for next time.

For transcriptQuality, judge whether the child's turns look like real speech that
was understood correctly, or like garbled nonsense. If speech recognition clearly
failed, mark it "poor".`;
  }

  return `You are helping a parent understand how their child's lesson went.

The child is ${config.childName}, aged ${config.childAge}.
The goal of the session was: ${config.goal}
The teacher agent is called ${config.agentName}.

Here is the transcript:

${lines || "(the child said nothing)"}

Write a short, honest summary for the parent.

Be specific about what ${config.childName} grasped and what they struggled
with — "counts 1 to 5 confidently", not "did well". If they lost interest, say when.

For transcriptQuality, judge whether the child's turns look like real speech that
was understood correctly, or like garbled nonsense. If speech recognition clearly
failed to understand them, mark it "poor" — this is how the parent finds out.`;
}
```

Then replace the inline prompt in `POST` — change the `messages` content to use it. The `lines` computation stays; replace the message object's `content` value:

```ts
    const response = await client.messages.parse({
      model: "claude-opus-4-8",
      max_tokens: 2000,
      output_config: { format: zodOutputFormat(SummarySchema) },
      messages: [{ role: "user", content: buildSummaryPrompt(session, lines) }],
    });
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run app/api/summarize/route.test.ts`
Expected: PASS — the two new framing tests plus the existing error-path tests.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add app/api/summarize/route.ts app/api/summarize/route.test.ts
git commit -m "feat: mode-aware session summary"
```

---

## Final verification

- [ ] **Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass (existing + new prompt, image, identify-toy, summary tests).

- [ ] **Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **End-to-end, both toy modes, against a real session**

Run the app and, using the verify/run skill: complete a POV toy session and a 3rd-person toy session end to end, confirm the override canary passes in both (no "overrides are not enabled" alarm), confirm the summary reads as a play recap, and confirm the Lesson path is entirely unchanged.

---

## Self-Review notes (author)

- **Spec coverage:** mode picker (Task 4), photo capture (Tasks 3+5), AI toy data (Task 2), confirm screen (Task 5), prefilled config + purpose (Task 6), POV/3rd-person modes (Tasks 1+6), canary untouched (Tasks 1+6 satisfy it via `agentName`), mode-aware summary (Task 7). All spec sections map to a task.
- **Canary safety:** no task edits `lib/overrides.ts`, `SessionView.tsx`, or `buildFirstMessage`. POV correctness rests on `agentName === toy.name`, set in Task 6 Step 1/3 and asserted in Task 6 Step 7.
- **Type consistency:** `ToyInfo`/`ToyMode` defined once (Task 1) and imported everywhere; `toyMode` values are exactly `"pov"` / `"third-person"` in every task; route payloads use `{ toy, error }` consistently in Tasks 2 and 5.
- **Non-obvious guardrail:** toy sessions deliberately skip `saveProfile`/`loadProfile` (Task 6 Step 2) so a stored `toy` field can never silently push a later lesson into toy mode.
