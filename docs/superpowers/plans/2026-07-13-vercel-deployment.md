# Running on Vercel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the app work on Vercel — persistence moves from the (non-existent) server filesystem into the browser, and a passcode stops strangers from spending the owner's ElevenLabs and Anthropic credits.

**Architecture:** The server becomes stateless. It keeps only the two jobs that need a secret the browser must never hold: minting ElevenLabs signed URLs, and calling Claude. Profiles, transcripts and summaries live in `localStorage` on the parent's device. A middleware puts a passcode in front of every page and every API route.

**Tech Stack:** Next.js (App Router), TypeScript, `localStorage`, Next middleware, vitest. No new dependencies.

## Global Constraints

- **The Claude model id is exactly `claude-opus-4-8`.** Never a date suffix.
- `ELEVENLABS_API_KEY` and `ANTHROPIC_API_KEY` are read **server-side only**. The browser must never receive either.
- **`lib/prompt.ts` and `lib/overrides.ts` are untouched.** Their tests must still pass unmodified.
- **`SessionView`'s state machine is untouched** — the override canary, the wall-clock timer, `finish()`/`transcriptRef`, the empty-transcript guard. Only its *source of the last summary* changes.
- **The save-before-summarize invariant survives:** the transcript is persisted BEFORE Claude is called; the parent is told "the transcript is saved" only once it actually is; an unsaved session never offers a Done button that would discard it.
- The two alarms stay severe (`role="alert"`): "overrides not enabled" and `transcriptQuality: "poor"`.
- If `APP_PASSCODE` is unset, the middleware **denies everything**. A missing env var must never silently unlock the app.
- No new runtime dependencies. No database.

---

### Task 1: Browser storage

The replacement for `lib/storage.ts`. Same shape, backed by `localStorage`, running on the client. Written as a pure module over an **injectable `Storage`** so it is fully testable in vitest's `node` environment — no jsdom, no new dependency.

**Files:**
- Create: `lib/browser-storage.ts`
- Create: `lib/browser-storage.test.ts`

**Interfaces:**
- Consumes: `SessionConfig`, `SessionSummary`, `SavedSession` from `lib/types.ts`.
- Produces (Task 2 uses exactly these):
  - `saveProfile(config: SessionConfig, store?: Storage): void`
  - `loadProfile(childName: string, store?: Storage): SessionConfig | null`
  - `listProfiles(store?: Storage): SessionConfig[]`
  - `saveSession(session: Omit<SavedSession, "summary">, store?: Storage): string` — returns a session id
  - `attachSummary(id: string, summary: SessionSummary, store?: Storage): void`
  - `loadLatestSummary(childName: string, store?: Storage): SessionSummary | null`

  Every function takes an optional `store` defaulting to `window.localStorage`, purely so the tests can pass a fake. Callers in the app omit it.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/browser-storage.test.ts
import { beforeEach, describe, expect, it } from "vitest";
import {
  attachSummary,
  listProfiles,
  loadLatestSummary,
  loadProfile,
  saveProfile,
  saveSession,
} from "./browser-storage";
import type { SavedSession, SessionConfig, SessionSummary } from "./types";

// A `Storage` that lives in memory. The real one is the browser's, which
// vitest's node environment does not have — and mocking it this way is also
// how we get to test the corrupt-entry path without corrupting anything real.
function fakeStore(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, v),
  };
}

const config: SessionConfig = {
  agentName: "Robo",
  voiceId: "v1",
  childName: "Mia",
  childAge: 5,
  language: "en",
  goal: "Count to 10",
  directives: "",
  minutes: 10,
};

const summary: SessionSummary = {
  whatWeDid: "Counted together.",
  grasped: ["1 to 5"],
  struggled: ["7 and 8"],
  nextFocus: "Practice 7 and 8.",
  engagement: "high",
  transcriptQuality: "good",
};

function makeSession(endedAt: string, childName = "Mia"): Omit<SavedSession, "summary"> {
  return {
    config: { ...config, childName },
    transcript: [{ role: "agent", text: "Hi!", at: 0 }],
    startedAt: endedAt,
    endedAt,
  };
}

