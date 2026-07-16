// lib/browser-storage.test.ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  attachSummary,
  deleteKid,
  deleteTeacher,
  listKids,
  listProfiles,
  listTeachers,
  loadLastStart,
  loadLatestSummary,
  loadLanguage,
  loadProfile,
  migrateProfilesToKids,
  saveKid,
  saveLanguage,
  saveLastStart,
  saveProfile,
  saveSession,
  saveTeacher,
  upsertToyTeacher,
} from "./browser-storage";
import type { Kid, LastStart, SavedSession, SessionConfig, SessionSummary, Teacher, ToyInfo } from "./types";

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

  // attachSummary must not conflate "the existing record is corrupt" (safe
  // to swallow — overwriting it would just replace one unreadable record
  // with a half-formed one) with "the write itself failed" (must propagate:
  // this is the exact case SummaryView relies on to tell the parent their
  // report isn't saved for next time, rather than claiming success).
  it("swallows a corrupt existing record instead of throwing", () => {
    store.setItem("ai-teacher:session:broken", "{not json");
    expect(() => attachSummary("ai-teacher:session:broken", summary, store)).not.toThrow();
    expect(store.getItem("ai-teacher:session:broken")).toBe("{not json"); // left untouched
  });

  it("propagates a write failure instead of silently dropping the summary", () => {
    const id = saveSession(makeSession("2026-01-01T10:00:00.000Z"), store);
    // A store whose reads work (so JSON.parse succeeds) but whose writes
    // fail — a full quota, not a fully-disabled storage.
    const full: Storage = {
      ...store,
      setItem: () => {
        throw new DOMException("Quota exceeded", "QuotaExceededError");
      },
    };
    expect(() => attachSummary(id, summary, full)).toThrow();
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

// The scenarios above all pass a `store` explicitly, which never exercises
// `defaultStore()` itself. This section calls every function with NO store
// argument, so each one goes through the real default-parameter path, with
// `window.localStorage` stubbed to throw on mere access — exactly what
// Chrome/Edge does with "block all site data" enabled. Before the fix,
// that throw happened while evaluating the default parameter, which runs
// before any function's own try/catch, so it crashed straight out of
// listProfiles() and blanked ConfigForm's mount effect.
describe("defaultStore fallback (window.localStorage itself throws on access)", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        get localStorage(): Storage {
          throw new DOMException("The operation is insecure.", "SecurityError");
        },
      },
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, "window");
  });

  it("listProfiles() degrades to [] when window.localStorage itself throws", () => {
    expect(listProfiles()).toEqual([]);
  });

  it("loadProfile() degrades to null when window.localStorage itself throws", () => {
    expect(loadProfile("Mia")).toBeNull();
  });

  it("loadLatestSummary() degrades to null when window.localStorage itself throws", () => {
    expect(loadLatestSummary("Mia")).toBeNull();
  });

  it("saveSession() still throws when window.localStorage itself throws", () => {
    expect(() => saveSession(makeSession("2026-01-01T10:00:00.000Z"))).toThrow();
  });

  it("saveProfile() still throws when window.localStorage itself throws", () => {
    expect(() => saveProfile(config)).toThrow();
  });
});

describe("the global language setting", () => {
  it("roundtrips a saved language", () => {
    const store = fakeStore();
    saveLanguage("uk", store);
    expect(loadLanguage(store)).toBe("uk");
  });

  it("returns null when nothing is saved yet", () => {
    expect(loadLanguage(fakeStore())).toBeNull();
  });

  it("returns null for a stored value that is not a supported language", () => {
    // Corruption, or a profile written by a future/rolled-back version.
    const store = fakeStore();
    store.setItem("ai-teacher:language", "xx");
    expect(loadLanguage(store)).toBeNull();
  });

  it("degrades to null when storage is blocked", () => {
    expect(loadLanguage(throwingStore())).toBeNull();
  });

  it("lets a failed write throw — the caller decides best-effort", () => {
    expect(() => saveLanguage("en", throwingStore())).toThrow();
  });
});

const kid: Kid = { id: "k1", name: "Mia", age: 5, createdAt: "2026-07-16T10:00:00.000Z" };
const teacher: Teacher = {
  id: "t1",
  kind: "custom",
  name: "Robo",
  voiceId: "v1",
  personality: "warm and silly",
  createdAt: "2026-07-16T10:00:00.000Z",
};
const lastStart: LastStart = { teacherId: "t1", goal: "Count to 10", directives: "", minutes: 10 };

describe("kids", () => {
  it("round-trips a kid", () => {
    saveKid(kid, store);
    expect(listKids(store)).toEqual([kid]);
  });

  it("lists kids sorted by createdAt", () => {
    saveKid({ ...kid, id: "k2", name: "Аня", createdAt: "2026-07-17T10:00:00.000Z" }, store);
    saveKid(kid, store);
    expect(listKids(store).map((k) => k.id)).toEqual(["k1", "k2"]);
  });

  it("deletes a kid and their last-start together", () => {
    saveKid(kid, store);
    saveLastStart(kid.id, lastStart, store);
    deleteKid(kid.id, store);
    expect(listKids(store)).toEqual([]);
    expect(loadLastStart(kid.id, store)).toBeNull();
  });

  it("survives a corrupt kid entry", () => {
    saveKid(kid, store);
    store.setItem("ai-teacher:kid:broken", "{not json");
    expect(listKids(store).map((k) => k.id)).toEqual(["k1"]);
  });

  it("listKids degrades to [] when storage is blocked", () => {
    expect(listKids(throwingStore())).toEqual([]);
  });

  it("saveKid still throws when storage is blocked", () => {
    expect(() => saveKid(kid, throwingStore())).toThrow();
  });
});

