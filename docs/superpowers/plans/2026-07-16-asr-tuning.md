# ASR Tuning for Child Speech Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve live speech recognition of the child by switching the ElevenLabs agent to its newest ASR (`scribe_realtime`, high quality) with per-session keyword biasing and child-patient turn settings, plus prompt guidance for handling garbled turns.

**Architecture:** The signed-url route becomes a POST that receives the `SessionConfig`, read-modify-writes the agent's `conversation_config` (ASR + turn settings merged over the current config so nothing else is lost), then mints the signed URL as before. A pure `buildAsrKeywords` helper in `lib/` derives biasing keywords from the config. `lib/prompt.ts` gains a shared "Listening" section telling the LLM to treat garbled turns as mishearing.

**Tech Stack:** Next.js App Router route handlers, `@elevenlabs/elevenlabs-js` (agents.get / agents.update / conversations.getSignedUrl), vitest.

**Spec:** `docs/superpowers/specs/2026-07-16-asr-tuning-design.md`

## Global Constraints

- No new dependencies.
- Prompt strings must never assume the child's gender: address the child by name or use singular they (see the comment block in `lib/prompt.ts:68-77`).
- A session must always be able to start: any failure in the ASR-tuning PATCH is logged and swallowed — the route still returns a signed URL.
- This Next.js version may differ from training data — check `node_modules/next/dist/docs/` if any App Router API behaves unexpectedly.
- Run tests with `npx vitest run <file>` (the project test script is `vitest run`).

### SDK facts (verified against the installed `@elevenlabs/elevenlabs-js`)

- `client.conversationalAi.agents.get(agentId)` → `{ conversationConfig: ConversationalConfig, ... }`
- `client.conversationalAi.agents.update(agentId, { conversationConfig })` — PATCH; the SDK types use **camelCase** (`userInputAudioFormat`, `retranscribeOnTurnTimeout`), the SDK serializes to the API's snake_case.
- `AsrConversationalConfig`: `{ quality?: "high", provider?: "elevenlabs" | "scribe_realtime", userInputAudioFormat?, keywords?: string[] }`
- `TurnConfig` includes `turnEagerness?: "patient" | "normal" | "eager"` and `retranscribeOnTurnTimeout?: boolean`.
- Why read-modify-write instead of a bare PATCH of `{ asr, turn }`: the PATCH endpoint's merge depth for nested `conversation_config` objects is not documented. Fetching the current config and sending it back with only `asr`/`turn` replaced is deterministic regardless of merge semantics, and guarantees the agent's other settings (prompt, TTS, language presets) survive.

---

### Task 1: `buildAsrKeywords` helper

**Files:**
- Create: `lib/asr.ts`
- Test: `lib/asr.test.ts`

**Interfaces:**
- Consumes: `SessionConfig` type from `lib/types.ts` (only for the `Partial` cast — input is untrusted JSON).
- Produces: `buildAsrKeywords(config: unknown): string[]` — used by Task 3's route. Returns `[childName, agentName, toy.name]` trimmed, deduplicated, blanks and non-strings dropped; `[]` for non-object input.

- [ ] **Step 1: Write the failing tests**

Create `lib/asr.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildAsrKeywords } from "./asr";

describe("buildAsrKeywords", () => {
  it("returns child name, agent name and toy name", () => {
    expect(
      buildAsrKeywords({
        childName: "Mia",
        agentName: "Robo",
        toy: { name: "Buzz Lightyear" },
      }),
    ).toEqual(["Mia", "Robo", "Buzz Lightyear"]);
  });

  it("omits the toy entry when there is no toy", () => {
    expect(buildAsrKeywords({ childName: "Mia", agentName: "Robo" })).toEqual(["Mia", "Robo"]);
  });

  it("deduplicates — in POV toy mode the agent name IS the toy name", () => {
    expect(
      buildAsrKeywords({
        childName: "Mia",
        agentName: "Buzz Lightyear",
        toy: { name: "Buzz Lightyear" },
      }),
    ).toEqual(["Mia", "Buzz Lightyear"]);
  });

  it("drops blank and missing names", () => {
    expect(buildAsrKeywords({ childName: "  ", agentName: "Robo" })).toEqual(["Robo"]);
  });

  it("returns [] for junk input — the route feeds it untrusted JSON", () => {
    expect(buildAsrKeywords(null)).toEqual([]);
    expect(buildAsrKeywords("nonsense")).toEqual([]);
    expect(buildAsrKeywords({ childName: 42 })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/asr.test.ts`