let store: Storage;
beforeEach(() => {
  store = fakeStore();
});

describe("profiles", () => {
  it("round-trips a profile", () => {
    saveProfile(config, store);
    expect(loadProfile("Mia", store)).toEqual(config);
  });

  it("returns null for a child with no profile", () => {
    expect(loadProfile("Nobody", store)).toBeNull();
  });

  it("lists every saved profile, including non-Latin names", () => {
    saveProfile(config, store);
    saveProfile({ ...config, childName: "Аня" }, store);
    expect(listProfiles(store).map((p) => p.childName).sort()).toEqual(["Mia", "Аня"]);
  });

  it("lists nothing when there are no profiles", () => {
    expect(listProfiles(store)).toEqual([]);
  });

  it("survives a corrupt entry rather than losing every other child", () => {
    saveProfile(config, store);
    store.setItem("ai-teacher:profile:broken", "{not json");
    expect(listProfiles(store).map((p) => p.childName)).toEqual(["Mia"]);
  });
});

describe("sessions", () => {
  it("saves a session and attaches a summary to that same record", () => {
    const id = saveSession(makeSession("2026-01-01T10:00:00.000Z"), store);
    attachSummary(id, summary, store);
    expect(loadLatestSummary("Mia", store)).toEqual(summary);
  });

  // The invariant that was fixed after a real bug: the transcript is stored
  // BEFORE Claude is called. If summarization never happens, the lesson must
  // still be there.
  it("keeps the transcript when no summary is ever attached", () => {
    const id = saveSession(makeSession("2026-01-01T10:00:00.000Z"), store);
    expect(id).toBeTruthy();
    expect(loadLatestSummary("Mia", store)).toBeNull(); // no summary yet...
    expect(store.getItem(id)).toContain("Hi!"); // ...but the transcript is there
  });

  it("returns the newest summary for a child, not the first", () => {
    const older = saveSession(makeSession("2026-01-01T10:00:00.000Z"), store);
    const newer = saveSession(makeSession("2026-01-02T10:00:00.000Z"), store);
    attachSummary(older, { ...summary, nextFocus: "older" }, store);
    attachSummary(newer, { ...summary, nextFocus: "newer" }, store);
    expect(loadLatestSummary("Mia", store)?.nextFocus).toBe("newer");
  });

  it("skips sessions that have no summary when looking for the latest", () => {
    const withSummary = saveSession(makeSession("2026-01-01T10:00:00.000Z"), store);
    attachSummary(withSummary, { ...summary, nextFocus: "the only one" }, store);
    saveSession(makeSession("2026-01-02T10:00:00.000Z")); // newer, never summarized
    expect(loadLatestSummary("Mia", store)?.nextFocus).toBe("the only one");
  });

  it("does not hand one child another child's summary", () => {
    const mia = saveSession(makeSession("2026-01-01T10:00:00.000Z", "Mia"), store);
    attachSummary(mia, summary, store);
    expect(loadLatestSummary("Аня", store)).toBeNull();
  });

  it("two sessions in the same millisecond both survive", () => {
    const a = saveSession(makeSession("2026-01-01T10:00:00.000Z"), store);
    const b = saveSession(makeSession("2026-01-01T10:00:00.000Z"), store);
    expect(a).not.toBe(b);
    expect(store.getItem(a)).toBeTruthy();
    expect(store.getItem(b)).toBeTruthy();
  });
});
```

Note the sixth session test deliberately calls `saveSession(...)` **without** the store — fix that when you write it; it must pass `store`. (Left here as written so you actually read the tests rather than pasting them.)

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx vitest run lib/browser-storage.test.ts`
Expected: FAIL — cannot resolve `./browser-storage`.

- [ ] **Step 3: Implement it**

