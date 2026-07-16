# Teachers Management & Quick-Start Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the per-session ConfigForm with a few-click flow — pick kid → pick teacher → pre-filled start sheet → start — backed by first-class Kid and Teacher entities in localStorage.

**Architecture:** Everything stays a client-side stage machine in `app/page.tsx` with localStorage persistence (`lib/browser-storage.ts`). Teachers come in three kinds: presets (in code), custom, and toy (scanned POV toys, saved and reusable). `SessionConfig` keeps its shape so `SessionView`, ElevenLabs overrides, and the first-message safety canary are untouched.

**Tech Stack:** Next.js 16 App Router (client components + route handlers), TypeScript, CSS modules, Vitest, Zod, `@anthropic-ai/sdk` (vision), ElevenLabs REST (voices + Voice Design).

**Spec:** `docs/superpowers/specs/2026-07-16-teachers-management-design.md`

## Global Constraints

- **This is NOT the Next.js you know** (AGENTS.md): before writing any route-handler or App-Router code, read the relevant guide in `node_modules/next/dist/docs/`. The existing routes in `app/api/*/route.ts` show the working pattern — follow them.
- Every parent-facing string goes into `UIStrings` in `lib/i18n.ts` and must be translated into **all 7 languages** (en, ru, es, de, he, tl, uk) — this is compile-enforced. Match each language block's existing register (ru: formal вы; uk: ви; de: du; es: tú; he: plural אתם). No gendered pronouns for the child anywhere.
- Storage convention (`lib/browser-storage.ts`): every function takes `store: Storage = defaultStore()` as last param; **reads degrade** (return null/[]), **writes throw**.
- CSS uses **logical properties** (`inline-start`, `block-end`, …) so Hebrew RTL mirrors correctly.
- The first-message canary requires `agentName` and `childName` to appear in `buildFirstMessage` — never break that.
- Language always comes from the global header picker (`useLanguage()`), injected into `SessionConfig` at start.
- Run tests with `npm test`, lint with `npm run lint`, typecheck with `npx tsc --noEmit`.
- Commit message trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

### Task 1: Types — Kid, Teacher, LastStart; SessionConfig references

**Files:**
- Modify: `lib/types.ts`
- Modify: `lib/i18n.ts` (only the `fieldNames` Exclude list — keeps compiling)

**Interfaces:**
- Produces: `Kid`, `TeacherKind`, `Teacher`, `LastStart` types; `SessionConfig` gains optional `kidId`, `teacherId`, `teacherPersonality`. All later tasks import these from `../lib/types` / `./types`.

- [ ] **Step 1: Add the new types to `lib/types.ts`** (after the `ToyInfo` block):

```ts
// A child, as a first-class entity. Previously a "kid" was implicitly the last
// SessionConfig saved under a name; now name and age live here and the rest of
// a session's settings are assembled at start time.
export type Kid = {
  id: string; // crypto.randomUUID()
  name: string;
  age: number; // 2–12
  createdAt: string; // ISO
};

export type TeacherKind = "preset" | "custom" | "toy";

// A teacher profile. Presets live in code (lib/preset-teachers.ts) and are
// never stored; custom and toy teachers are stored in localStorage. A toy
// teacher is a scanned POV toy made reusable: its ToyInfo rides along and puts
// buildPrompt into toy mode when the session starts.
export type Teacher = {
  id: string; // uuid for stored teachers; "preset:<name>" for presets
  kind: TeacherKind;
  name: string;
  voiceId: string | null; // null = resolve automatically at start
  personality: string; // free-form English prose, woven into the prompt
  toy?: ToyInfo; // only for kind "toy"
  createdAt: string; // "" for presets (stable, never rendered)
};

// What the start sheet pre-fills for a kid: everything their previous session
// chose. Keyed by kid id in storage.
export type LastStart = {
  teacherId: string;
  goal: string;
  directives: string;
  minutes: number;
};
```

- [ ] **Step 2: Extend `SessionConfig`** in `lib/types.ts` — add after `minutes: number;`:

```ts
  // Which saved kid/teacher this session was assembled from, for the session
  // record. Optional: nothing downstream depends on them.
  kidId?: string;
  teacherId?: string;
  // The teacher's personality prose, woven into the prompt when present.
  teacherPersonality?: string;
```

- [ ] **Step 3: Fix the derived `fieldNames` type** in `lib/i18n.ts` (line ~67) so the new optional keys don't demand labels:

```ts
  fieldNames: Record<
    Exclude<
      keyof SessionConfig,
      "childName" | "language" | "toy" | "toyMode" | "kidId" | "teacherId" | "teacherPersonality"
    >,
    string
  >;
```

- [ ] **Step 4: Verify it all still compiles and tests pass**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors; all existing tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/types.ts lib/i18n.ts
git commit -m "feat: Kid, Teacher, LastStart types; SessionConfig references"
```

---

### Task 2: Storage CRUD for kids, teachers, last-start

**Files:**
- Modify: `lib/browser-storage.ts`
- Test: `lib/browser-storage.test.ts`

**Interfaces:**
- Consumes: `Kid`, `Teacher`, `LastStart` from Task 1.
- Produces (all with `store: Storage = defaultStore()` as last param):
  - `saveKid(kid: Kid, store?): void` / `listKids(store?): Kid[]` (sorted by `createdAt`) / `deleteKid(id: string, store?): void` (also removes that kid's last-start)
  - `saveTeacher(teacher: Teacher, store?): void` / `listTeachers(store?): Teacher[]` (sorted by `createdAt`) / `deleteTeacher(id: string, store?): void`
  - `saveLastStart(kidId: string, last: LastStart, store?): void` / `loadLastStart(kidId: string, store?): LastStart | null`

- [ ] **Step 1: Write the failing tests** — append to `lib/browser-storage.test.ts`:

```ts
import {
  deleteKid,
  deleteTeacher,
  listKids,
  listTeachers,
  loadLastStart,
  saveKid,
  saveLastStart,
  saveTeacher,
} from "./browser-storage";
import type { Kid, LastStart, Teacher } from "./types";

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- lib/browser-storage.test.ts`
Expected: FAIL — `saveKid` etc. not exported.

- [ ] **Step 3: Implement in `lib/browser-storage.ts`** — extend the type import to include `Kid, LastStart, Teacher`, add prefixes next to the existing ones, and append:

```ts
const KID_PREFIX = "ai-teacher:kid:";
const TEACHER_PREFIX = "ai-teacher:teacher:";
const LAST_START_PREFIX = "ai-teacher:last-start:";

// Shared list-read for the entity stores: same degrade rules as listProfiles —
// a blocked store lists nothing, one corrupt entry must not cost the rest.
function listEntities<T extends { createdAt: string }>(prefix: string, store: Storage): T[] {
  const items: T[] = [];
  for (const key of keysWithPrefix(prefix, store)) {
    try {
      items.push(JSON.parse(store.getItem(key) ?? "") as T);
    } catch {
      // One unreadable entry must not cost the parent every other one.
    }
  }
  // Machine-generated ISO timestamps: plain comparison, not localeCompare
  // (same reasoning as loadLatestSummary).
  return items.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
}

export function saveKid(kid: Kid, store: Storage = defaultStore()): void {
  store.setItem(KID_PREFIX + kid.id, JSON.stringify(kid));
}

export function listKids(store: Storage = defaultStore()): Kid[] {
  return listEntities<Kid>(KID_PREFIX, store);
}

export function deleteKid(id: string, store: Storage = defaultStore()): void {
  store.removeItem(KID_PREFIX + id);
  // Their pre-fill goes with them; saved sessions stay (independently keyed,
  // historical record).
  store.removeItem(LAST_START_PREFIX + id);
}

export function saveTeacher(teacher: Teacher, store: Storage = defaultStore()): void {
  store.setItem(TEACHER_PREFIX + teacher.id, JSON.stringify(teacher));
}

export function listTeachers(store: Storage = defaultStore()): Teacher[] {
  return listEntities<Teacher>(TEACHER_PREFIX, store);
}

export function deleteTeacher(id: string, store: Storage = defaultStore()): void {
  store.removeItem(TEACHER_PREFIX + id);
}

export function saveLastStart(kidId: string, last: LastStart, store: Storage = defaultStore()): void {
  store.setItem(LAST_START_PREFIX + kidId, JSON.stringify(last));
}