Expected: FAIL — `Cannot find module './asr'` (or equivalent).

- [ ] **Step 3: Write the implementation**

Create `lib/asr.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/asr.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/asr.ts lib/asr.test.ts
git commit -m "feat: buildAsrKeywords — ASR biasing keywords from session config"
```

---

### Task 2: "Listening" section in the prompt

**Files:**
- Modify: `lib/prompt.ts` (add `listeningRules()` near `guardrails()` at line 94; insert a `## Listening` section into BOTH `buildToyPrompt` and `buildPrompt`)
- Test: `lib/prompt.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: no exported API change — `buildPrompt`/`buildToyPrompt` output gains a `## Listening` section.

- [ ] **Step 1: Write the failing tests**

Add to the `describe("buildPrompt", ...)` block in `lib/prompt.test.ts` (the `base` and `povConfig` fixtures already exist at the top of the file):

```ts
  it("tells the agent to treat garbled turns as its own mishearing", () => {
    const p = buildPrompt(base, null);
    expect(p).toContain("## Listening");
    expect(p).toContain("assume YOU misheard");
    expect(p).toContain("Never repeat garbled text back");
  });

  it("includes the Listening section in toy mode too", () => {
    expect(buildPrompt(povConfig, null)).toContain("## Listening");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/prompt.test.ts`
Expected: FAIL — the two new tests can't find `## Listening`; all pre-existing tests still PASS.

- [ ] **Step 3: Implement `listeningRules` and wire it into both prompts**

In `lib/prompt.ts`, add below `olderChildRules` (before `guardrails`):

```ts
// Speech recognition mishears young children far more often than adults, so
// the transcript the model sees can be garbled even when the child spoke
// clearly. Without this rule the model treats transcription noise as
// something the child actually said and builds on it — with it, nonsense is
// treated as the agent's own hearing problem. Age-independent on purpose:
// ASR quality is the bottleneck at every age, so it applies to both age
// rule sets and both prompt modes.
function listeningRules(name: string): string {
  return `
- You hear ${name} through speech recognition. What you receive may be garbled
  or nonsensical even when ${name} spoke clearly.
- If a reply seems garbled, wildly off-topic, or impossible, assume YOU misheard —
  never assume ${name} said something strange. Cheerfully ask ${name} to say it
  again, or move to an easier question.
- Never repeat garbled text back to ${name}. Never say ${name} makes no sense.
- Never build on something unless you are confident ${name} actually said it.`;
}
```

In `buildToyPrompt`, insert a Listening section between `## How to talk to ${name}` and `## What ${name}'s parent told you`:

```ts
## How to talk to ${name}
${ageRules}

## Listening
${listeningRules(name)}

## What ${name}'s parent told you
```

In `buildPrompt` (the non-toy return string), make the identical insertion between the same two sections:

```ts
## How to talk to ${name}
${ageRules}

## Listening
${listeningRules(name)}

## What ${name}'s parent told you
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/prompt.test.ts`
Expected: PASS, including all pre-existing tests.

- [ ] **Step 5: Commit**

```bash
git add lib/prompt.ts lib/prompt.test.ts
git commit -m "feat: prompt Listening rules — treat garbled turns as mishearing"
```

---

### Task 3: signed-url route — POST + per-session ASR tuning

**Files:**
- Modify: `app/api/signed-url/route.ts` (replace GET with POST)
- Test: create `app/api/signed-url/route.test.ts`

**Interfaces:**
- Consumes: `buildAsrKeywords(config: unknown): string[]` from `lib/asr.ts` (Task 1).
- Produces: `POST /api/signed-url` accepting the raw `SessionConfig` JSON body, responding `{ signedUrl: string }` (or `{ error }` with 500 when env vars are missing). Task 4's client depends on exactly this contract.

- [ ] **Step 1: Write the failing tests**

Create `app/api/signed-url/route.test.ts`:

