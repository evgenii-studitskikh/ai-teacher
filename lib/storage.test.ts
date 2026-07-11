// lib/storage.test.ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { attachSummary, findSessionFile, loadLatestSummary, loadProfile, saveProfile, saveSession } from "./storage";
import type { SavedSession, SessionConfig, SessionSummary } from "./types";

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

// Point storage at a throwaway temp directory for every test, never at the
// repo's real `data/` folder — running this suite must be unable to touch
// accumulated real profiles/session history.
let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "ai-teacher-storage-test-"));
  process.env.DATA_DIR = tempDir;
});

afterEach(async () => {
  delete process.env.DATA_DIR;
  await rm(tempDir, { recursive: true, force: true });
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

  it("round-trips a profile with a Cyrillic name", async () => {
    const anya: SessionConfig = { ...config, childName: "Аня" };
    await saveProfile(anya);
    expect(await loadProfile("Аня")).toEqual(anya);
  });

  it("does not collide between two different Cyrillic names", async () => {
    const anya: SessionConfig = { ...config, childName: "Аня" };
    const olya: SessionConfig = { ...config, childName: "Оля" };
    await saveProfile(anya);
    await saveProfile(olya);
    expect(await loadProfile("Аня")).toEqual(anya);
    expect(await loadProfile("Оля")).toEqual(olya);
  });

  it("keeps both sessions when two saves share the same endedAt millisecond", async () => {
    const endedAt = "2026-01-01T10:00:00.000Z";
    const make = (nextFocus: string): SavedSession => ({
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
    const file1 = await saveSession(make("first"));
    const file2 = await saveSession(make("second"));

    expect(file1).not.toBe(file2);

    const saved1 = JSON.parse(await readFile(file1, "utf8")) as SavedSession;
    const saved2 = JSON.parse(await readFile(file2, "utf8")) as SavedSession;
    expect(saved1.summary?.nextFocus).toBe("first");
    expect(saved2.summary?.nextFocus).toBe("second");
  });
});

// The summarize route's real flow: write the transcript with summary: null
// before calling Claude (durable no matter what Claude does), then attach
// the summary to that same record once Claude responds. These tests exercise
// that flow through the storage layer directly, the same way the route does:
// findSessionFile to locate an already-saved record (a retry), falling back
// to saveSession when there is none yet.
describe("attachSummary / findSessionFile (write-then-attach flow)", () => {
  const summary: SessionSummary = {
    whatWeDid: "counted to 10",
    grasped: ["counting 1-5"],
    struggled: ["6-10"],
    nextFocus: "6-10",
    engagement: "high",
    transcriptQuality: "good",
  };

  const sessionsDirOf = (dir: string) => path.join(dir, "sessions");

  function makeSession(endedAt: string, transcriptText: string): Omit<SavedSession, "summary"> {
    return {
      config,
      transcript: [{ role: "child", text: transcriptText, at: 0 }],
      startedAt: endedAt,
      endedAt,
    };
  }

  it("produces exactly one file, containing the summary, after save-then-attach", async () => {
    const draft = makeSession("2026-03-01T09:00:00.000Z", "hi");

    const file = (await findSessionFile(draft)) ?? (await saveSession({ ...draft, summary: null }));
    await attachSummary(file, summary);

    const files = await readdir(sessionsDirOf(tempDir));
    expect(files).toHaveLength(1);

    const saved = JSON.parse(await readFile(file, "utf8")) as SavedSession;
    expect(saved.summary).toEqual(summary);
  });

  it("keeps the transcript on disk with summary: null when the summary step never runs (invariant A)", async () => {
    const draft = makeSession("2026-03-01T09:05:00.000Z", "hello there");

    const file = (await findSessionFile(draft)) ?? (await saveSession({ ...draft, summary: null }));
    // Simulate: Claude call throws / hangs / process dies — attachSummary is
    // never reached. The transcript must already be safe on disk.

    const files = await readdir(sessionsDirOf(tempDir));
    expect(files).toHaveLength(1);
    const saved = JSON.parse(await readFile(file, "utf8")) as SavedSession;
    expect(saved.summary).toBeNull();
    expect(saved.transcript).toEqual(draft.transcript);
  });

  it("keeps two genuinely different sessions as separate files despite an identical endedAt (invariant B)", async () => {
    const endedAt = "2026-03-01T09:10:00.000Z";
    const a = makeSession(endedAt, "session A transcript");
    const b = makeSession(endedAt, "session B transcript");

    const fileA = (await findSessionFile(a)) ?? (await saveSession({ ...a, summary: null }));
    const fileB = (await findSessionFile(b)) ?? (await saveSession({ ...b, summary: null }));

    expect(fileA).not.toBe(fileB);
    const files = await readdir(sessionsDirOf(tempDir));
    expect(files).toHaveLength(2);

    const savedA = JSON.parse(await readFile(fileA, "utf8")) as SavedSession;
    const savedB = JSON.parse(await readFile(fileB, "utf8")) as SavedSession;
    expect(savedA.transcript[0].text).toBe("session A transcript");
    expect(savedB.transcript[0].text).toBe("session B transcript");
  });

  it("does not create a second file when a summary is retried for the same session", async () => {
    const draft = makeSession("2026-03-01T09:15:00.000Z", "retry me");

    // First attempt: Claude fails, so summary is never attached.
    const firstAttemptFile = (await findSessionFile(draft)) ?? (await saveSession({ ...draft, summary: null }));

    // Retry: a brand-new HTTP request re-POSTs the identical session payload
    // (the client has no id to send back). It must find the same file.
    const retryFile = (await findSessionFile(draft)) ?? (await saveSession({ ...draft, summary: null }));
    expect(retryFile).toBe(firstAttemptFile);

    await attachSummary(retryFile, summary);

    const files = await readdir(sessionsDirOf(tempDir));
    expect(files).toHaveLength(1);
    const saved = JSON.parse(await readFile(retryFile, "utf8")) as SavedSession;
    expect(saved.summary).toEqual(summary);
  });
});