```ts
// lib/browser-storage.ts
import type { SavedSession, SessionConfig, SessionSummary } from "./types";

// Everything the parent's device remembers. There is no server-side store any
// more: Vercel's filesystem is read-only, and putting the child's transcripts
// on someone else's disk behind a public endpoint is worse than keeping them
// here. The cost is that history is per-device — clear the browser's data and
// it is gone.
//
// Every function takes an optional `store` so the tests can pass a fake; the
// app always omits it and gets the real localStorage.

const PROFILE_PREFIX = "ai-teacher:profile:";
const SESSION_PREFIX = "ai-teacher:session:";

function defaultStore(): Storage {
  return window.localStorage;
}

// Keys must be stable across sessions and safe as a key. Two different children
// must never collide (this was once a real bug with an ASCII-only slug: every
// Cyrillic name collapsed to the same value), so the name is encoded, not
// stripped.
function profileKey(childName: string): string {
  return PROFILE_PREFIX + encodeURIComponent(childName.trim().toLowerCase());
}

export function saveProfile(config: SessionConfig, store: Storage = defaultStore()): void {
  store.setItem(profileKey(config.childName), JSON.stringify(config));
}

export function loadProfile(childName: string, store: Storage = defaultStore()): SessionConfig | null {
  const raw = store.getItem(profileKey(childName));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionConfig;
  } catch {
    return null;
  }
}

function keysWithPrefix(prefix: string, store: Storage): string[] {
  const keys: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i);
    if (key?.startsWith(prefix)) keys.push(key);
  }
  return keys;
}

export function listProfiles(store: Storage = defaultStore()): SessionConfig[] {
  const profiles: SessionConfig[] = [];
  for (const key of keysWithPrefix(PROFILE_PREFIX, store)) {
    try {
      profiles.push(JSON.parse(store.getItem(key) ?? "") as SessionConfig);
    } catch {
      // One unreadable entry must not cost the parent every other child.
    }
  }
  return profiles;
}

// Returns the id the session was stored under. That id is the receipt: EndView
// holds it, and SummaryView uses it to attach the summary to this exact record.
export function saveSession(session: Omit<SavedSession, "summary">, store: Storage = defaultStore()): string {
  // endedAt alone is not unique — two sessions can land in the same
  // millisecond, and the old file-based store had to grow collision suffixes
  // for exactly that. A counter is simpler and cannot collide.
  let id = `${SESSION_PREFIX}${session.endedAt}`;
  let n = 1;
  while (store.getItem(id) !== null) id = `${SESSION_PREFIX}${session.endedAt}#${n++}`;

  const record: SavedSession = { ...session, summary: null };
  store.setItem(id, JSON.stringify(record));
  return id;
}

export function attachSummary(id: string, summary: SessionSummary, store: Storage = defaultStore()): void {
  const raw = store.getItem(id);
  if (!raw) return;
  try {
    const record = JSON.parse(raw) as SavedSession;
    store.setItem(id, JSON.stringify({ ...record, summary }));
  } catch {
    // A record we cannot parse is a record we must not overwrite with a
    // half-formed one.
  }
}

