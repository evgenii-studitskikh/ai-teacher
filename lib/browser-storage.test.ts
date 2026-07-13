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

// A `Storage` that fails on every access — Safari private mode, or storage
// disabled by policy. Writes must still throw (the caller is responsible for
// telling the parent the save failed); reads must degrade instead of
// crashing the config screen.
function throwingStore(): Storage {
  const boom = () => {
    throw new Error("storage unavailable");
  };
  return {
    get length(): number {
      throw new Error("storage unavailable");
    },
    clear: boom,
    getItem: boom,
    key: boom,
    removeItem: boom,
    setItem: boom,
  };
}

// The same Cyrillic letter "й", typed two different ways. A phone keyboard
// composing input can produce either form for what looks, on screen, like
// the exact same name.
const COMPOSED_YO = "\u0439"; // CYRILLIC SMALL LETTER SHORT I (single composed codepoint)
const DECOMPOSED_YO = "\u0438\u0306"; // CYRILLIC SMALL LETTER I + COMBINING BREVE (canonically equivalent, visually identical to \u0439)

const nameComposed = `Ма${COMPOSED_YO}я`; // "Майя" typed as a single composed \u0439
const nameDecomposed = `Ма${DECOMPOSED_YO}я`; // the same "Майя" typed as decomposed \u0438 \u0306

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

  // A composed codepoint and a base-letter-plus-combining-mark sequence look
  // identical on screen but are different strings unless normalised. A parent
  // typing the same name on a phone one day and a laptop the next must not
  // fragment their child into two profiles.
  it("resolves a composed and a decomposed spelling of the same name to one profile", () => {
    expect(nameComposed).not.toBe(nameDecomposed); // different strings, same rendered name
    saveProfile({ ...config, childName: nameComposed }, store);
    expect(loadProfile(nameDecomposed, store)).toEqual({ ...config, childName: nameComposed });
  });

  it("does not create a second profile when the decomposed spelling is saved second", () => {
    saveProfile({ ...config, childName: nameComposed }, store);
    saveProfile({ ...config, childName: nameDecomposed, childAge: 6 }, store);
    expect(listProfiles(store)).toHaveLength(1);
    expect(listProfiles(store)[0].childAge).toBe(6); // the second save overwrote the same profile
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
    saveSession(makeSession("2026-01-02T10:00:00.000Z"), store); // newer, never summarized
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

  it("finds a session saved under one spelling of a name from the other spelling", () => {
    expect(nameComposed).not.toBe(nameDecomposed); // different strings, same rendered name
    const id = saveSession(makeSession("2026-01-01T10:00:00.000Z", nameComposed), store);
    attachSummary(id, summary, store);
    expect(loadLatestSummary(nameDecomposed, store)).toEqual(summary);
  });

  it("merges history from both spellings when picking the latest summary", () => {
    const older = saveSession(makeSession("2026-01-01T10:00:00.000Z", nameComposed), store);
    const newer = saveSession(makeSession("2026-01-02T10:00:00.000Z", nameDecomposed), store);
    attachSummary(older, { ...summary, nextFocus: "older" }, store);
    attachSummary(newer, { ...summary, nextFocus: "newer" }, store);
    expect(loadLatestSummary(nameComposed, store)?.nextFocus).toBe("newer");
    expect(loadLatestSummary(nameDecomposed, store)?.nextFocus).toBe("newer");
  });
});

describe("degraded storage", () => {
  // Safari private mode / storage disabled by policy can make localStorage
  // access itself throw, not just fail to find a key. Reads must degrade to
  // an empty result instead of taking down the config screen.
  it("listProfiles returns [] instead of throwing when storage access fails", () => {
    expect(listProfiles(throwingStore())).toEqual([]);
  });

  it("loadProfile returns null instead of throwing when storage access fails", () => {
    expect(loadProfile("Mia", throwingStore())).toBeNull();
  });

  it("loadLatestSummary returns null instead of throwing when storage access fails", () => {
    expect(loadLatestSummary("Mia", throwingStore())).toBeNull();
  });

  // Writes must still throw: swallowing a failed write would silently lose a
  // lesson, which is worse than crashing loudly so the caller can tell the
  // parent the transcript was not saved.
  it("saveProfile still throws when storage access fails", () => {
    expect(() => saveProfile(config, throwingStore())).toThrow();
  });

  it("saveSession still throws when storage access fails", () => {
    expect(() => saveSession(makeSession("2026-01-01T10:00:00.000Z"), throwingStore())).toThrow();
  });

  it("attachSummary still throws when storage access fails", () => {
    expect(() => attachSummary("ai-teacher:session:x", summary, throwingStore())).toThrow();
  });
});