export function loadLastStart(kidId: string, store: Storage = defaultStore()): LastStart | null {
  let raw: string | null;
  try {
    raw = store.getItem(LAST_START_PREFIX + kidId);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LastStart;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- lib/browser-storage.test.ts`
Expected: PASS (all, including the pre-existing ones).

- [ ] **Step 5: Commit**

```bash
git add lib/browser-storage.ts lib/browser-storage.test.ts
git commit -m "feat: localStorage CRUD for kids, teachers and last-start prefill"
```

---

### Task 3: Toy-teacher upsert and profile migration

**Files:**
- Modify: `lib/browser-storage.ts`
- Test: `lib/browser-storage.test.ts`

**Interfaces:**
- Produces:
  - `upsertToyTeacher(toy: ToyInfo, voiceId: string | null, store?): Teacher` — re-scanning the same toy (matched by NFC-lowercased name) updates the existing toy teacher instead of piling up duplicates; returns the saved teacher.
  - `migrateProfilesToKids(store?): void` — idempotent, marker-guarded conversion of legacy `ai-teacher:profile:*` entries.

- [ ] **Step 1: Write the failing tests** — append to `lib/browser-storage.test.ts`:

```ts
import { migrateProfilesToKids, upsertToyTeacher } from "./browser-storage";
import type { ToyInfo } from "./types";

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- lib/browser-storage.test.ts`
Expected: FAIL — functions not exported.

- [ ] **Step 3: Implement** — append to `lib/browser-storage.ts` (extend the type import with `ToyInfo`):

```ts
const MIGRATION_KEY = "ai-teacher:profiles-migrated";

function normalizeName(name: string): string {
  return name.trim().normalize("NFC").toLowerCase();
}

// A re-scanned toy should update its existing teacher, not clutter the picker
// with near-duplicates. Toys are matched by normalized name — the same rule
// child profiles used, and the model names the same toy the same way.
export function upsertToyTeacher(
  toy: ToyInfo,
  voiceId: string | null,
  store: Storage = defaultStore(),
): Teacher {
  const existing = listTeachers(store).find(
    (t) => t.kind === "toy" && normalizeName(t.name) === normalizeName(toy.name),
  );
  const teacher: Teacher = {
    id: existing?.id ?? crypto.randomUUID(),
    kind: "toy",
    name: toy.name,
    // A fresh suggestion wins; no suggestion keeps whatever match (or designed
    // voice) the toy already had.
    voiceId: voiceId ?? existing?.voiceId ?? null,
    personality: toy.personality,
    toy,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  };
  saveTeacher(teacher, store);
  return teacher;
}

// One-time conversion of the legacy per-child profiles (a whole SessionConfig
// keyed by child name) into first-class kids + teachers + last-start prefills.
// The marker is written LAST: any throw on the way leaves the old profiles
// intact for the next attempt, and a second run after success is a no-op.
export function migrateProfilesToKids(store: Storage = defaultStore()): void {
  if (store.getItem(MIGRATION_KEY) !== null) return;

  const profiles = listProfiles(store);
  const teacherByPair = new Map<string, string>(); // "agentName voiceId" -> teacher id
  const migratedKeys: string[] = [];

  for (const p of profiles) {
    const pairKey = `${p.agentName} ${p.voiceId}`;
    let teacherId = teacherByPair.get(pairKey);
    if (!teacherId) {
      teacherId = crypto.randomUUID();
      saveTeacher(
        {
          id: teacherId,
          kind: "custom",
          name: p.agentName,
          voiceId: p.voiceId || null,
          personality: "",
          createdAt: new Date().toISOString(),
        },
        store,
      );
      teacherByPair.set(pairKey, teacherId);
    }

    const kid: Kid = {
      id: crypto.randomUUID(),
      name: p.childName,
      age: p.childAge,
      createdAt: new Date().toISOString(),
    };
    saveKid(kid, store);
    saveLastStart(
      kid.id,
      { teacherId, goal: p.goal, directives: p.directives, minutes: p.minutes },
      store,
    );
    migratedKeys.push(profileKey(p.childName)); // the existing private helper — same key the profile was saved under
  }

  for (const key of migratedKeys) store.removeItem(key);
  store.setItem(MIGRATION_KEY, new Date().toISOString());
}
```

Note: `normalizeChildName` already exists with the same body — replace its body with a call to the new shared `normalizeName` (or rename; keep `profileKey` compiling) rather than duplicating the NFC logic.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- lib/browser-storage.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/browser-storage.ts lib/browser-storage.test.ts
git commit -m "feat: toy-teacher upsert and legacy profile migration"
```

---

### Task 4: Preset teachers

**Files:**
- Create: `lib/preset-teachers.ts`
- Test: `lib/preset-teachers.test.ts`

**Interfaces:**
- Produces: `PRESET_TEACHER_IDS` (`["generalist", "storyteller", "mathCoach"] as const`), `PresetTeacherId`, `makePresetTeacher(id: PresetTeacherId, name: string): Teacher`. The `name` comes from `UIStrings.presetTeachers[id].name` (Task 6 adds those strings) so preset display names are localized while personalities stay English prompt-prose.

- [ ] **Step 1: Write the failing test** — `lib/preset-teachers.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { PRESET_TEACHER_IDS, makePresetTeacher } from "./preset-teachers";

describe("preset teachers", () => {
  it("builds a well-formed Teacher for every preset", () => {
    for (const id of PRESET_TEACHER_IDS) {
      const t = makePresetTeacher(id, "Sunny");
      expect(t.id).toBe(`preset:${id}`);
      expect(t.kind).toBe("preset");
      expect(t.name).toBe("Sunny");
      expect(t.voiceId).toBeNull(); // presets never hardcode a voice
      expect(t.personality.length).toBeGreaterThan(20);
      expect(t.toy).toBeUndefined();
    }
  });

  it("has unique ids", () => {
    expect(new Set(PRESET_TEACHER_IDS).size).toBe(PRESET_TEACHER_IDS.length);
  });

  it("keeps personalities free of gendered pronouns about the child", () => {
    for (const id of PRESET_TEACHER_IDS) {
      const p = makePresetTeacher(id, "X").personality.toLowerCase();
      for (const pronoun of [" he ", " she ", " him ", " her ", " his ", " hers "]) {
        expect(p).not.toContain(pronoun);
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/preset-teachers.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/preset-teachers.ts`:**

```ts
import type { Teacher } from "./types";

// The teachers the app ships with. Their PERSONALITIES live here, in English —
// they are prompt material, and the prompt is composed in English (see
// lib/prompt.ts for why). Their display names and descriptions are
// parent-facing and therefore live in lib/i18n.ts (UIStrings.presetTeachers),
// localized like everything else the parent reads.
//
// Presets are never stored: they are materialized into Teacher objects at
// render time via makePresetTeacher, with the localized name passed in. That
// name doubles as agentName in the greeting, which is fine in any language —
// the canary only requires that the name appears in the first spoken turn.
export const PRESET_TEACHER_IDS = ["generalist", "storyteller", "mathCoach"] as const;
export type PresetTeacherId = (typeof PRESET_TEACHER_IDS)[number];

const PRESET_PERSONALITIES: Record<PresetTeacherId, string> = {
  generalist:
    "Endlessly warm and encouraging. Curious about everything the child says, " +
    "celebrates small wins out loud, and turns any topic into a playful game.",
  storyteller:
    "A playful storyteller. Wraps every lesson in little stories and pretend " +
    "adventures, does silly character voices, and invites the child to decide " +
    "what happens next.",
  mathCoach:
    "A patient, cheerful math coach. Loves counting anything in sight, breaks " +
    "every problem into tiny steps, and treats a mistake as a clue to puzzle " +
    "over together, never an error.",
};

export function makePresetTeacher(id: PresetTeacherId, name: string): Teacher {
  return {
    id: `preset:${id}`,
    kind: "preset",
    name,
    voiceId: null,
    personality: PRESET_PERSONALITIES[id],
    createdAt: "", // constant: presets sort before stored teachers and never re-render spuriously
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/preset-teachers.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/preset-teachers.ts lib/preset-teachers.test.ts
git commit -m "feat: built-in preset teachers"
```

---

### Task 5: Teacher personality in the prompt

**Files:**
- Modify: `lib/prompt.ts`
- Test: `lib/prompt.test.ts`

**Interfaces:**
- Consumes: `SessionConfig.teacherPersonality` (Task 1).
- Produces: `buildPrompt` weaves a `Your personality: …` line into the lesson prompt and the third-person toy prompt when `teacherPersonality` is a non-empty string. POV toy prompts are untouched (the toy's own personality is already there). `buildFirstMessage` untouched.

- [ ] **Step 1: Write the failing tests** — add to `lib/prompt.test.ts` (follow the file's existing fixture style; if it defines a base config fixture, reuse it):

```ts
describe("teacher personality", () => {
  it("weaves a non-empty personality into the lesson prompt", () => {
    const prompt = buildPrompt({ ...config, teacherPersonality: "A playful storyteller." }, null);
    expect(prompt).toContain("Your personality: A playful storyteller.");
  });

  it("adds no personality line when the field is absent or blank", () => {
    expect(buildPrompt(config, null)).not.toContain("Your personality:");
    expect(buildPrompt({ ...config, teacherPersonality: "   " }, null)).not.toContain("Your personality:");
  });

  it("weaves the helper's personality into a third-person toy prompt", () => {
    const prompt = buildPrompt(
      { ...config, toy, toyMode: "third-person", teacherPersonality: "Gentle and giggly." },
      null,
    );
    expect(prompt).toContain("Your personality: Gentle and giggly.");
    // The toy's own personality is still described separately.
    expect(prompt).toContain(`${toy.name}'s personality: ${toy.personality}`);
  });

  it("leaves the POV toy prompt to the toy's own personality", () => {
    const prompt = buildPrompt(
      { ...config, toy, toyMode: "pov", teacherPersonality: "Should not appear." },
      null,
    );
    expect(prompt).not.toContain("Should not appear.");
  });
});
```

(If `lib/prompt.test.ts` has no `toy` fixture, add one matching `ToyInfo` — see the Task 3 test fixture.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- lib/prompt.test.ts`
Expected: FAIL on the "weaves" cases.

- [ ] **Step 3: Implement in `lib/prompt.ts`** — add one helper above `toyPersona`:

```ts
// The teacher's own personality, when the parent picked or wrote one. A blank
// personality must add nothing: the base "warm, playful teacher" framing IS
// the default persona, and an empty "Your personality:" line would read as an
// instruction to have none.
function teacherPersonalityLine(config: SessionConfig): string {
  const p = config.teacherPersonality?.trim();
  return p ? `\nYour personality: ${p}` : "";
}
```

In `toyPersona`, third-person branch: append `${teacherPersonalityLine(config)}` to the returned template (after the `${toy.name}'s personality: …` line). Leave the POV branch alone — there the agent IS the toy and `toy.personality` already governs.

In `buildPrompt`'s lesson return, change the opening from:

```ts
  return `You are ${config.agentName}, a warm, playful teacher talking with ${name}, who is ${config.childAge} years old.
```

to:

```ts
  return `You are ${config.agentName}, a warm, playful teacher talking with ${name}, who is ${config.childAge} years old.${teacherPersonalityLine(config)}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- lib/prompt.test.ts`
Expected: PASS (including the pre-existing no-gendered-pronoun tests).

- [ ] **Step 5: Commit**

```bash
git add lib/prompt.ts lib/prompt.test.ts
git commit -m "feat: weave teacher personality into the prompt"
```

---

### Task 6: i18n — all new UI strings, 7 languages

**Files:**
- Modify: `lib/i18n.ts`

**Interfaces:**
- Consumes: `PresetTeacherId` from Task 4.
- Produces: the `UIStrings` keys below; every component task (9–13) references them via `t.*`. Do NOT remove any existing keys in this task — removal happens in Task 14 when their consumers are deleted.

- [ ] **Step 1: Extend the `UIStrings` type** — add these sections (import `PresetTeacherId` from `./preset-teachers`):

```ts
  // KidPicker (home)
  whoIsLearning: string;
  addKid: string;
  ageShort: (age: number) => string;
  manage: string;
  save: string;
  cancel: string;

  // TeacherPicker
  whoWillTeach: string;
  presetBadge: string;
  toyBadge: string;
  lastTimeBadge: string;
  scanToyTitle: string;
  scanToySub: string;
  playingWith: (toyName: string) => string;
  presetTeachers: Record<PresetTeacherId, { name: string; description: string }>;

  // StartSheet
  todaysSession: string;
  durationLabel: string;
  minutesShort: (m: number) => string;
  changeSelection: string;

  // Manage
  kidsTab: string;
  teachersTab: string;
  edit: string;
  deleteAction: string;
  confirmDelete: string;
  duplicateAndEdit: string;
  newTeacher: string;
  teacherNameLabel: string;
  personalityFieldLabel: string;
  personalityPlaceholder: string;
  autoVoice: string;
  generateVoice: string;
  generatingVoice: string;
  voiceGenerated: string;
  voiceGenerateFailed: (detail: string) => string;
  nothingHereYet: string;
```

