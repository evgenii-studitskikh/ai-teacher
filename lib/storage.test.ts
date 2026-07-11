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