```ts
// app/api/signed-url/route.test.ts
//
// The route does three things before handing the client its signed URL:
// read the agent's current config, write it back with tuned ASR + turn
// settings (read-modify-write so the PATCH can't wipe unrelated agent
// config regardless of the API's merge depth), then mint the URL. The
// tests pin the two properties that matter: the PATCH payload is the old
// config with only asr/turn replaced, and NO failure in the tuning path
// may prevent a session from starting.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.hoisted because vi.mock factories are hoisted above const declarations —
// plain top-level vi.fn() consts risk a TDZ ReferenceError inside the factory.
const { get, update, getSignedUrl } = vi.hoisted(() => ({
  get: vi.fn(),
  update: vi.fn(),
  getSignedUrl: vi.fn(),
}));

vi.mock("@elevenlabs/elevenlabs-js", () => ({
  ElevenLabsClient: class {
    conversationalAi = {
      agents: { get, update },
      conversations: { getSignedUrl },
    };
  },
}));

import { POST } from "./route";

function postRequest(body: string): Request {
  return new Request("http://localhost/api/signed-url", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

const config = { childName: "Mia", agentName: "Robo" };

let realEnv: { key?: string; agent?: string };
beforeEach(() => {
  realEnv = { key: process.env.ELEVENLABS_API_KEY, agent: process.env.ELEVENLABS_AGENT_ID };
  process.env.ELEVENLABS_API_KEY = "test-key";
  process.env.ELEVENLABS_AGENT_ID = "agent-1";
  vi.clearAllMocks();
  get.mockResolvedValue({
    conversationConfig: {
      agent: { firstMessage: "untouched" },
      tts: { voiceId: "untouched" },
      asr: { userInputAudioFormat: "pcm_16000" },
      turn: { turnTimeout: 7 },
    },
  });
  update.mockResolvedValue({});
  getSignedUrl.mockResolvedValue({ signedUrl: "wss://signed" });
});
afterEach(() => {
  if (realEnv.key === undefined) delete process.env.ELEVENLABS_API_KEY;
  else process.env.ELEVENLABS_API_KEY = realEnv.key;
  if (realEnv.agent === undefined) delete process.env.ELEVENLABS_AGENT_ID;
  else process.env.ELEVENLABS_AGENT_ID = realEnv.agent;
});

describe("POST /api/signed-url", () => {
  it("PATCHes tuned ASR + turn settings merged over the current config", async () => {
    const res = await POST(postRequest(JSON.stringify(config)));
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith("agent-1", {
      conversationConfig: {
        agent: { firstMessage: "untouched" }, // read-modify-write keeps this
        tts: { voiceId: "untouched" },
        asr: {
          userInputAudioFormat: "pcm_16000", // existing asr fields survive
          provider: "scribe_realtime",
          quality: "high",
          keywords: ["Mia", "Robo"],
        },
        turn: {
          turnTimeout: 7, // existing turn fields survive
          turnEagerness: "patient",
          retranscribeOnTurnTimeout: true,
        },
      },
    });
    expect((await res.json()).signedUrl).toBe("wss://signed");
  });

  it("still returns a signed URL when the tuning PATCH fails", async () => {
    update.mockRejectedValue(new Error("elevenlabs down"));
    const res = await POST(postRequest(JSON.stringify(config)));
    expect(res.status).toBe(200);
    expect((await res.json()).signedUrl).toBe("wss://signed");
  });

  it("still returns a signed URL when reading the agent config fails", async () => {
    get.mockRejectedValue(new Error("elevenlabs down"));
    const res = await POST(postRequest(JSON.stringify(config)));
    expect(res.status).toBe(200);
    expect(update).not.toHaveBeenCalled();
    expect((await res.json()).signedUrl).toBe("wss://signed");
  });

  it("still returns a signed URL for a malformed body (keywords just stay empty)", async () => {
    const res = await POST(postRequest("not json"));
    expect(res.status).toBe(200);
    const patched = update.mock.calls[0][1].conversationConfig;
    expect(patched.asr.keywords).toEqual([]);
    expect((await res.json()).signedUrl).toBe("wss://signed");
  });

  it("returns a JSON 500 when env vars are missing", async () => {
    delete process.env.ELEVENLABS_API_KEY;
    const res = await POST(postRequest(JSON.stringify(config)));
    expect(res.status).toBe(500);
    expect(typeof (await res.json()).error).toBe("string");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/api/signed-url/route.test.ts`
Expected: FAIL — `POST` is not exported from `./route` (the route currently only has GET).

- [ ] **Step 3: Rewrite the route**

Replace the whole of `app/api/signed-url/route.ts`:

