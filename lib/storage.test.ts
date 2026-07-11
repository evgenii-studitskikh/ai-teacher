// lib/storage.test.ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
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
