// app/api/sessions/route.test.ts
//
// This route is the fix for "the app says the transcript is saved when it is
// not". The client now saves the transcript *here*, and only summarizes once
// this route has come back with a real file path — so these tests pin down the
// two things the UI's reassurance depends on:
//   1. a successful response means the transcript really is on disk (with
//      summary: null), and the path it returns is that file;
//   2. a failure is reported as a failure (JSON error, no path), never as a
//      quiet success — which is what lets the client refuse to show a Done
//      button.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { POST as saveRoute } from "./route";
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

const session: Omit<SavedSession, "summary"> = {
  config,
  transcript: [
    { role: "agent", text: "Hi TestKid! I'm Robo. Are you ready to play?", at: 0 },
    { role: "child", text: "yes", at: 1200 },
  ],
  startedAt: "2026-03-01T09:00:00.000Z",
  endedAt: "2026-03-01T09:10:00.000Z",
};

function post(body: string): Request {
  return new Request("http://localhost/api/sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "ai-teacher-sessions-route-"));
  process.env.DATA_DIR = tempDir;
});

afterEach(async () => {
  delete process.env.DATA_DIR;
  await rm(tempDir, { recursive: true, force: true });
});

describe("POST /api/sessions", () => {
  it("writes the transcript to disk with no summary and returns the file it wrote", async () => {
    const res = await saveRoute(post(JSON.stringify(session)));

    expect(res.status).toBe(200);
    const { filePath } = (await res.json()) as { filePath: string };
    expect(typeof filePath).toBe("string");

    const saved = JSON.parse(await readFile(filePath, "utf8")) as SavedSession;
    expect(saved.transcript).toEqual(session.transcript);
    expect(saved.config).toEqual(session.config);
    expect(saved.summary).toBeNull();
  });

  it("does not write a second copy when the same save is retried", async () => {
    const first = (await (await saveRoute(post(JSON.stringify(session)))).json()) as { filePath: string };
    const second = (await (await saveRoute(post(JSON.stringify(session)))).json()) as { filePath: string };

    expect(second.filePath).toBe(first.filePath);
    expect(await readdir(path.join(tempDir, "sessions"))).toHaveLength(1);
  });

  it("reports a storage failure as a failure, with no file path", async () => {
    // DATA_DIR points at a regular file, so mkdir inside saveSession rejects
    // with ENOTDIR. The parent must be told the save failed — this is exactly
    // the case where the old UI said "the transcript is saved either way".
    const notADirectory = path.join(tempDir, "not-a-directory");
    await writeFile(notADirectory, "");
    process.env.DATA_DIR = notADirectory;

    const res = await saveRoute(post(JSON.stringify(session)));

    expect(res.status).toBe(500);
    const data = (await res.json()) as { filePath: unknown; error?: string };
    expect(data.filePath).toBeNull();
    expect(typeof data.error).toBe("string");
  });

  it("returns a JSON error for a malformed body", async () => {
    const res = await saveRoute(post("not json"));
    expect(res.status).toBe(400);
    const data = (await res.json()) as { filePath: unknown; error?: string };
    expect(data.filePath).toBeNull();
    expect(typeof data.error).toBe("string");
  });
});