export function loadLatestSummary(childName: string, store: Storage = defaultStore()): SessionSummary | null {
  const wanted = childName.trim().toLowerCase();
  const sessions: SavedSession[] = [];
  for (const key of keysWithPrefix(SESSION_PREFIX, store)) {
    try {
      sessions.push(JSON.parse(store.getItem(key) ?? "") as SavedSession);
    } catch {
      // ignore an unreadable record
    }
  }
  const mine = sessions
    .filter((s) => s.summary !== null && s.config.childName.trim().toLowerCase() === wanted)
    .sort((a, b) => a.endedAt.localeCompare(b.endedAt));
  return mine.length > 0 ? (mine[mine.length - 1].summary as SessionSummary) : null;
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npm test`
Expected: PASS. All pre-existing tests still pass, plus the new browser-storage ones.

- [ ] **Step 5: Commit**

```bash
git add lib/browser-storage.ts lib/browser-storage.test.ts
git commit -m "Store profiles, sessions and summaries in the browser"
```

---

### Task 2: Make the server stateless and rewire the client

Delete every route that touched disk, make `/api/summarize` return a summary instead of writing one, and point the components at browser storage. This is the task that actually fixes the `ENOENT`.

**Files:**
- Delete: `lib/storage.ts`, `lib/storage.test.ts`
- Delete: `app/api/profiles/route.ts`, `app/api/profiles/list/route.ts`, `app/api/last-summary/route.ts`, `app/api/sessions/route.ts`, `app/api/sessions/route.test.ts`
- Modify: `app/api/summarize/route.ts`, `app/api/summarize/route.test.ts`
- Modify: `app/components/ConfigForm.tsx`, `app/components/SessionView.tsx`, `app/components/EndView.tsx`, `app/components/SummaryView.tsx`

**Interfaces:**
- Consumes: everything `lib/browser-storage.ts` exports (Task 1).
- Produces: `POST /api/summarize` with body `Omit<SavedSession, "summary">` → `{ summary: SessionSummary } | { error: string }`. It is now **stateless**: no `filePath` in, no file written.

- [ ] **Step 1: Make `/api/summarize` stateless**

It currently resolves/writes a session file and attaches the summary to it. All of that goes; it takes a transcript and returns a summary. **Keep the Claude call, the zod schema, the prompt, and the model id `claude-opus-4-8` exactly as they are** — only the storage around them is removed.

Read `app/api/summarize/route.ts` and strip:
- the `import` from `lib/storage`
- the `findSessionFile` / `resolveSessionFile` / `saveSession` / `attachSummary` calls
- the `filePath` field on the request body

The route reduces to: parse the body → build the prompt from the transcript → call Claude → return `{ summary }`, or `{ error }` with a non-2xx status. Its existing tests for a malformed body and for a Claude failure must be updated to the new shape and must still pass.

- [ ] **Step 2: Point the components at browser storage**

`ConfigForm.tsx` — replace the two fetches:
```tsx
// was: fetch("/api/profiles/list")
setProfiles(listProfiles());

// was: fetch(`/api/profiles?childName=...`) inside loadSaved
const saved = loadProfile(config.childName);

// was: fetch("/api/profiles", { method: "POST", ... }) on submit
saveProfile(config);
```
`listProfiles()` and `loadProfile()` are synchronous, so `loadSaved` no longer needs to be `async` and the `configRef` that existed only to survive an `await` can go with it — but **the `touched` logic must not change**: a loaded profile still fills only the fields the parent has not edited. Read the comments in that function before you touch it.

`SessionView.tsx` — the effect that fetched `/api/last-summary` becomes a synchronous read:
```tsx
useEffect(() => {
  setLastSummary(loadLatestSummary(config.childName));
  setReady(true);
}, [config.childName]);
```
It stays in an effect (not a render-time read) because `localStorage` does not exist during the server render. **Change nothing else in this file.**

`EndView.tsx` — the save becomes synchronous, and `filePath` becomes `sessionId`:
```tsx
const save = useCallback(() => {
  setState({ status: "saving" });
  try {
    const sessionId = saveSession(session);
    setState({ status: "saved", sessionId });
  } catch (e) {
    // localStorage throws when it is full or disabled (Safari private mode).
    setState({
      status: "failed",
      message: e instanceof Error ? e.message : "The browser refused to save the transcript.",
    });
  }
}, [session]);
```
**Everything else about this component's contract is sacred and must survive:** the transcript is stored before Claude is called; the parent is told "the transcript is saved" only once it actually is; a failed save offers **Retry only** and never a Done button that would discard the lesson; the `firedRef` guard stops React StrictMode from double-saving. Read the long comment at the top of the file — it explains why, and it was written after the app lied to the parent about a lost lesson.

`SummaryView.tsx` — takes `sessionId` instead of `filePath`, POSTs the session to `/api/summarize`, and on success attaches the summary locally:
```tsx
const data: SummarizeResponse = await res.json().catch(() => ({}));
if (data.summary) {
  attachSummary(sessionId, data.summary);
  setSummary(data.summary);
} else {
  setError(data.error ?? "Could not write the summary.");
}
```
The copy stays exactly as it is. The one wording change you MUST make: any text that shows the parent a *file path* now has no file path to show — say the lesson is saved on this device, and do not invent a path.

- [ ] **Step 3: Delete the dead server code**

```bash
git rm lib/storage.ts lib/storage.test.ts
git rm app/api/profiles/route.ts app/api/profiles/list/route.ts
git rm app/api/last-summary/route.ts
git rm app/api/sessions/route.ts app/api/sessions/route.test.ts
```

Then `grep -rn "lib/storage" app lib` — it must return nothing.

- [ ] **Step 4: Verify**

Run: `npm test` (every remaining test passes — `lib/prompt.test.ts`, `lib/overrides.test.ts`, `lib/voice-selection.test.ts`, `lib/browser-storage.test.ts`, the summarize route tests), `npx tsc --noEmit` (clean), `npm run build` (succeeds), `npm run lint` (no new errors).

Then `npm run dev` and run a full session end to end: configure, talk, end, read the summary. Reload the page — the saved child must still be there as a card. That reload is the proof the browser store actually persists.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Make the server stateless; persist in the browser"
```

---

### Task 3: The passcode

Without this, anyone who finds the URL runs voice sessions on the owner's ElevenLabs bill and Claude calls on their Anthropic bill. Verified against the live deployment: `GET /api/signed-url` currently returns 200 to an anonymous request.

**Files:**
- Create: `lib/passcode.ts`
- Create: `lib/passcode.test.ts`
- Create: `middleware.ts` (repo root — Next requires it there)
- Create: `app/unlock/page.tsx`
- Create: `app/unlock/Unlock.module.css`
- Create: `app/api/unlock/route.ts`
- Modify: `.env.local.example`, `SETUP.md`

**Interfaces:**
- Consumes: nothing.
- Produces: `isPasscodeCorrect(submitted: string, expected: string | undefined): boolean` from `lib/passcode.ts`.

- [ ] **Step 1: Write the failing tests for the check**

```ts
// lib/passcode.test.ts
import { describe, expect, it } from "vitest";
import { isPasscodeCorrect } from "./passcode";

describe("isPasscodeCorrect", () => {
  it("accepts the right passcode", () => {
    expect(isPasscodeCorrect("hunter2", "hunter2")).toBe(true);
  });

  it("rejects the wrong passcode", () => {
    expect(isPasscodeCorrect("nope", "hunter2")).toBe(false);
  });

  // The whole app is behind this. If APP_PASSCODE is missing from the Vercel
  // environment, the app must be UNUSABLE, not WIDE OPEN. Failing open here
  // would hand a stranger the owner's ElevenLabs and Anthropic bills.
  it("denies everything when no passcode is configured", () => {
    expect(isPasscodeCorrect("", undefined)).toBe(false);
    expect(isPasscodeCorrect("anything", undefined)).toBe(false);
    expect(isPasscodeCorrect("", "")).toBe(false);
    expect(isPasscodeCorrect("anything", "")).toBe(false);
  });

  it("rejects a prefix of the passcode", () => {
    expect(isPasscodeCorrect("hunter", "hunter2")).toBe(false);
  });
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run lib/passcode.test.ts`
Expected: FAIL — cannot resolve `./passcode`.

- [ ] **Step 3: Implement the check**

```ts
// lib/passcode.ts

// Constant-time comparison. A `===` on a secret leaks its length and, in
// principle, its prefix through timing. This is a family app behind a
// four-word passcode and the practical risk is small, but the cost of doing it
// right is four lines.
export function isPasscodeCorrect(submitted: string, expected: string | undefined): boolean {
  // No passcode configured means the app is misconfigured, and a misconfigured
  // app must FAIL CLOSED. If this returned true, deploying without setting
  // APP_PASSCODE would leave the owner's API keys open to anyone with the URL.
  if (!expected) return false;

  const a = new TextEncoder().encode(submitted);
  const b = new TextEncoder().encode(expected);
  // Lengths differing is itself a mismatch; compare anyway so the work done
  // does not depend on where the difference is.
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}
```

- [ ] **Step 4: Run and watch them pass**

Run: `npx vitest run lib/passcode.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: The middleware**

```ts
// middleware.ts  (repo root — Next.js will not find it anywhere else)
import { NextResponse, type NextRequest } from "next/server";

const COOKIE = "ai-teacher-unlocked";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // The unlock screen and the route that checks the passcode must be reachable
  // without the passcode, or there is no way in.
  if (pathname === "/unlock" || pathname === "/api/unlock") return NextResponse.next();

  const unlocked = request.cookies.get(COOKIE)?.value === process.env.APP_PASSCODE;
  if (unlocked) return NextResponse.next();

  // An API caller gets a flat 401. Redirecting a fetch to an HTML login page
  // produces a confusing parse error rather than an honest refusal — and this
  // is the path a stranger's curl takes.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Locked." }, { status: 401 });
  }

  return NextResponse.redirect(new URL("/unlock", request.url));
}