```ts
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { buildAsrKeywords } from "../../../lib/asr";

// Was a bare GET that only minted a signed URL. Now a POST that receives the
// SessionConfig and, before minting, re-tunes the agent's ASR for a child
// speaker: scribe_realtime at high quality, keyword biasing toward the names
// this session will repeat constantly, and patient turn-taking (children
// pause mid-sentence; retranscribeOnTurnTimeout stops the ASR committing a
// half-heard turn). See docs/superpowers/specs/2026-07-16-asr-tuning-design.md.
//
// Read-modify-write, not a bare PATCH of {asr, turn}: the PATCH endpoint's
// merge depth for nested conversation_config objects is undocumented, and a
// shallow replace would silently wipe the agent's prompt/TTS/language config.
// Fetching the current config and writing it back with only asr/turn replaced
// is deterministic regardless of the API's merge semantics.
//
// Tuning is best-effort by design: a session running on stale ASR settings
// beats a child staring at an error, so every failure in the tuning path is
// logged and swallowed. Only a missing env config (nothing would work) is an
// error response.
export async function POST(req: Request) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const agentId = process.env.ELEVENLABS_AGENT_ID;
  if (!apiKey || !agentId) {
    return Response.json(
      { error: "ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID must be set in .env.local" },
      { status: 500 },
    );
  }

  // The body is our own SessionView's JSON, but parse defensively: a bad body
  // must never block a session, it just means no keyword biasing this time.
  let config: unknown = null;
  try {
    config = await req.json();
  } catch {
    // fall through with config = null → buildAsrKeywords returns []
  }

  const client = new ElevenLabsClient({ apiKey });

  try {
    const { conversationConfig } = await client.conversationalAi.agents.get(agentId);
    await client.conversationalAi.agents.update(agentId, {
      conversationConfig: {
        ...conversationConfig,
        asr: {
          ...conversationConfig.asr,
          provider: "scribe_realtime",
          quality: "high",
          keywords: buildAsrKeywords(config),
        },
        turn: {
          ...conversationConfig.turn,
          turnEagerness: "patient",
          retranscribeOnTurnTimeout: true,
        },
      },
    });
  } catch (err) {
    console.warn("ASR tuning failed; starting session with the agent's existing config", err);
  }

  const { signedUrl } = await client.conversationalAi.conversations.getSignedUrl({ agentId });
  return Response.json({ signedUrl });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/api/signed-url/route.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add app/api/signed-url/route.ts app/api/signed-url/route.test.ts
git commit -m "feat: signed-url route tunes agent ASR per session (scribe_realtime, keywords, patient turns)"
```

---

### Task 4: SessionView sends the config + full verification

**Files:**
- Modify: `app/components/SessionView.tsx:222` (the `fetch("/api/signed-url")` call inside `start`)

**Interfaces:**
- Consumes: `POST /api/signed-url` from Task 3 (`SessionConfig` JSON body → `{ signedUrl }`).
- Produces: nothing new — behavior change only.

- [ ] **Step 1: Change the fetch to POST the session config**

In `app/components/SessionView.tsx`, inside `start` (currently line 222), replace:

```ts
    const res = await fetch("/api/signed-url");
```

with:

```ts
    // POST, not GET: the route re-tunes the agent's ASR for this session
    // (keyword biasing needs the child/agent/toy names) before minting the
    // signed URL. `config` is already in scope — it drives the overrides below.
    const res = await fetch("/api/signed-url", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(config),
    });
```

`config` is already in the `useCallback` dependency array (`[conversation, config, t]`), so no hook changes are needed.

- [ ] **Step 2: Full verification — tests, lint, build**

Run: `npx vitest run`
Expected: ALL tests pass (including Tasks 1–3's new files and all pre-existing suites).

Run: `npm run lint`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds (this is the only type-check covering `SessionView.tsx` and the route together).

- [ ] **Step 3: Commit**

```bash
git add app/components/SessionView.tsx
git commit -m "feat: SessionView POSTs session config so ASR keywords follow the session"
```

---

## After implementation (manual, not part of the tasks)

Success is measured live, per the spec: run several English and Russian sessions and watch (a) whether the agent stops responding to things the child didn't say, and (b) the `transcriptQuality` field the summarize route already produces. Still poor → phase 2 (custom OpenAI-STT pipeline, separate design).