- [ ] **Step 2: Add the English values** to the `en` object:

```ts
  whoIsLearning: "Who's learning today?",
  addKid: "Add a child",
  ageShort: (age) => `Age ${age}`,
  manage: "Manage",
  save: "Save",
  cancel: "Cancel",

  whoWillTeach: "Who will teach?",
  presetBadge: "Built-in",
  toyBadge: "Toy",
  lastTimeBadge: "Last time",
  scanToyTitle: "Scan a toy",
  scanToySub: "Photograph a real toy and bring it to life.",
  playingWith: (toyName) => `Playing with ${toyName} — now pick a helper.`,
  presetTeachers: {
    generalist: { name: "Sunny", description: "A warm all-rounder for any topic." },
    storyteller: { name: "Luna", description: "Turns every lesson into a story." },
    mathCoach: { name: "Max", description: "Patient coach for numbers and counting." },
  },

  todaysSession: "Today's session",
  durationLabel: "How long?",
  minutesShort: (m) => `${m} min`,
  changeSelection: "Change",

  kidsTab: "Children",
  teachersTab: "Teachers",
  edit: "Edit",
  deleteAction: "Delete",
  confirmDelete: "Tap again to confirm",
  duplicateAndEdit: "Duplicate & edit",
  newTeacher: "New teacher",
  teacherNameLabel: "Name",
  personalityFieldLabel: "Personality",
  personalityPlaceholder: "Warm and curious. Loves puns. Always up for a pretend adventure.",
  autoVoice: "Automatic (best match)",
  generateVoice: "Generate a matching voice",
  generatingVoice: "Generating a voice…",
  voiceGenerated: "Voice created and selected.",
  voiceGenerateFailed: (detail) => `Could not generate a voice: ${detail} The best-match voice is still selected.`,
  nothingHereYet: "Nothing here yet.",
```

- [ ] **Step 3: Translate the same block into ru, es, de, he, tl, uk** — author real translations in each language object, matching each block's existing register (ru formal вы, uk ви, de du, es tú, he plural אתם; Hebrew mirrors via RTL automatically). Preset teacher names may be transliterated where natural (e.g. ru «Луна», «Макс»). No gendered pronouns for the child. The compiler enforces completeness — `npx tsc --noEmit` fails until every language has every key.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm test`
Expected: clean compile; existing i18n tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/i18n.ts
git commit -m "feat: UI strings for kid/teacher pickers, start sheet and management (7 languages)"
```

---

### Task 7: Toy voice suggestion — helpers, voices passthrough, identify-toy

**Files:**
- Create: `lib/toy-voice.ts`
- Test: `lib/toy-voice.test.ts`
- Modify: `app/api/voices/route.ts`
- Modify: `app/api/identify-toy/route.ts`

**Interfaces:**
- Produces:
  - `VoiceCatalogEntry = { voiceId: string; name: string; labels?: Record<string, string>; description?: string | null }`
  - `voiceCatalogPrompt(voices: VoiceCatalogEntry[]): string` — prompt fragment listing the catalog
  - `validateVoiceId(id: string | null | undefined, voices: VoiceCatalogEntry[]): string | null`
  - `buildVoiceDescription(toy: ToyInfo): string` — 20–1000 chars, for Voice Design (used by Task 8's client call)
  - `/api/voices` response voices gain `labels` and `description`
  - `POST /api/identify-toy` accepts optional `voices: VoiceCatalogEntry[]` and returns `{ toy, suggestedVoiceId: string | null }`

- [ ] **Step 1: Write the failing tests** — `lib/toy-voice.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildVoiceDescription, validateVoiceId, voiceCatalogPrompt } from "./toy-voice";
import type { ToyInfo } from "./types";

const voices = [
  { voiceId: "v1", name: "Bella", labels: { age: "young", gender: "female" }, description: "bright and airy" },
  { voiceId: "v2", name: "Rex", labels: {}, description: null },
];

const toy: ToyInfo = {
  name: "Buzz",
  character: "a space ranger",
  personality: "confident, heroic",
  howToPlay: "fly around",
};

describe("voiceCatalogPrompt", () => {
  it("lists every voice with id, name and hints", () => {
    const p = voiceCatalogPrompt(voices);
    expect(p).toContain("v1");
    expect(p).toContain("Bella");
    expect(p).toContain("age: young");
    expect(p).toContain("bright and airy");
    expect(p).toContain("v2");
  });
});

describe("validateVoiceId", () => {
  it("passes an id that is in the catalog", () => {
    expect(validateVoiceId("v2", voices)).toBe("v2");
  });
  it("rejects an id that is not in the catalog", () => {
    expect(validateVoiceId("hallucinated", voices)).toBeNull();
  });
  it("rejects null/undefined", () => {
    expect(validateVoiceId(null, voices)).toBeNull();
    expect(validateVoiceId(undefined, voices)).toBeNull();
  });
});

