// app/api/summarize/route.test.ts
//
// These cover the two route-level failure modes from Finding 2: a malformed
// request body, and a storage failure — both of which used to sit outside
// the route's try block and therefore threw past every handler, producing
// an unhandled 500 with no JSON body. On the client, `res.json()` on a
// non-JSON 500 throws, `setLoading(false)` never runs, and the parent is
// stuck on "Writing the summary…" forever with no Retry. The fix widens the
// try block so both failures come back as an ordinary JSON error response
// instead. Neither test needs ANTHROPIC_API_KEY or a live Claude call: both
// failures happen before the route ever gets there.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { POST } from "./route";
import { POST as saveSessionRoute } from "../sessions/route";
import type { SavedSession, SessionConfig } from "../../../lib/types";

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

const validSession: Omit<SavedSession, "summary"> = {
  config,
  transcript: [{ role: "child", text: "hi", at: 0 }],
  startedAt: "2026-03-01T09:00:00.000Z",
  endedAt: "2026-03-01T09:00:05.000Z",
};

function postRequest(body: string): Request {
  return new Request("http://localhost/api/summarize", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

let tempDir: string;
let realAnthropicKey: string | undefined;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "ai-teacher-route-test-"));
  realAnthropicKey = process.env.ANTHROPIC_API_KEY;
});

afterEach(async () => {
  delete process.env.DATA_DIR;
  if (realAnthropicKey === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = realAnthropicKey;
  await rm(tempDir, { recursive: true, force: true });
});

describe("POST /api/summarize — failure paths always return JSON", () => {
  it("returns a JSON error (not an unhandled exception) for a malformed body", async () => {
    process.env.DATA_DIR = tempDir;

    const res = await POST(postRequest("not valid json"));

    expect(res.status).toBe(400);
    const data = (await res.json()) as { summary: unknown; error?: string };
    expect(data.summary).toBeNull();
    expect(typeof data.error).toBe("string");
  });

  it("returns a JSON error (not an unhandled exception) when the storage write itself fails", async () => {
    // Point DATA_DIR at a path whose ancestor is a regular file, not a
    // directory — mkdir(..., { recursive: true }) inside saveSession then
    // rejects with ENOTDIR. Before Finding 2's fix, that save call sat
    // outside the route's try block, so this would have been an unhandled
    // rejection rather than a Response.
    const notADirectory = path.join(tempDir, "not-a-directory");
    await writeFile(notADirectory, "");
    process.env.DATA_DIR = notADirectory;

    const res = await POST(postRequest(JSON.stringify(validSession)));

    expect(res.status).toBe(502);
    const data = (await res.json()) as { summary: unknown; error?: string };
    expect(data.summary).toBeNull();
    expect(typeof data.error).toBe("string");
  });
});

// The invariant the whole end-of-session flow rests on: **the transcript is on
// disk before Claude is ever called, and a failed summary never costs the
// session.** These tests make a summary failure happen deterministically, with
// no network and no API key — ANTHROPIC_API_KEY unset makes the route bail out
// at exactly the point where it is about to call Claude — and then check the
// disk.
describe("save-before-summarize: a failed summary never costs the transcript", () => {
  const sessionsIn = (dir: string) => path.join(dir, "sessions");

  function saveRequest(body: string): Request {
    return new Request("http://localhost/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
  }

  it("leaves the transcript on disk when the summary step fails (no filePath given)", async () => {
    process.env.DATA_DIR = tempDir;
    delete process.env.ANTHROPIC_API_KEY;

    const res = await POST(postRequest(JSON.stringify(validSession)));
    expect(res.status).toBe(500);
    expect(((await res.json()) as { summary: unknown }).summary).toBeNull();

    const files = await readdir(sessionsIn(tempDir));
    expect(files).toHaveLength(1);
    const saved = JSON.parse(await readFile(path.join(sessionsIn(tempDir), files[0]), "utf8")) as SavedSession;
    expect(saved.transcript).toEqual(validSession.transcript);
    expect(saved.summary).toBeNull();
  });

  it("attaches to the file POST /api/sessions already wrote, and never creates a second one", async () => {
    process.env.DATA_DIR = tempDir;
    delete process.env.ANTHROPIC_API_KEY;

    // 1. The real flow: the client saves the transcript first and gets a path.
    const saveRes = await saveSessionRoute(saveRequest(JSON.stringify(validSession)));
    const { filePath } = (await saveRes.json()) as { filePath: string };
    expect(await readdir(sessionsIn(tempDir))).toHaveLength(1);

    // 2. Summarize, handing back that path. Claude fails (no key)...
    const first = await POST(postRequest(JSON.stringify({ ...validSession, filePath })));
    expect(first.status).toBe(500);

    // 3. ...and the parent hits Retry. Neither request may fork a second
    //    record: the transcript stays exactly where it was written.
    const retry = await POST(postRequest(JSON.stringify({ ...validSession, filePath })));
    expect(retry.status).toBe(500);

    const files = await readdir(sessionsIn(tempDir));
    expect(files).toEqual([path.basename(filePath)]);
    const saved = JSON.parse(await readFile(filePath, "utf8")) as SavedSession;
    expect(saved.transcript).toEqual(validSession.transcript);
    expect(saved.summary).toBeNull();
  });

  it("ignores a bogus client-supplied filePath rather than writing outside data/sessions", async () => {
    process.env.DATA_DIR = tempDir;
    delete process.env.ANTHROPIC_API_KEY;

    const escape = path.join(tempDir, "..", "escaped.json");
    const res = await POST(postRequest(JSON.stringify({ ...validSession, filePath: escape })));
    expect(res.status).toBe(500); // the summary still fails, as designed

    // The transcript was written where it belongs — in data/sessions — and the
    // path the client made up was not touched.
    const files = await readdir(sessionsIn(tempDir));
    expect(files).toHaveLength(1);
    await expect(readFile(escape, "utf8")).rejects.toThrow();
  });
});