describe("teachers", () => {
  it("round-trips a teacher", () => {
    saveTeacher(teacher, store);
    expect(listTeachers(store)).toEqual([teacher]);
  });

  it("updates in place when saved under the same id", () => {
    saveTeacher(teacher, store);
    saveTeacher({ ...teacher, name: "Robo 2" }, store);
    expect(listTeachers(store)).toHaveLength(1);
    expect(listTeachers(store)[0].name).toBe("Robo 2");
  });

  it("deletes a teacher", () => {
    saveTeacher(teacher, store);
    deleteTeacher(teacher.id, store);
    expect(listTeachers(store)).toEqual([]);
  });

  it("survives a corrupt teacher entry", () => {
    saveTeacher(teacher, store);
    store.setItem("ai-teacher:teacher:broken", "{not json");
    expect(listTeachers(store).map((t) => t.id)).toEqual(["t1"]);
  });
});

describe("last-start", () => {
  it("round-trips a last-start per kid", () => {
    saveLastStart("k1", lastStart, store);
    expect(loadLastStart("k1", store)).toEqual(lastStart);
    expect(loadLastStart("k2", store)).toBeNull();
  });

  it("degrades to null on corrupt data or blocked storage", () => {
    store.setItem("ai-teacher:last-start:k1", "{not json");
    expect(loadLastStart("k1", store)).toBeNull();
    expect(loadLastStart("k1", throwingStore())).toBeNull();
  });
});

const toy: ToyInfo = {
  name: "Buzz Lightyear",
  character: "a brave space-ranger action figure",
  personality: "confident, heroic, a little goofy",
  howToPlay: "fly to imaginary planets",
};

describe("upsertToyTeacher", () => {
  it("creates a toy teacher with the toy attached", () => {
    const t = upsertToyTeacher(toy, "v9", store);
    expect(t.kind).toBe("toy");
    expect(t.name).toBe("Buzz Lightyear");
    expect(t.voiceId).toBe("v9");
    expect(t.toy).toEqual(toy);
    expect(listTeachers(store)).toEqual([t]);
  });

  it("re-scanning the same toy updates instead of duplicating", () => {
    const first = upsertToyTeacher(toy, "v9", store);
    const second = upsertToyTeacher({ ...toy, personality: "brave and kind" }, null, store);
    expect(second.id).toBe(first.id);
    expect(listTeachers(store)).toHaveLength(1);
    expect(listTeachers(store)[0].personality).toBe("brave and kind");
    // A re-scan with no voice suggestion keeps the previously matched voice.
    expect(listTeachers(store)[0].voiceId).toBe("v9");
  });

  it("does not match a custom teacher with the same name", () => {
    saveTeacher({ ...teacher, name: "Buzz Lightyear" }, store);
    upsertToyTeacher(toy, null, store);
    expect(listTeachers(store)).toHaveLength(2);
  });
});

describe("migrateProfilesToKids", () => {
  it("converts each profile into a kid, a custom teacher and a last-start", () => {
    saveProfile(config, store); // Mia / Robo / v1 (from the fixtures above)
    saveProfile({ ...config, childName: "Аня", childAge: 7, goal: "Colours" }, store);
    migrateProfilesToKids(store);

    const kids = listKids(store);
    expect(kids.map((k) => k.name).sort()).toEqual(["Mia", "Аня"]);
    expect(kids.find((k) => k.name === "Аня")?.age).toBe(7);

    // Same (agentName, voiceId) pair → ONE custom teacher shared by both kids.
    const teachers = listTeachers(store);
    expect(teachers).toHaveLength(1);
    expect(teachers[0]).toMatchObject({ kind: "custom", name: "Robo", voiceId: "v1", personality: "" });

    const mia = kids.find((k) => k.name === "Mia") as Kid;
    expect(loadLastStart(mia.id, store)).toEqual({
      teacherId: teachers[0].id,
      goal: "Count to 10",
      directives: "",
      minutes: 10,
    });

    // Old profile keys are gone.
    expect(listProfiles(store)).toEqual([]);
  });

  it("creates one teacher per distinct (agentName, voiceId) pair", () => {
    saveProfile(config, store);
    saveProfile({ ...config, childName: "Аня", agentName: "Zoe", voiceId: "v2" }, store);
    migrateProfilesToKids(store);
    expect(listTeachers(store).map((t) => t.name).sort()).toEqual(["Robo", "Zoe"]);
  });

  it("is idempotent — a second run changes nothing", () => {
    saveProfile(config, store);
    migrateProfilesToKids(store);
    const before = { kids: listKids(store), teachers: listTeachers(store) };
    migrateProfilesToKids(store);
    expect(listKids(store)).toEqual(before.kids);
    expect(listTeachers(store)).toEqual(before.teachers);
  });

  it("does nothing (and does not mark migrated) when storage is blocked", () => {
    expect(() => migrateProfilesToKids(throwingStore())).toThrow();
  });

  it("maps an empty voiceId to null", () => {
    saveProfile({ ...config, voiceId: "" }, store);
    migrateProfilesToKids(store);
    expect(listTeachers(store)[0].voiceId).toBeNull();
  });
});