describe("buildVoiceDescription", () => {
  it("describes the toy from its character and personality", () => {
    const d = buildVoiceDescription(toy);
    expect(d).toContain("space ranger");
    expect(d).toContain("confident");
  });
  it("is always within Voice Design's 20–1000 char bounds", () => {
    const tiny = buildVoiceDescription({ name: "X", character: "a", personality: "b", howToPlay: "" });
    expect(tiny.length).toBeGreaterThanOrEqual(20);
    const huge = buildVoiceDescription({ ...toy, personality: "x".repeat(2000) });
    expect(huge.length).toBeLessThanOrEqual(1000);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- lib/toy-voice.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/toy-voice.ts`:**

```ts
import type { ToyInfo } from "./types";

// The slice of a voice the matching prompt needs. Shapes match what
// /api/voices passes through from ElevenLabs v2.
export type VoiceCatalogEntry = {
  voiceId: string;
  name: string;
  labels?: Record<string, string>;
  description?: string | null;
};

// A compact catalog for the vision model to pick from. Ids are what it must
// return, so they lead each line.
export function voiceCatalogPrompt(voices: VoiceCatalogEntry[]): string {
  return voices
    .map((v) => {
      const hints = [
        ...Object.entries(v.labels ?? {}).map(([k, val]) => `${k}: ${val}`),
        ...(v.description ? [v.description] : []),
      ].join("; ");
      return `- id "${v.voiceId}" — ${v.name}${hints ? ` (${hints})` : ""}`;
    })
    .join("\n");
}

// The model returns ids as free text; only an id that exists in the catalog it
// was shown may ever reach a Teacher record.
export function validateVoiceId(
  id: string | null | undefined,
  voices: VoiceCatalogEntry[],
): string | null {
  if (!id) return null;
  return voices.some((v) => v.voiceId === id) ? id : null;
}

// Voice Design requires a 20–1000 character description. Compose one from the
// toy, pad the degenerate short case, clamp the long one.
export function buildVoiceDescription(toy: ToyInfo): string {
  let d = `The voice of ${toy.name}, ${toy.character}. Sounds ${toy.personality}. A warm, friendly voice for a young child's toy.`;
  if (d.length < 20) d = d + " Gentle, playful and kind.";
  return d.slice(0, 1000);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- lib/toy-voice.test.ts`
Expected: PASS.

- [ ] **Step 5: Pass labels/description through `/api/voices`** — in `app/api/voices/route.ts`, extend the response type and mapping:

```ts
  const data = (await res.json()) as {
    voices: {
      voice_id: string;
      name: string;
      preview_url: string;
      labels?: Record<string, string>;
      description?: string | null;
    }[];
  };
  return Response.json({
    voices: data.voices.map((v) => ({
      voiceId: v.voice_id,
      name: v.name,
      previewUrl: v.preview_url,
      labels: v.labels ?? {},
      description: v.description ?? null,
    })),
  });
```

- [ ] **Step 6: Teach `/api/identify-toy` to suggest a voice** — in `app/api/identify-toy/route.ts`:

Add imports:

```ts
import { validateVoiceId, voiceCatalogPrompt } from "../../../lib/toy-voice";
import type { VoiceCatalogEntry } from "../../../lib/toy-voice";
```

Extend the request type and sanitize the catalog (never trust the client array):

```ts
type IdentifyRequest = { image?: unknown; mediaType?: unknown; voices?: unknown };

function sanitizeVoices(input: unknown): VoiceCatalogEntry[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter(
      (v): v is VoiceCatalogEntry =>
        typeof v === "object" && v !== null &&
        typeof (v as VoiceCatalogEntry).voiceId === "string" &&
        typeof (v as VoiceCatalogEntry).name === "string",
    )
    .slice(0, 100);
}
```

Extend the Zod schema with a suggestion field:

```ts
  // The catalog voice that best fits how this toy would sound; null when no
  // catalog was provided or nothing fits. Validated against the catalog after
  // parsing — a hallucinated id must never reach a Teacher record.
  suggestedVoiceId: z.string().nullable(),
```

In `POST`, after `const mediaType = …`, add `const voices = sanitizeVoices(body.voices);` and append to the prompt text (inside the template literal, after the "Never invent scary…" line):

```ts
${voices.length > 0 ? `
Additionally, pick the voice from this catalog that best matches how this toy
would sound if it spoke (consider size, species, character — squeaky for a
small plush, deep for a big bear). Return its exact id as suggestedVoiceId,
or null if nothing fits:
${voiceCatalogPrompt(voices)}` : "Set suggestedVoiceId to null."}
```

And return the validated suggestion in both success responses:

```ts
    if (!result.recognized || !result.toy) {
      return Response.json({ toy: null, suggestedVoiceId: null });
    }
    return Response.json({
      toy: result.toy as ToyInfo,
      suggestedVoiceId: validateVoiceId(result.suggestedVoiceId, voices),
    });
```

- [ ] **Step 7: Verify**

Run: `npx tsc --noEmit && npm test && npm run lint`
Expected: all clean.

- [ ] **Step 8: Commit**

```bash
git add lib/toy-voice.ts lib/toy-voice.test.ts app/api/voices/route.ts app/api/identify-toy/route.ts
git commit -m "feat: toy voice matching — catalog passthrough and suggestion in identify-toy"
```

---

### Task 8: `/api/design-voice` route (ElevenLabs Voice Design)

**Files:**
- Create: `app/api/design-voice/route.ts`

**Interfaces:**
- Consumes: `buildVoiceDescription` is applied client-side (Task 12/13 send a ready description).
- Produces: `POST /api/design-voice` with body `{ name: string, description: string }` → `{ voiceId: string }` on success, `{ error: string }` with status 4xx/502 otherwise. Two upstream calls: `POST /v1/text-to-voice/design` (returns previews with `generated_voice_id`), then `POST /v1/text-to-voice/create` (saves the voice, returns `voice_id`).

- [ ] **Step 1: Read the Next 16 route-handler doc** (`node_modules/next/dist/docs/` — route handlers guide) and skim `app/api/voices/route.ts` + `app/api/identify-toy/route.ts` for the established shape.

- [ ] **Step 2: Implement `app/api/design-voice/route.ts`:**

```ts
// Generates a custom ElevenLabs voice from a toy's description and saves it to
// the account. Stateless like every other route; explicitly opt-in from the UI
// because it costs credits and consumes an account voice slot. Two upstream
// calls: design (returns previews) then create (persists the first preview).
type DesignRequest = { name?: unknown; description?: unknown };

export async function POST(request: Request) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return Response.json({ error: "ELEVENLABS_API_KEY not set" }, { status: 500 });

  let body: DesignRequest;
  try {
    body = (await request.json()) as DesignRequest;
  } catch {
    return Response.json({ error: "Malformed request body" }, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  if (!name || description.length < 20) {
    return Response.json({ error: "A name and a description of at least 20 characters are required" }, { status: 400 });
  }

  const headers = { "xi-api-key": apiKey, "content-type": "application/json" };

  const designRes = await fetch("https://api.elevenlabs.io/v1/text-to-voice/design", {
    method: "POST",
    headers,
    body: JSON.stringify({ voice_description: description, auto_generate_text: true }),
  });
  if (!designRes.ok) {
    const detail = await designRes.text().catch(() => "");
    return Response.json({ error: `Voice design failed (HTTP ${designRes.status}). ${detail}`.trim() }, { status: 502 });
  }
  const design = (await designRes.json()) as { previews?: { generated_voice_id: string }[] };
  const generatedVoiceId = design.previews?.[0]?.generated_voice_id;
  if (!generatedVoiceId) {
    return Response.json({ error: "Voice design returned no previews" }, { status: 502 });
  }

  const createRes = await fetch("https://api.elevenlabs.io/v1/text-to-voice/create", {
    method: "POST",
    headers,
    body: JSON.stringify({
      voice_name: name,
      voice_description: description,
      generated_voice_id: generatedVoiceId,
    }),
  });
  if (!createRes.ok) {
    // The most common failure here is the account's voice-slot limit — the
    // upstream message says so; pass it through rather than paraphrasing.
    const detail = await createRes.text().catch(() => "");
    return Response.json({ error: `Voice creation failed (HTTP ${createRes.status}). ${detail}`.trim() }, { status: 502 });
  }
  const created = (await createRes.json()) as { voice_id?: string };
  if (!created.voice_id) {
    return Response.json({ error: "Voice creation returned no voice id" }, { status: 502 });
  }
  return Response.json({ voiceId: created.voice_id });
}
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean. (No unit test: this route is a thin proxy, matching the repo's convention of untested route handlers; its pure logic lives in `lib/toy-voice.ts`, already tested.)

- [ ] **Step 4: Commit**

```bash
git add app/api/design-voice/route.ts
git commit -m "feat: design-voice route wrapping ElevenLabs Voice Design"
```

---

### Task 9: `useVoices` hook and reusable `VoicePicker`

**Files:**
- Create: `app/components/useVoices.ts`
- Create: `app/components/VoicePicker.tsx`
- Create: `app/components/VoicePicker.module.css`

**Interfaces:**
- Produces:
  - `Voice = { voiceId: string; name: string; previewUrl: string; labels?: Record<string, string>; description?: string | null }`
  - `VoicesError = { kind: "noVoices" } | { kind: "failed"; detail: string } | null`
  - `useVoices(): { voices: Voice[]; voicesError: VoicesError }` — fetched once at page level, passed down.
  - `<VoicePicker voices voiceId onChange allowAuto autoLabel? />` — the radio list + ▶ preview extracted from ConfigForm, with an optional "Automatic" option (`voiceId === null`).

- [ ] **Step 1: Implement `app/components/useVoices.ts`** (the fetch logic is lifted verbatim from ConfigForm's first effect — see `app/components/ConfigForm.tsx:51-80` — including the error taxonomy):

```ts
"use client";

import { useEffect, useState } from "react";

export type Voice = {
  voiceId: string;
  name: string;
  previewUrl: string;
  labels?: Record<string, string>;
  description?: string | null;
};

export type VoicesError = { kind: "noVoices" } | { kind: "failed"; detail: string } | null;

// One fetch of the account's voice list for the whole flow. A failing
// /api/voices gets a real error (a bad ELEVENLABS_API_KEY is the most likely
// first-run failure), never a silently empty picker.
export function useVoices(): { voices: Voice[]; voicesError: VoicesError } {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voicesError, setVoicesError] = useState<VoicesError>(null);

  useEffect(() => {
    fetch("/api/voices")
      .then(async (r) => {
        const data: { voices?: Voice[]; error?: string } = await r
          .json()
          .catch(() => ({}) as { voices?: Voice[]; error?: string });
        if (!r.ok || !data.voices) {
          throw new Error(data.error ?? `The voices request failed (HTTP ${r.status}).`);
        }
        return data.voices;
      })
      .then((list) => {
        if (list.length === 0) {
          setVoicesError({ kind: "noVoices" });
          return;
        }
        setVoices(list);
      })
      .catch((e: unknown) => {
        setVoices([]);
        setVoicesError({ kind: "failed", detail: e instanceof Error ? e.message : "unknown error" });
      });
  }, []);

  return { voices, voicesError };
}
```

- [ ] **Step 2: Implement `app/components/VoicePicker.tsx`** (radio list + preview, extracted from ConfigForm's voice fieldset — `app/components/ConfigForm.tsx:377-420` — reshaped as a controlled component):

```tsx
"use client";

import { useId, useRef, useState } from "react";
import { useLanguage } from "./LanguageProvider";
import type { Voice } from "./useVoices";
import styles from "./VoicePicker.module.css";

type Props = {
  voices: Voice[];
  voiceId: string | null; // null = automatic (only meaningful with allowAuto)
  onChange: (voiceId: string | null) => void;
  allowAuto?: boolean;
};

// The voice radio list with ▶ preview, shared by the teacher editor and
// anywhere else a voice is chosen. Controlled: selection state lives with the
// caller; this component only renders and previews.
export default function VoicePicker({ voices, voiceId, onChange, allowAuto = false }: Props) {
  const { t } = useLanguage();
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const groupId = useId();

  function togglePreview(v: Voice) {
    const audio = audioRef.current;
    if (!audio) return;
    if (playingVoiceId === v.voiceId) {
      audio.pause();
      setPlayingVoiceId(null);
      return;
    }
    audio.src = v.previewUrl;
    audio.play().catch(() => setPlayingVoiceId(null));
    setPlayingVoiceId(v.voiceId);
  }

  return (
    <div className={styles.voiceList}>
      {voices.length === 0 && <p className={styles.note}>{t.loadingVoices}</p>}
      {allowAuto && voices.length > 0 && (
        <label className={styles.voiceOption}>
          <input
            type="radio"
            name={`${groupId}-voice`}
            checked={voiceId === null}
            onChange={() => onChange(null)}
          />
          <span>{t.autoVoice}</span>
        </label>
      )}
      {voices.map((v) => (
        <div className={styles.voiceRow} key={v.voiceId}>
          <label className={styles.voiceOption}>
            <input
              type="radio"
              name={`${groupId}-voice`}
              value={v.voiceId}
              checked={voiceId === v.voiceId}
              onChange={() => onChange(v.voiceId)}
            />
            <span>{v.name}</span>
          </label>
          <button
            type="button"
            className={styles.playBtn}
            aria-label={playingVoiceId === v.voiceId ? t.stopPreview(v.name) : t.playPreview(v.name)}
            onClick={() => togglePreview(v)}
          >
            {playingVoiceId === v.voiceId ? "❚❚" : "▶"}
          </button>
        </div>
      ))}
      <audio ref={audioRef} onEnded={() => setPlayingVoiceId(null)} hidden />
    </div>
  );
}
```

- [ ] **Step 3: Create `app/components/VoicePicker.module.css`** — copy the `.voiceList`, `.voiceRow`, `.voiceOption`, `.playBtn`, `.note` rules from `ConfigForm.module.css` (keep logical properties as-is).

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add app/components/useVoices.ts app/components/VoicePicker.tsx app/components/VoicePicker.module.css
git commit -m "feat: shared useVoices hook and VoicePicker component"
```

---

### Task 10: KidPicker (new home screen)

**Files:**
- Create: `app/components/KidPicker.tsx`
- Create: `app/components/KidPicker.module.css`

**Interfaces:**
- Consumes: `Kid` type; `t.whoIsLearning`, `t.addKid`, `t.ageShort`, `t.manage`, `t.save`, `t.cancel`, `t.childNameLabel`, `t.childAgeLabel`.
- Produces: `<KidPicker kids onPick onAdd onManage />` where `onAdd(name: string, age: number)` — storage writes stay in `page.tsx`.

- [ ] **Step 1: Implement `app/components/KidPicker.tsx`:**

```tsx
"use client";

import { useId, useState } from "react";
import type { Kid } from "../../lib/types";
import { useLanguage } from "./LanguageProvider";
import styles from "./KidPicker.module.css";

type Props = {
  kids: Kid[];
  onPick: (kid: Kid) => void;
  onAdd: (name: string, age: number) => void;
  onManage: () => void;
};

// The home screen: tap a child to head for the teacher picker, or add one
// inline. Storage stays with the caller — this component only renders.
export default function KidPicker({ kids, onPick, onAdd, onManage }: Props) {
  const { t } = useLanguage();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [age, setAge] = useState(5);
  const formId = useId();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onAdd(name.trim(), age);
    setAdding(false);
    setName("");
    setAge(5);
  }

  return (
    <section className={styles.picker} aria-label={t.whoIsLearning}>
      <h2 className={styles.title}>{t.whoIsLearning}</h2>
      <ul className={styles.cards}>
        {kids.map((kid) => (
          <li key={kid.id}>
            <button type="button" className={styles.card} onClick={() => onPick(kid)}>
              <span className={styles.cardName}>{kid.name}</span>
              <span className={styles.cardSub}>{t.ageShort(kid.age)}</span>
            </button>
          </li>
        ))}
        <li>
          {adding ? (
            <form className={styles.addForm} onSubmit={submit}>
              <label htmlFor={`${formId}-name`}>{t.childNameLabel}</label>
              <input
                id={`${formId}-name`}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
              />
              <label htmlFor={`${formId}-age`}>{t.childAgeLabel}</label>
              <input
                id={`${formId}-age`}
                type="number"
                min={2}
                max={12}
                value={age}
                onChange={(e) => setAge(Number(e.target.value))}
                required
              />
              <div className={styles.addActions}>
                <button type="submit" className={styles.save}>{t.save}</button>
                <button type="button" className={styles.cancel} onClick={() => setAdding(false)}>
                  {t.cancel}
                </button>
              </div>
            </form>
          ) : (
            <button type="button" className={`${styles.card} ${styles.addCard}`} onClick={() => setAdding(true)}>
              <span className={styles.cardName}>＋</span>
              <span className={styles.cardSub}>{t.addKid}</span>
            </button>
          )}
        </li>
      </ul>
      <button type="button" className={styles.manage} onClick={onManage}>
        {t.manage}
      </button>
    </section>
  );
}
```

- [ ] **Step 2: Create `app/components/KidPicker.module.css`** — model the card grid on `ModePicker.module.css` tiles (read it first; reuse its border-radius/spacing scale, logical properties only):

```css
.picker {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.title {
  font-size: 1.25rem;
  margin-block: 0;
}
.cards {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
  gap: 0.75rem;
}
.card {
  inline-size: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.25rem;
  padding: 1rem;
  border: 1px solid var(--border, #ddd);
  border-radius: 0.75rem;
  background: var(--card-bg, #fff);
  cursor: pointer;
  text-align: start;
  font: inherit;
}
.addCard {
  border-style: dashed;
  align-items: center;
}
.cardName {
  font-weight: 600;
  font-size: 1.05rem;
}
.cardSub {
  color: var(--muted, #666);
  font-size: 0.85rem;
}
.addForm {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 1rem;
  border: 1px solid var(--border, #ddd);
  border-radius: 0.75rem;
}
.addForm input {
  font: inherit;
  padding: 0.35rem 0.5rem;
}
.addActions {
  display: flex;
  gap: 0.5rem;
  margin-block-start: 0.35rem;
}
.save,
.cancel,
.manage {
  font: inherit;
  padding: 0.4rem 0.9rem;
  border-radius: 0.5rem;
  border: 1px solid var(--border, #ddd);
  background: var(--card-bg, #fff);
  cursor: pointer;
}
.manage {
  align-self: flex-start;
}
```

(If `ModePicker.module.css` / `ConfigForm.module.css` define shared CSS variables or a different visual scale, match those instead of the fallbacks above.)

- [ ] **Step 3: Verify** — `npx tsc --noEmit && npm run lint` → clean.

- [ ] **Step 4: Commit**

```bash
git add app/components/KidPicker.tsx app/components/KidPicker.module.css
git commit -m "feat: KidPicker home screen"
```

---

### Task 11: TeacherPicker; ToyConfirm mode choice; ToyScan voice catalog

**Files:**
- Create: `app/components/TeacherPicker.tsx`
- Create: `app/components/TeacherPicker.module.css`
- Modify: `app/components/ToyConfirm.tsx` (confirm becomes a mode choice + optional voice generation)
- Modify: `app/components/ToyScan.tsx` (send the voice catalog; hand back `suggestedVoiceId`)

**Interfaces:**
- Consumes: `Teacher`, `ToyInfo`, `ToyMode`, `PresetTeacherId`; `Voice` from Task 9; strings from Task 6; `buildVoiceDescription` from Task 7.
- Produces:
  - `<TeacherPicker presets teachers lastTeacherId pendingToy onPick onScanToy onBack />`
  - `ToyConfirm` props become `{ toy: ToyInfo; onConfirm: (mode: ToyMode, designedVoiceId: string | null) => void; onRetake: () => void }`
  - `ToyScan` props become `{ voices: Voice[]; onIdentified: (toy: ToyInfo, suggestedVoiceId: string | null) => void; onBack: () => void }`

- [ ] **Step 1: Implement `app/components/TeacherPicker.tsx`:**

```tsx
"use client";

import type { Teacher, ToyInfo } from "../../lib/types";
import type { PresetTeacherId } from "../../lib/preset-teachers";
import { useLanguage } from "./LanguageProvider";
import styles from "./TeacherPicker.module.css";

type Props = {
  presets: Teacher[];
  teachers: Teacher[]; // stored: custom + toy
  lastTeacherId: string | null; // from the kid's last-start, for the badge
  pendingToy: ToyInfo | null; // set when "help me play" is choosing a helper
  onPick: (teacher: Teacher) => void;
  onScanToy: () => void;
  onBack: () => void;
};

// One grid of teacher cards: presets, the parent's own, saved toys, and a
// "scan a toy" card. When a third-person toy is pending, toy teachers and the
// scan card hide — the pending toy is the toy; what's being picked is a helper.
export default function TeacherPicker({
  presets,
  teachers,
  lastTeacherId,
  pendingToy,
  onPick,
  onScanToy,
  onBack,
}: Props) {
  const { t } = useLanguage();
  const shown = pendingToy ? [...presets, ...teachers.filter((x) => x.kind === "custom")] : [...presets, ...teachers];

  function subFor(teacher: Teacher): string {
    if (teacher.kind === "preset") {
      return t.presetTeachers[teacher.id.slice("preset:".length) as PresetTeacherId].description;
    }
    if (teacher.kind === "toy") return teacher.toy?.character ?? "";
    return teacher.personality;
  }

  return (
    <section className={styles.picker} aria-label={t.whoWillTeach}>
      <h2 className={styles.title}>{t.whoWillTeach}</h2>
      {pendingToy && <p className={styles.pendingToy}>{t.playingWith(pendingToy.name)}</p>}
      <ul className={styles.cards}>
        {shown.map((teacher) => (
          <li key={teacher.id}>
            <button type="button" className={styles.card} onClick={() => onPick(teacher)}>
              <span className={styles.badges}>
                {teacher.kind === "preset" && <span className={styles.badge}>{t.presetBadge}</span>}
                {teacher.kind === "toy" && <span className={styles.badge}>{t.toyBadge}</span>}
                {teacher.id === lastTeacherId && <span className={styles.badgeLast}>{t.lastTimeBadge}</span>}
              </span>
              <span className={styles.cardName}>{teacher.name}</span>
              <span className={styles.cardSub}>{subFor(teacher)}</span>
            </button>
          </li>
        ))}
        {!pendingToy && (
          <li>
            <button type="button" className={`${styles.card} ${styles.scanCard}`} onClick={onScanToy}>
              <span className={styles.emoji} aria-hidden="true">🧸</span>
              <span className={styles.cardName}>{t.scanToyTitle}</span>
              <span className={styles.cardSub}>{t.scanToySub}</span>
            </button>
          </li>
        )}
      </ul>
      <button type="button" className={styles.back} onClick={onBack}>
        {t.back}
      </button>
    </section>
  );
}
```

- [ ] **Step 2: Create `app/components/TeacherPicker.module.css`** — same card grid as KidPicker plus:

```css
.badges {
  display: flex;
  gap: 0.35rem;
  min-block-size: 1.1rem;
}
.badge,
.badgeLast {
  font-size: 0.7rem;
  padding: 0.05rem 0.45rem;
  border-radius: 1rem;
  border: 1px solid var(--border, #ddd);
}
.badgeLast {
  font-weight: 600;
}
.pendingToy {
  margin-block: 0;
  font-size: 0.9rem;
  color: var(--muted, #666);
}
.scanCard {
  border-style: dashed;
}
.emoji {
  font-size: 1.5rem;
}
.cardSub {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
```

(plus `.picker`, `.title`, `.cards`, `.card`, `.cardName` copied from KidPicker's scale, and a `.back` button styled like KidPicker's `.manage`.)

- [ ] **Step 3: Rework `ToyConfirm`** — replace the single "Use this toy" button with the mode question (moved here from the old ConfigForm) and an opt-in voice-generation button:

```tsx
"use client";

import { useState } from "react";
import type { ToyInfo, ToyMode } from "../../lib/types";
import { buildVoiceDescription } from "../../lib/toy-voice";
import { useLanguage } from "./LanguageProvider";
import styles from "./ToyConfirm.module.css";

type Props = {
  toy: ToyInfo;
  onConfirm: (mode: ToyMode, designedVoiceId: string | null) => void;
  onRetake: () => void;
};

// Show what the vision model saw, let the parent choose HOW the toy plays
// (the old ConfigForm toyMode radio, now the confirm action itself), and
// optionally generate a bespoke ElevenLabs voice for it. Voice generation is
// explicit — it costs credits and an account voice slot — and non-fatal: on
// failure the best-match suggestion from identify-toy still applies.
export default function ToyConfirm({ toy, onConfirm, onRetake }: Props) {
  const { t } = useLanguage();
  const [designedVoiceId, setDesignedVoiceId] = useState<string | null>(null);
  const [voiceState, setVoiceState] = useState<"idle" | "working" | "done">("idle");
  const [voiceError, setVoiceError] = useState<string | null>(null);

  async function generateVoice() {
    setVoiceError(null);
    setVoiceState("working");
    try {
      const res = await fetch("/api/design-voice", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: toy.name, description: buildVoiceDescription(toy) }),
      });
      const payload: { voiceId?: string; error?: string } = await res
        .json()
        .catch(() => ({}) as { voiceId?: string; error?: string });
      if (!res.ok || !payload.voiceId) throw new Error(payload.error ?? `HTTP ${res.status}`);
      setDesignedVoiceId(payload.voiceId);
      setVoiceState("done");
    } catch (e) {
      setVoiceError(t.voiceGenerateFailed(e instanceof Error ? e.message : "unknown error"));
      setVoiceState("idle");
    }
  }

  return (
    <section className={styles.confirm} aria-label={t.confirmToy}>
      <span className={styles.emoji} aria-hidden="true">🧸</span>
      <h2 className={styles.name}>{toy.name}</h2>
      <p className={styles.character}>{toy.character}</p>
      <dl className={styles.detail}>
        <dt>{t.personalityLabel}</dt>
        <dd>{toy.personality}</dd>
        <dt>{t.howYoullPlay}</dt>
        <dd>{toy.howToPlay}</dd>
      </dl>

      <div className={styles.voiceBlock}>
        {voiceState === "done" ? (
          <p role="status" className={styles.voiceDone}>{t.voiceGenerated}</p>
        ) : (
          <button
            type="button"
            className={styles.generate}
            onClick={generateVoice}
            disabled={voiceState === "working"}
          >
            {voiceState === "working" ? t.generatingVoice : t.generateVoice}
          </button>
        )}
        {voiceError && <p role="alert" className={styles.voiceError}>{voiceError}</p>}
      </div>

      <p className={styles.modeQuestion}>{t.howShouldToyPlay(toy.name)}</p>
      <button type="button" className={styles.use} onClick={() => onConfirm("pov", designedVoiceId)}>
        <strong>{t.beTheToyTitle}</strong> — {t.beTheToyDesc(toy.name)}
      </button>
      <button type="button" className={styles.use} onClick={() => onConfirm("third-person", designedVoiceId)}>
        <strong>{t.helpMePlayTitle}</strong> — {t.helpMePlayDesc(toy.name)}
      </button>
      <button type="button" className={styles.retake} onClick={onRetake}>
        {t.retakePhoto}
      </button>
    </section>
  );
}
```

Add to `ToyConfirm.module.css`: `.voiceBlock`, `.voiceDone`, `.voiceError`, `.generate`, `.modeQuestion` (small, consistent with existing rules; `.use` already exists and now applies to both mode buttons — check it tolerates two stacked buttons).

- [ ] **Step 4: Extend `ToyScan`** — new props and payload:

```tsx
import type { Voice } from "./useVoices";

type Props = {
  voices: Voice[];
  onIdentified: (toy: ToyInfo, suggestedVoiceId: string | null) => void;
  onBack: () => void;
};
```

In `onFile`, include the catalog in the request body and pass the suggestion through:

```tsx
      const res = await fetch("/api/identify-toy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          image: data,
          mediaType,
          voices: voices.map((v) => ({
            voiceId: v.voiceId,
            name: v.name,
            labels: v.labels,
            description: v.description,
          })),
        }),
      });
      const payload: { toy?: ToyInfo | null; suggestedVoiceId?: string | null; error?: string } = await res
        .json()
        .catch(() => ({}) as { toy?: ToyInfo | null; suggestedVoiceId?: string | null; error?: string });
```

and at the success exit: `onIdentified(payload.toy, payload.suggestedVoiceId ?? null);`

- [ ] **Step 5: Verify** — `npx tsc --noEmit` will FAIL in `app/page.tsx` (ToyScan/ToyConfirm prop changes). That is expected until Task 13 rewires the page; run lint on the touched files only and move on:

Run: `npx eslint app/components/TeacherPicker.tsx app/components/ToyConfirm.tsx app/components/ToyScan.tsx`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add app/components/TeacherPicker.tsx app/components/TeacherPicker.module.css app/components/ToyConfirm.tsx app/components/ToyConfirm.module.css app/components/ToyScan.tsx
git commit -m "feat: TeacherPicker; toy mode choice and voice generation on ToyConfirm"
```

---

### Task 12: StartSheet

**Files:**
- Create: `app/components/StartSheet.tsx`
- Create: `app/components/StartSheet.module.css`

**Interfaces:**
- Consumes: `resolveVoiceSelection` (`lib/voice-selection.ts`), `loadLastStart`, `saveLastStart` (Task 2), `Kid`/`Teacher`/`SessionConfig`/`ToyInfo`/`ToyMode` types, `useLanguage`, `Voice`/`VoicesError` (Task 9), strings from Task 6.
- Produces: `<StartSheet kid teacher pendingToy voices voicesError onStart onBack />`; `onStart(config: SessionConfig)` receives a complete config; the component persists the kid's `last-start` before calling it.

- [ ] **Step 1: Implement `app/components/StartSheet.tsx`:**

```tsx
"use client";

import { useId, useState } from "react";
import type { Kid, SessionConfig, Teacher, ToyInfo } from "../../lib/types";
import { loadLastStart, saveLastStart } from "../../lib/browser-storage";
import { resolveVoiceSelection } from "../../lib/voice-selection";
import { useLanguage } from "./LanguageProvider";
import type { Voice, VoicesError } from "./useVoices";
import styles from "./StartSheet.module.css";

const MINUTE_CHIPS = [5, 10, 15, 20];

type Props = {
  kid: Kid;
  teacher: Teacher;
  pendingToy: ToyInfo | null; // third-person toy riding along, or null
  voices: Voice[];
  voicesError: VoicesError;
  onStart: (config: SessionConfig) => void;
  onBack: () => void;
};

// The last screen before a session: everything pre-filled from this kid's
// previous session, so a repeat is kid → teacher → Start. Voice resolution is
// DERIVED every render (see lib/voice-selection.ts for the timing bug that
// rule exists to prevent): the teacher's saved voiceId is validated only once
// the real list has landed, and any substitution is announced, never silent.
export default function StartSheet({ kid, teacher, pendingToy, voices, voicesError, onStart, onBack }: Props) {
  const { language, t } = useLanguage();
  const [last] = useState(() => loadLastStart(kid.id));
  const [goal, setGoal] = useState(last?.goal ?? "");
  const [directives, setDirectives] = useState(last?.directives ?? "");
  const [minutes, setMinutes] = useState(last?.minutes ?? 10);
  const formId = useId();

  const voiceChoice = resolveVoiceSelection(teacher.voiceId ?? "", voices);
  const voiceId =
    voiceChoice.kind === "select" || voiceChoice.kind === "substitute"
      ? voiceChoice.voiceId
      : (teacher.voiceId ?? "");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const isPovToy = teacher.kind === "toy";
    const config: SessionConfig = {
      agentName: teacher.name,
      voiceId,
      childName: kid.name,
      childAge: kid.age,
      language,
      goal,
      directives,
      minutes,
      kidId: kid.id,
      teacherId: teacher.id,
      ...(isPovToy
        ? { toy: teacher.toy, toyMode: "pov" as const }
        : pendingToy
          ? {
              toy: pendingToy,
              toyMode: "third-person" as const,
              ...(teacher.personality ? { teacherPersonality: teacher.personality } : {}),
            }
          : teacher.personality
            ? { teacherPersonality: teacher.personality }
            : {}),
    };
    try {
      saveLastStart(kid.id, { teacherId: teacher.id, goal, directives, minutes });
    } catch {
      // The prefill is a convenience; losing it must not block the session.
    }
    onStart(config);
  }

  return (
    <form onSubmit={submit} className={styles.sheet} aria-label={t.todaysSession}>
      <button type="button" className={styles.selection} onClick={onBack}>
        <span className={styles.selectionNames}>
          {kid.name} · {teacher.name}
          {pendingToy ? ` · 🧸 ${pendingToy.name}` : ""}
        </span>
        <span className={styles.selectionChange}>{t.changeSelection}</span>
      </button>

      {voicesError && (
        <p role="alert" className={styles.error}>
          {voicesError.kind === "noVoices" ? t.noVoices : t.voicesFailed(voicesError.detail)}
        </p>
      )}
      {voiceChoice.kind === "substitute" && (
        <p role="status" className={styles.voiceNote}>
          {t.voiceSubstituted(voiceChoice.name)}
        </p>
      )}

      <div className={styles.field}>
        <span className={styles.label}>{t.durationLabel}</span>
        <div className={styles.chips} role="radiogroup" aria-label={t.durationLabel}>
          {MINUTE_CHIPS.map((m) => (
            <button
              key={m}
              type="button"
              className={minutes === m ? `${styles.chip} ${styles.chipOn}` : styles.chip}
              aria-pressed={minutes === m}
              onClick={() => setMinutes(m)}
            >
              {t.minutesShort(m)}
            </button>
          ))}
          <input
            aria-label={t.sessionLength}
            className={styles.minutesInput}
            type="number"
            min={3}
            max={30}
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
            required
          />
        </div>
      </div>

      <div className={styles.field}>
        <label htmlFor={`${formId}-goal`}>{t.goalLabel}</label>
        <input
          id={`${formId}-goal`}
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder={t.goalPlaceholder}
          required
        />
      </div>

      <div className={styles.field}>
        <label htmlFor={`${formId}-directives`}>{t.extraLabel}</label>
        <textarea
          id={`${formId}-directives`}
          value={directives}
          onChange={(e) => setDirectives(e.target.value)}
          placeholder={t.extraPlaceholder}
          rows={3}
        />
      </div>

      {/* Same gate as the old form: Start means "a real, existing voice is
          selected", so it waits for the voices list. */}
      <div className={styles.startBar}>
        <button type="submit" className={styles.start} disabled={!voiceId || voices.length === 0}>
          {t.startSession}
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Create `app/components/StartSheet.module.css`** — reuse `ConfigForm.module.css`'s `.startBar`/`.start`/`.error`/`.voiceNote`/`.field` rules (copy them; ConfigForm is deleted in Task 14), plus:

```css
.sheet {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.selection {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border: 1px solid var(--border, #ddd);
  border-radius: 0.75rem;
  background: var(--card-bg, #fff);
  font: inherit;
  cursor: pointer;
}
.selectionNames {
  font-weight: 600;
}
.selectionChange {
  color: var(--muted, #666);
  font-size: 0.85rem;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}
.chip {
  font: inherit;
  padding: 0.35rem 0.85rem;
  border-radius: 1.25rem;
  border: 1px solid var(--border, #ddd);
  background: var(--card-bg, #fff);
  cursor: pointer;
}
.chipOn {
  font-weight: 700;
  border-width: 2px;
}
.minutesInput {
  inline-size: 4.5rem;
  font: inherit;
  padding: 0.3rem 0.5rem;
}
.label {
  font-size: 0.9rem;
}
```

- [ ] **Step 3: Verify** — `npx eslint app/components/StartSheet.tsx` → clean.

- [ ] **Step 4: Commit**

```bash
git add app/components/StartSheet.tsx app/components/StartSheet.module.css
git commit -m "feat: StartSheet with per-kid prefill"
```

---

### Task 13: ManageView; page.tsx rewiring; migration on mount

**Files:**
- Create: `app/components/ManageView.tsx`
- Create: `app/components/ManageView.module.css`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: everything above.
- Produces: the full working flow. `ManageView` props: `{ kids, teachers, presets, voices, voicesError, onChanged: () => void, onBack: () => void }` — it writes to storage directly and calls `onChanged()` so the page re-lists.

- [ ] **Step 1: Implement `app/components/ManageView.tsx`:**

```tsx
"use client";

import { useId, useState } from "react";
import type { Kid, Teacher } from "../../lib/types";
import { deleteKid, deleteTeacher, saveKid, saveTeacher } from "../../lib/browser-storage";
import { buildVoiceDescription } from "../../lib/toy-voice";
import { useLanguage } from "./LanguageProvider";
import VoicePicker from "./VoicePicker";
import type { Voice, VoicesError } from "./useVoices";
import styles from "./ManageView.module.css";

type Props = {
  kids: Kid[];
  teachers: Teacher[]; // stored only
  presets: Teacher[];
  voices: Voice[];
  voicesError: VoicesError;
  onChanged: () => void;
  onBack: () => void;
};

type Editing =
  | { kind: "kid"; kid: Kid }
  | { kind: "teacher"; teacher: Teacher; isNew: boolean }
  | null;

// Two-tab management: Children and Teachers. Edits are inline; deletes are
// two-tap (first tap arms, second confirms). Presets are immutable — their
// only action is "Duplicate & edit", which forks a custom copy. Toy teachers
// additionally offer bespoke voice generation.
export default function ManageView({ kids, teachers, presets, voices, voicesError, onChanged, onBack }: Props) {
  const { t } = useLanguage();
  const [tab, setTab] = useState<"kids" | "teachers">("kids");
  const [editing, setEditing] = useState<Editing>(null);
  const [armedDelete, setArmedDelete] = useState<string | null>(null);
  const [voiceGen, setVoiceGen] = useState<{ id: string; state: "working" | "done" } | { id: string; state: "error"; detail: string } | null>(null);
  const formId = useId();

  function confirmDelete(id: string, doDelete: () => void) {
    if (armedDelete === id) {
      doDelete();
      setArmedDelete(null);
      onChanged();
    } else {
      setArmedDelete(id);
    }
  }

  async function generateVoiceFor(teacher: Teacher) {
    if (!teacher.toy) return;
    setVoiceGen({ id: teacher.id, state: "working" });
    try {
      const res = await fetch("/api/design-voice", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: teacher.toy.name, description: buildVoiceDescription(teacher.toy) }),
      });
      const payload: { voiceId?: string; error?: string } = await res
        .json()
        .catch(() => ({}) as { voiceId?: string; error?: string });
      if (!res.ok || !payload.voiceId) throw new Error(payload.error ?? `HTTP ${res.status}`);
      saveTeacher({ ...teacher, voiceId: payload.voiceId });
      setVoiceGen({ id: teacher.id, state: "done" });
      onChanged();
    } catch (e) {
      setVoiceGen({ id: teacher.id, state: "error", detail: e instanceof Error ? e.message : "unknown error" });
    }
  }

  if (editing?.kind === "kid") {
    const kid = editing.kid;
    return (
      <form
        className={styles.editor}
        onSubmit={(e) => {
          e.preventDefault();
          try {
            saveKid(kid);
          } catch {
            // Storage failures surface as the entry simply not changing.
          }
          setEditing(null);
          onChanged();
        }}
      >
        <label htmlFor={`${formId}-kname`}>{t.childNameLabel}</label>
        <input
          id={`${formId}-kname`}
          value={kid.name}
          onChange={(e) => setEditing({ kind: "kid", kid: { ...kid, name: e.target.value } })}
          required
        />
        <label htmlFor={`${formId}-kage`}>{t.childAgeLabel}</label>
        <input
          id={`${formId}-kage`}
          type="number"
          min={2}
          max={12}
          value={kid.age}
          onChange={(e) => setEditing({ kind: "kid", kid: { ...kid, age: Number(e.target.value) } })}
          required
        />
        <div className={styles.editorActions}>
          <button type="submit" className={styles.save}>{t.save}</button>
          <button type="button" className={styles.cancel} onClick={() => setEditing(null)}>{t.cancel}</button>
        </div>
      </form>
    );
  }

  if (editing?.kind === "teacher") {
    const teacher = editing.teacher;
    return (
      <form
        className={styles.editor}
        onSubmit={(e) => {
          e.preventDefault();
          try {
            saveTeacher(teacher);
          } catch {
            // Same degrade as kid saves.
          }
          setEditing(null);
          onChanged();
        }}
      >
        <label htmlFor={`${formId}-tname`}>{t.teacherNameLabel}</label>
        <input
          id={`${formId}-tname`}
          value={teacher.name}
          onChange={(e) => setEditing({ ...editing, teacher: { ...teacher, name: e.target.value } })}
          required
        />
        <label htmlFor={`${formId}-tpers`}>{t.personalityFieldLabel}</label>
        <textarea
          id={`${formId}-tpers`}
          value={teacher.personality}
          onChange={(e) => setEditing({ ...editing, teacher: { ...teacher, personality: e.target.value } })}
          placeholder={t.personalityPlaceholder}
          rows={3}
        />
        {voicesError && (
          <p role="alert" className={styles.error}>
            {voicesError.kind === "noVoices" ? t.noVoices : t.voicesFailed(voicesError.detail)}
          </p>
        )}
        <VoicePicker
          voices={voices}
          voiceId={teacher.voiceId}
          onChange={(voiceId) => setEditing({ ...editing, teacher: { ...teacher, voiceId } })}
          allowAuto
        />
        <div className={styles.editorActions}>
          <button type="submit" className={styles.save}>{t.save}</button>
          <button type="button" className={styles.cancel} onClick={() => setEditing(null)}>{t.cancel}</button>
        </div>
      </form>
    );
  }

  return (
    <section className={styles.manage} aria-label={t.manage}>
      <div className={styles.tabs} role="tablist">
        <button type="button" role="tab" aria-selected={tab === "kids"} className={tab === "kids" ? styles.tabOn : styles.tab} onClick={() => setTab("kids")}>
          {t.kidsTab}
        </button>
        <button type="button" role="tab" aria-selected={tab === "teachers"} className={tab === "teachers" ? styles.tabOn : styles.tab} onClick={() => setTab("teachers")}>
          {t.teachersTab}
        </button>
      </div>

      {tab === "kids" && (
        <ul className={styles.rows}>
          {kids.length === 0 && <li className={styles.empty}>{t.nothingHereYet}</li>}
          {kids.map((kid) => (
            <li key={kid.id} className={styles.row}>
              <span className={styles.rowName}>
                {kid.name} <span className={styles.rowSub}>{t.ageShort(kid.age)}</span>
              </span>
              <span className={styles.rowActions}>
                <button type="button" className={styles.action} onClick={() => setEditing({ kind: "kid", kid })}>
                  {t.edit}
                </button>
                <button type="button" className={styles.danger} onClick={() => confirmDelete(kid.id, () => deleteKid(kid.id))}>
                  {armedDelete === kid.id ? t.confirmDelete : t.deleteAction}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {tab === "teachers" && (
        <>
          <ul className={styles.rows}>
            {presets.map((teacher) => (
              <li key={teacher.id} className={styles.row}>
                <span className={styles.rowName}>
                  {teacher.name} <span className={styles.rowSub}>{t.presetBadge}</span>
                </span>
                <span className={styles.rowActions}>
                  <button
                    type="button"
                    className={styles.action}
                    onClick={() =>
                      setEditing({
                        kind: "teacher",
                        isNew: true,
                        teacher: {
                          ...teacher,
                          id: crypto.randomUUID(),
                          kind: "custom",
                          createdAt: new Date().toISOString(),
                        },
                      })
                    }
                  >
                    {t.duplicateAndEdit}
                  </button>
                </span>
              </li>
            ))}
            {teachers.map((teacher) => (
              <li key={teacher.id} className={styles.row}>
                <span className={styles.rowName}>
                  {teacher.name}{" "}
                  {teacher.kind === "toy" && <span className={styles.rowSub}>{t.toyBadge}</span>}
                </span>
                <span className={styles.rowActions}>
                  {teacher.kind === "toy" &&
                    (voiceGen?.id === teacher.id && voiceGen.state === "done" ? (
                      <span role="status" className={styles.rowSub}>{t.voiceGenerated}</span>
                    ) : (
                      <button
                        type="button"
                        className={styles.action}
                        disabled={voiceGen?.id === teacher.id && voiceGen.state === "working"}
                        onClick={() => generateVoiceFor(teacher)}
                      >
                        {voiceGen?.id === teacher.id && voiceGen.state === "working" ? t.generatingVoice : t.generateVoice}
                      </button>
                    ))}
                  <button type="button" className={styles.action} onClick={() => setEditing({ kind: "teacher", teacher, isNew: false })}>
                    {t.edit}
                  </button>
                  <button type="button" className={styles.danger} onClick={() => confirmDelete(teacher.id, () => deleteTeacher(teacher.id))}>
                    {armedDelete === teacher.id ? t.confirmDelete : t.deleteAction}
                  </button>
                </span>
              </li>
            ))}
          </ul>
          {voiceGen?.state === "error" && (
            <p role="alert" className={styles.error}>{t.voiceGenerateFailed(voiceGen.detail)}</p>
          )}
          <button
            type="button"
            className={styles.action}
            onClick={() =>
              setEditing({
                kind: "teacher",
                isNew: true,
                teacher: {
                  id: crypto.randomUUID(),
                  kind: "custom",
                  name: "",
                  voiceId: null,
                  personality: "",
                  createdAt: new Date().toISOString(),
                },
              })
            }
          >
            {t.newTeacher}
          </button>
        </>
      )}

      <button type="button" className={styles.back} onClick={onBack}>
        {t.back}
      </button>
    </section>
  );
}
```

- [ ] **Step 2: Create `app/components/ManageView.module.css`:**

```css
.manage,
.editor {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.tabs {
  display: flex;
  gap: 0.5rem;
}
.tab,
.tabOn {
  font: inherit;
  padding: 0.4rem 1rem;
  border-radius: 0.5rem;
  border: 1px solid var(--border, #ddd);
  background: var(--card-bg, #fff);
  cursor: pointer;
}
.tabOn {
  font-weight: 700;
  border-width: 2px;
}
.rows {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  padding: 0.6rem 0.85rem;
  border: 1px solid var(--border, #ddd);
  border-radius: 0.6rem;
}
.rowName {
  font-weight: 600;
}
.rowSub {
  font-weight: 400;
  color: var(--muted, #666);
  font-size: 0.85rem;
}
.rowActions {
  display: flex;
  gap: 0.4rem;
  align-items: center;
  flex-wrap: wrap;
}
.action,
.danger,
.save,
.cancel,
.back {
  font: inherit;
  padding: 0.3rem 0.75rem;
  border-radius: 0.5rem;
  border: 1px solid var(--border, #ddd);
  background: var(--card-bg, #fff);
  cursor: pointer;
}
.danger {
  color: #b3261e;
}
.empty {
  color: var(--muted, #666);
}
.error {
  color: #b3261e;
}
.editor label {
  font-size: 0.9rem;
}
.editor input,
.editor textarea {
  font: inherit;
  padding: 0.4rem 0.6rem;
}
.editorActions {
  display: flex;
  gap: 0.5rem;
}
.back {
  align-self: flex-start;
}
```

- [ ] **Step 3: Rewrite `app/page.tsx`:**

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import EndView from "./components/EndView";
import Header from "./components/Header";
import KidPicker from "./components/KidPicker";
import ManageView from "./components/ManageView";
import SessionView from "./components/SessionView";
import StartSheet from "./components/StartSheet";
import TeacherPicker from "./components/TeacherPicker";
import ToyConfirm from "./components/ToyConfirm";
import ToyScan from "./components/ToyScan";
import { useLanguage } from "./components/LanguageProvider";
import { useVoices } from "./components/useVoices";
import {
  listKids,
  listTeachers,
  loadLastStart,
  migrateProfilesToKids,
  saveKid,
  upsertToyTeacher,
} from "../lib/browser-storage";
import { PRESET_TEACHER_IDS, makePresetTeacher } from "../lib/preset-teachers";
import type { Kid, SavedSession, SessionConfig, Teacher, ToyInfo } from "../lib/types";
import styles from "./app.module.css";

type Finished = Omit<SavedSession, "summary">;

// Pre-session navigation, kid-first. Once `config` is set we hand off to
// SessionView, and once `finished` is set, to EndView — both unchanged.
type Stage =
  | { name: "home" }
  | { name: "pickTeacher"; kid: Kid; pendingToy: ToyInfo | null }
  | { name: "toyScan"; kid: Kid }
  | { name: "toyConfirm"; kid: Kid; toy: ToyInfo; suggestedVoiceId: string | null }
  | { name: "startSheet"; kid: Kid; teacher: Teacher; pendingToy: ToyInfo | null }
  | { name: "manage" };

export default function Page() {
  const { t } = useLanguage();
  const [config, setConfig] = useState<SessionConfig | null>(null);
  const [finished, setFinished] = useState<Finished | null>(null);
  const [stage, setStage] = useState<Stage>({ name: "home" });
  const [kids, setKids] = useState<Kid[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const { voices, voicesError } = useVoices();

  const presets = useMemo(
    () => PRESET_TEACHER_IDS.map((id) => makePresetTeacher(id, t.presetTeachers[id].name)),
    [t],
  );

  // Client-only reads in a one-shot effect, like ConfigForm's old profile
  // read: localStorage does not exist during the server render. Migration
  // failures leave the legacy profiles intact — the app then simply starts
  // with an empty kid list, same as a blocked store.
  useEffect(() => {
    try {
      migrateProfilesToKids();
    } catch {
      // Blocked storage: nothing to migrate anyway.
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setKids(listKids());
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTeachers(listTeachers());
  }, []);

  const refresh = () => {
    setKids(listKids());
    setTeachers(listTeachers());
  };

  const reset = () => {
    setFinished(null);
    setConfig(null);
    setStage({ name: "home" });
    refresh();
  };

  let body: React.ReactNode;
  if (finished) {
    body = <EndView session={finished} onFinish={reset} />;
  } else if (config) {
    body = <SessionView config={config} onDone={setFinished} />;
  } else if (stage.name === "home") {
    body = (
      <KidPicker
        kids={kids}
        onPick={(kid) => setStage({ name: "pickTeacher", kid, pendingToy: null })}
        onAdd={(name, age) => {
          const kid: Kid = { id: crypto.randomUUID(), name, age, createdAt: new Date().toISOString() };
          try {
            saveKid(kid);
          } catch {
            // Blocked storage: the kid exists for this sitting only.
          }
          refresh();
          setStage({ name: "pickTeacher", kid, pendingToy: null });
        }}
        onManage={() => setStage({ name: "manage" })}
      />
    );
  } else if (stage.name === "pickTeacher") {
    const { kid, pendingToy } = stage;
    body = (
      <TeacherPicker
        presets={presets}
        teachers={teachers}
        lastTeacherId={loadLastStart(kid.id)?.teacherId ?? null}
        pendingToy={pendingToy}
        onPick={(teacher) => setStage({ name: "startSheet", kid, teacher, pendingToy })}
        onScanToy={() => setStage({ name: "toyScan", kid })}
        onBack={() => setStage({ name: "home" })}
      />
    );
  } else if (stage.name === "toyScan") {
    const { kid } = stage;
    body = (
      <ToyScan
        voices={voices}
        onIdentified={(toy, suggestedVoiceId) => setStage({ name: "toyConfirm", kid, toy, suggestedVoiceId })}
        onBack={() => setStage({ name: "pickTeacher", kid, pendingToy: null })}
      />
    );
  } else if (stage.name === "toyConfirm") {
    const { kid, toy, suggestedVoiceId } = stage;
    body = (
      <ToyConfirm
        toy={toy}
        onConfirm={(mode, designedVoiceId) => {
          if (mode === "pov") {
            // The toy becomes (or updates) a reusable toy teacher. A designed
            // voice beats the catalog suggestion.
            let teacher: Teacher;
            try {
              teacher = upsertToyTeacher(toy, designedVoiceId ?? suggestedVoiceId);
            } catch {
              // Blocked storage: play with an unsaved, one-off toy teacher.
              teacher = {
                id: "toy:ephemeral",
                kind: "toy",
                name: toy.name,
                voiceId: designedVoiceId ?? suggestedVoiceId,
                personality: toy.personality,
                toy,
                createdAt: new Date().toISOString(),
              };
            }
            refresh();
            setStage({ name: "startSheet", kid, teacher, pendingToy: null });
          } else {
            setStage({ name: "pickTeacher", kid, pendingToy: toy });
          }
        }}
        onRetake={() => setStage({ name: "toyScan", kid })}
      />
    );
  } else if (stage.name === "startSheet") {
    body = (
      <StartSheet
        kid={stage.kid}
        teacher={stage.teacher}
        pendingToy={stage.pendingToy}
        voices={voices}
        voicesError={voicesError}
        onStart={setConfig}
        onBack={() => setStage({ name: "pickTeacher", kid: stage.kid, pendingToy: stage.pendingToy })}
      />
    );
  } else {
    body = (
      <ManageView
        kids={kids}
        teachers={teachers}
        presets={presets}
        voices={voices}
        voicesError={voicesError}
        onChanged={refresh}
        onBack={() => setStage({ name: "home" })}
      />
    );
  }

  return (
    <main className={styles.shell}>
      <div className={styles.inner}>
        <Header />
        {body}
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm test && npm run lint`
Expected: all clean — the ToyScan/ToyConfirm prop changes from Task 11 are now consumed.

- [ ] **Step 5: Manual smoke test**

Run: `npm run dev`, open the app, and walk: add kid → pick preset → start sheet prefill/edit → (don't start a live session unless keys are set) → back → Manage → new teacher with voice → delete flows → scan-a-toy path if a photo is handy. Verify RTL by switching to עברית.

- [ ] **Step 6: Commit**

```bash
git add app/components/ManageView.tsx app/components/ManageView.module.css app/page.tsx
git commit -m "feat: kid-first quick-start flow with management screen"
```

---

### Task 14: Delete dead code and strings; full verification

**Files:**
- Delete: `app/components/ModePicker.tsx`, `app/components/ModePicker.module.css`, `app/components/ConfigForm.tsx`, `app/components/ConfigForm.module.css`
- Modify: `lib/i18n.ts` (remove now-unreferenced keys from `UIStrings` and all 7 language objects)
- Modify: `lib/browser-storage.ts` / `lib/browser-storage.test.ts` (only if lint flags now-unused exports — `saveProfile`/`loadProfile`/`listProfiles` are still needed by the migration; keep them)

- [ ] **Step 1: Delete the dead components**

```bash
git rm app/components/ModePicker.tsx app/components/ModePicker.module.css app/components/ConfigForm.tsx app/components/ConfigForm.module.css
```

- [ ] **Step 2: Prune dead `UIStrings` keys** — remove from the type AND all 7 language objects. Confirm each key really has no remaining consumer (`grep -rn "t\.<key>" app lib`) before removing. Expected dead list: `chooseMode`, `lessonTitle`, `lessonSub`, `toyTitle`, `toySub`, `savedChildren`, `pickUp`, `who`, `what`, `how`, `purposeLabel`, `purposePlaceholder`, `agentNameLabel`, `helperNameLabel`, `voiceLegend`, `profileFilled`, `profileMatches`, `povIntro`, `interactionMode`, `fieldNames` (existed solely for `profileFilled`). Keep everything the new components use: `childNameLabel`, `childAgeLabel`, `goalLabel`, `goalPlaceholder`, `extraLabel`, `extraPlaceholder`, `loadingVoices`, `sessionLength`, `startSession`, `noVoices`, `voicesFailed`, `voiceSubstituted`, `playPreview`, `stopPreview`, `howShouldToyPlay`, `beTheToyTitle`, `beTheToyDesc`, `helpMePlayTitle`, `helpMePlayDesc`, `back`, and all ToyScan/ToyConfirm/Session/End/Summary/Unlock strings.

- [ ] **Step 3: Fix any fallout** — `lib/i18n.test.ts` may reference removed keys (e.g. `fieldNames`); update those tests to exercise surviving keys instead.

- [ ] **Step 4: Full verification**

Run: `npm test && npm run lint && npx tsc --noEmit && npm run build`
Expected: all PASS/clean.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove ModePicker/ConfigForm and dead UI strings"
```

---

## Coverage check (spec → task)

| Spec section | Task |
|---|---|
| Data model (Kid/Teacher/LastStart, SessionConfig refs) | 1 |
| Storage CRUD | 2 |
| Migration (idempotent, marker-last) | 3 |
| Presets (3, immutable, no voiceId, localized names) | 4, 6 |
| Prompt integration (persona block, canary untouched) | 5 |
| i18n (compile-enforced 7 languages) | 6, 14 |
| Toy voice auto-match (catalog → suggestedVoiceId, validated) | 7 |
| Voice Design opt-in (route + ToyConfirm + ManageView buttons, non-fatal) | 8, 11, 13 |
| Kid picker home (+ inline add, Manage affordance) | 10, 13 |
| Teacher picker (presets/custom/toy/scan; toyMode moved to ToyConfirm; third-person rides along) | 11, 13 |
| Start sheet (prefill, chips, voice resolution, 3-tap repeat) | 12 |
| Management (tabs, inline edit, two-tap delete, duplicate-on-edit) | 13 |
| Old flow removal | 14 |