export const config = {
  // Everything except Next's own static assets and the favicon. Note this
  // deliberately DOES cover /api/* — those routes spend the owner's ElevenLabs
  // and Anthropic credits and are the whole reason this middleware exists.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

The cookie holds the passcode itself, and the middleware compares it to the env var. That is only acceptable because the cookie is `httpOnly` + `secure` (set below), so script cannot read it and it never crosses the wire in clear.

- [ ] **Step 6: The unlock route**

```ts
// app/api/unlock/route.ts
import { isPasscodeCorrect } from "../../../lib/passcode";

export async function POST(request: Request) {
  const { passcode } = (await request.json().catch(() => ({}))) as { passcode?: string };

  if (!isPasscodeCorrect(passcode ?? "", process.env.APP_PASSCODE)) {
    return Response.json({ error: "That is not the passcode." }, { status: 401 });
  }

  const response = Response.json({ ok: true });
  response.headers.append(
    "Set-Cookie",
    [
      `ai-teacher-unlocked=${encodeURIComponent(process.env.APP_PASSCODE as string)}`,
      "Path=/",
      "HttpOnly",
      "Secure",
      "SameSite=Lax",
      `Max-Age=${60 * 60 * 24 * 30}`,
    ].join("; "),
  );
  return response;
}
```

- [ ] **Step 7: The unlock screen**

A single centred card, using the existing design tokens (`--c-*`, `--s-*`, `--r-*`, `--t-*`, `--shadow*`) from `app/globals.css` — read `app/components/ConfigForm.module.css` for the established conventions and match them. One password input (`type="password"`, `autoComplete="current-password"`), one full-width submit button styled like the existing primary pill (56px, `--c-primary`, `--r-full`), and an error message in the established `.error` treatment when the passcode is wrong. On success, `router.replace("/")`.

Keep it plain. It is a gate, not a feature.

- [ ] **Step 8: Document the new env var**

Add `APP_PASSCODE=` to `.env.local.example`, and to `SETUP.md` a short section saying: set `APP_PASSCODE` locally **and in the Vercel project's environment variables**; without it the app denies every request (by design).

- [ ] **Step 9: Verify the gate actually holds**

Run `npm run build`, then `npm start`, and against the running server:

```bash
# Locked out, as a stranger would be:
curl -s -o /dev/null -w "%{http_code}\n" localhost:3000/api/signed-url   # expect 401
curl -s -o /dev/null -w "%{http_code}\n" localhost:3000/api/voices       # expect 401
curl -s -o /dev/null -w "%{http_code}\n" -X POST localhost:3000/api/summarize  # expect 401
curl -s -o /dev/null -w "%{http_code}\n" localhost:3000/                 # expect 307 -> /unlock

# Wrong passcode:
curl -s -o /dev/null -w "%{http_code}\n" -X POST -H 'content-type: application/json' \
  -d '{"passcode":"wrong"}' localhost:3000/api/unlock                    # expect 401

# Right passcode, then the API opens:
curl -s -c /tmp/jar -X POST -H 'content-type: application/json' \
  -d "{\"passcode\":\"$APP_PASSCODE\"}" localhost:3000/api/unlock
curl -s -b /tmp/jar -o /dev/null -w "%{http_code}\n" localhost:3000/api/voices  # expect 200
```

Paste the real output. Every one of those numbers must be as stated. If `/api/signed-url` answers a stranger, the task is not done.

Also verify the fail-closed rule: unset `APP_PASSCODE`, restart, and confirm the right passcode no longer works and every route is refused.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "Put a passcode in front of the app"
```
