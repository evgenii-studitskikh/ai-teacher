# Global Language Setting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One global language setting (picker in the header) that controls both the teaching language and the entire UI, in 7 languages (en/ru/es/de/he/tl/uk), with RTL for Hebrew.

**Architecture:** A typed dictionary (`Record<Language, UIStrings>`) in `lib/i18n.ts` — missing translations are compile errors, the same pattern `lib/prompt.ts` uses for greetings. A `LanguageProvider` React context owns the value (persisted to `localStorage["ai-teacher:language"]`), mirrors it onto `<html lang dir>`, and exposes `t` (the current dictionary). The per-child profile's stored `language` is neutralized; the global value is injected into `SessionConfig` at submit.

**Tech Stack:** Next.js App Router (this repo's version — see constraint below), React context, vitest, CSS modules. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-16-global-language-setting-design.md`

## Global Constraints

- **This is NOT the Next.js you know** (AGENTS.md): before modifying anything under `app/`, read the relevant guide in `node_modules/next/dist/docs/` (start with `01-app`). Heed deprecation notices.
- No new npm dependencies.
- Every user-visible string moves to the dictionary — no hardcoded English left in components.
- Greeting constraints (from `lib/prompt.ts`): every greeting MUST contain both the child's and the agent's names (the override canary depends on it) and MUST NOT assume the child's sex.
- No gendered pronouns in any text we generate about the child (existing test enforces it for prompts; UI translations must honor it too — address the child by name).
- Names pass through untranslated: a child called "Mia" is Mia in every language.
- Verification commands: `npm test` (vitest), `npm run lint` (eslint), `npx tsc --noEmit` (type check).
- Commit after every task with the trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

### Task 1: Grow the `Language` union to 7 and add the three greetings

**Files:**
- Modify: `lib/types.ts:1-7`
- Modify: `lib/prompt.ts:28-45`
- Test: `lib/prompt.test.ts`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `LANGUAGE_CODES: readonly ["en","ru","es","de","he","tl","uk"]`, `type Language = (typeof LANGUAGE_CODES)[number]`, and `isLanguage(value: unknown): value is Language` — all exported from `lib/types.ts`. Later tasks import all three. `lib/prompt.ts` keeps exporting `languageName(language: Language): string` and `LANGUAGE_OPTIONS`.

- [ ] **Step 1: Write the failing tests**

In `lib/prompt.test.ts`, replace the line `const LANGUAGES: Language[] = ["en", "ru", "es", "de"];` (inside the `"the greeting is in the child's language"` describe block) with:

```ts
const LANGUAGES: Language[] = ["en", "ru", "es", "de", "he", "tl", "uk"];
```

(This alone extends the existing "always contains the child's name and the agent's name" test to the three new languages.)

Add inside the same describe block, after the `"greets in Spanish and German too"` test:

```ts
  it("greets in Hebrew, Tagalog and Ukrainian too", () => {
    // Hebrew: Hebrew script present, and no Latin outside the names.
    const he = buildFirstMessage({ ...base, language: "he" });
    expect(he).toMatch(/[֐-׿]/);
    expect(he.replace("Mia", "").replace("Robo", "")).not.toMatch(/[A-Za-z]/);

    // Tagalog is written in Latin script.
    const tl = buildFirstMessage({ ...base, language: "tl" });
    expect(tl).toContain("Maglaro");

    // Ukrainian: Cyrillic present, and no Latin outside the names.
    const uk = buildFirstMessage({ ...base, language: "uk" });
    expect(uk).toMatch(/Привіт/);
    expect(uk.replace("Mia", "").replace("Robo", "")).not.toMatch(/[A-Za-z]/);
  });
```

Extend the existing `"never assumes the child's gender"` test by adding to its body:

```ts
    // Hebrew inflects both "ready" (מוכן/מוכנה) and the "come play"
    // imperative (בוא/בואי) for gender; the greeting must use neither.
    const he = buildFirstMessage({ ...base, language: "he" });
    expect(he).not.toMatch(/מוכנ|בוא/);
    // Ukrainian: "готовий/готова" would pick a gender, like Russian's готов.
    const uk = buildFirstMessage({ ...base, language: "uk" });
    expect(uk).not.toMatch(/готов/i);
```

In the `"buildPrompt states the language"` describe block, extend the existing test body with:

```ts
    expect(buildPrompt({ ...base, language: "he" }, null)).toContain("Hebrew");
    expect(buildPrompt({ ...base, language: "tl" }, null)).toContain("Tagalog");
    expect(buildPrompt({ ...base, language: "uk" }, null)).toContain("Ukrainian");
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- lib/prompt.test.ts`
Expected: FAIL — TypeScript error: `Type '"he"' is not assignable to type 'Language'` (the union doesn't have the new codes yet).

- [ ] **Step 3: Grow the union in `lib/types.ts`**

Replace lines 1–7 of `lib/types.ts` (the comment block and the `export type Language` line) with:

```ts
// The languages the app can teach AND display in. This is a closed union
// derived from one const list, on purpose: every supported language needs a
// greeting the child hears as the very first thing the agent says (see
// LANGUAGES in lib/prompt.ts) and a full UI translation (see STRINGS in
// lib/i18n.ts). When it was a bare `string`, the language dropdown and the
// greeting had no relationship, so the agent greeted a Russian child in
// English. Adding a code here without giving it both is now a compile error.
export const LANGUAGE_CODES = ["en", "ru", "es", "de", "he", "tl", "uk"] as const;
export type Language = (typeof LANGUAGE_CODES)[number];

// Narrows a bare string to the union — for values read back from storage or
// a <select>, the two places a cast would otherwise creep in.
export function isLanguage(value: unknown): value is Language {
  return typeof value === "string" && (LANGUAGE_CODES as readonly string[]).includes(value);
}
```

- [ ] **Step 4: Add the three greetings in `lib/prompt.ts`**

In the `LANGUAGES` record (after the `de` entry), add:

```ts
  he: {
    name: "Hebrew",
    // "שנשחק?" ("shall we play?") deliberately sidesteps Hebrew's gendered
    // imperative בוא/בואי and adjective מוכן/מוכנה — same rule as ru/es.
    greeting: (child, agent) => `היי ${child}! אני ${agent}. שנשחק?`,
  },
  tl: {
    name: "Tagalog",
    // Tagalog has no grammatical gender; "tayo" (inclusive we) is warm and neutral.
    greeting: (child, agent) => `Hi ${child}! Ako si ${agent}. Maglaro tayo?`,
  },
  uk: {
    name: "Ukrainian",
    // Same "shall we play?" shape as the Russian greeting — "Пограємо?"
    // avoids the gendered готовий/готова.
    greeting: (child, agent) => `Привіт, ${child}! Я ${agent}. Пограємо?`,
  },
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- lib/prompt.test.ts`
Expected: PASS (all tests, including the pre-existing ones).

- [ ] **Step 6: Type-check the whole repo**

Run: `npx tsc --noEmit`
Expected: clean. (Nothing else constrains the union's size; `SessionView.tsx`'s `config.language as Language` cast refers to the *ElevenLabs* `Language` type and stays valid — all seven codes are members of ElevenLabs' union, verified against `node_modules/@elevenlabs/types/dist/generated/types/asyncapi-types.d.ts`.)

- [ ] **Step 7: Commit**

```bash
git add lib/types.ts lib/prompt.ts lib/prompt.test.ts
git commit -m "feat: add Hebrew, Tagalog and Ukrainian teaching languages"
```

---

### Task 2: Persist the global language in browser storage

**Files:**
- Modify: `lib/browser-storage.ts`
- Test: `lib/browser-storage.test.ts`

**Interfaces:**
- Consumes: `Language`, `isLanguage` from `lib/types.ts` (Task 1).
- Produces: `loadLanguage(store?: Storage): Language | null` and `saveLanguage(language: Language, store?: Storage): void`, exported from `lib/browser-storage.ts`. `loadLanguage` degrades to `null` on blocked storage or an unrecognized stored value; `saveLanguage` lets a failed write throw (the caller decides best-effort).

- [ ] **Step 1: Write the failing tests**

Add to `lib/browser-storage.test.ts` — extend the import from `./browser-storage` with `loadLanguage, saveLanguage`, then append this describe block at the end of the file (it reuses the existing `fakeStore()` and `throwingStore()` helpers):

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- lib/browser-storage.test.ts`
Expected: FAIL — `loadLanguage` / `saveLanguage` are not exported.

- [ ] **Step 3: Implement in `lib/browser-storage.ts`**

Change the import at the top of the file to also bring in the guard:

```ts
import type { Language, SavedSession, SessionConfig, SessionSummary } from "./types";
import { isLanguage } from "./types";
```

Add next to the other key prefixes (after `const SESSION_PREFIX = ...`):

```ts
const LANGUAGE_KEY = "ai-teacher:language";
```

Add after `loadProfile` (before `keysWithPrefix`):

```ts
// The one global, per-device setting: the language the app teaches AND
// displays in. It is deliberately NOT part of the per-child profile — see
// docs/superpowers/specs/2026-07-16-global-language-setting-design.md.
// The read degrades to null (the caller falls back to English); the write is
// allowed to throw like every other write in this file — the caller
// (LanguageProvider) treats persistence as best-effort and catches it.
export function loadLanguage(store: Storage = defaultStore()): Language | null {
  let raw: string | null;
  try {
    raw = store.getItem(LANGUAGE_KEY);
  } catch {
    return null;
  }
  return isLanguage(raw) ? raw : null;
}

export function saveLanguage(language: Language, store: Storage = defaultStore()): void {
  store.setItem(LANGUAGE_KEY, language);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- lib/browser-storage.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/browser-storage.ts lib/browser-storage.test.ts
git commit -m "feat: persist the global language setting in browser storage"
```

---

### Task 3: The UI string dictionary — `lib/i18n.ts`

**Files:**
- Create: `lib/i18n.ts`
- Test: `lib/i18n.test.ts`

**Interfaces:**
- Consumes: `Language`, `LANGUAGE_CODES` from `lib/types.ts` (Task 1).
- Produces, all exported from `lib/i18n.ts`:
  - `type UIStrings` — every user-facing string, plain or as an interpolation function.
  - `STRINGS: Record<Language, UIStrings>` — the seven dictionaries.
  - `LANGUAGE_META: Record<Language, { nativeName: string; dir: "ltr" | "rtl" }>`.
- Later tasks access strings ONLY as `t.<key>` where `t = STRINGS[language]` comes from `useLanguage()` (Task 4). The exact keys and their signatures are fixed by the `UIStrings` type below — do not rename them in later tasks.

- [ ] **Step 1: Write the failing test**

Create `lib/i18n.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { LANGUAGE_META, STRINGS } from "./i18n";
import { LANGUAGE_CODES } from "./types";

// Completeness (every language has every key) is enforced at compile time by
// the Record types — there is nothing useful to assert about it here. What
// the type system cannot see is the CONTENT of a translation: an
// interpolation function that drops its argument, or meta that marks Hebrew
// left-to-right. Those are what these tests pin down.

describe("LANGUAGE_META", () => {
  it("has a non-empty native name for every language", () => {
    for (const code of LANGUAGE_CODES) {
      expect(LANGUAGE_META[code].nativeName.length, code).toBeGreaterThan(0);
    }
  });

  it("marks Hebrew — and only Hebrew — right-to-left", () => {
    for (const code of LANGUAGE_CODES) {
      expect(LANGUAGE_META[code].dir, code).toBe(code === "he" ? "rtl" : "ltr");
    }
  });
});

describe("interpolation functions keep their arguments", () => {
  // Names must pass through into the displayed string in every language —
  // a translation that drops the child's or the voice's name reads as
  // nonsense ("Filled in from 's last session").
  it("every per-language function embeds the name it is given", () => {
    for (const code of LANGUAGE_CODES) {
      const t = STRINGS[code];
      expect(t.profileFilled("Mia", "goal"), code).toContain("Mia");
      expect(t.profileFilled("Mia", "goal"), code).toContain("goal");
      expect(t.profileMatches("Mia"), code).toContain("Mia");
      expect(t.voiceSubstituted("Aria"), code).toContain("Aria");
      expect(t.playPreview("Aria"), code).toContain("Aria");
      expect(t.stopPreview("Aria"), code).toContain("Aria");
      expect(t.howShouldToyPlay("Buzz"), code).toContain("Buzz");
      expect(t.beTheToyDesc("Buzz"), code).toContain("Buzz");
      expect(t.helpMePlayDesc("Buzz"), code).toContain("Buzz");
      expect(t.povIntro("Buzz"), code).toContain("Buzz");
      expect(t.agentListening("Robo"), code).toContain("Robo");
      expect(t.agentTalking("Robo"), code).toContain("Robo");
      expect(t.asrAlarm("Mia"), code).toContain("Mia");
      expect(t.voicesFailed("boom."), code).toContain("boom.");
      expect(t.photoHttpError(502), code).toContain("502");
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- lib/i18n.test.ts`
Expected: FAIL — cannot resolve `./i18n`.

- [ ] **Step 3: Create `lib/i18n.ts` with the type and all seven dictionaries**

The complete file. The English strings are copied VERBATIM from the components they replace (Tasks 5–8 delete the originals); do not "improve" them here.

```ts
import type { Language } from "./types";

// Every string the parent sees, in every language the app teaches in. Typed
// as a Record over the Language union for the same reason the greetings are
// (lib/prompt.ts): adding a language to the union without a complete UI
// translation is a compile error, not a silent English fallback nobody
// notices until a parent is sitting in front of it.
//
// Strings with runtime values in them are functions, mirroring how greetings
// interpolate names. Names pass through exactly as typed — a child called
// "Mia" is Mia in every language (lib/i18n.test.ts pins this down).
//
// The child-facing text (greetings, prompts) lives in lib/prompt.ts and is
// NOT here: this file is what the PARENT reads, that one is what the CHILD
// hears. The no-gendered-pronoun rule about the child applies to both.
export type UIStrings = {
  // Header
  languagePickerLabel: string;

  // ModePicker
  chooseMode: string;
  lessonTitle: string;
  lessonSub: string;
  toyTitle: string;
  toySub: string;

  // ConfigForm
  savedChildren: string;
  pickUp: string;
  who: string;
  what: string;
  how: string;
  childNameLabel: string;
  childAgeLabel: string;
  goalLabel: string;
  purposeLabel: string;
  goalPlaceholder: string;
  purposePlaceholder: string;
  extraLabel: string;
  extraPlaceholder: string;
  agentNameLabel: string;
  helperNameLabel: string;
  voiceLegend: string;
  loadingVoices: string;
  sessionLength: string;
  startSession: string;
  noVoices: string;
  voicesFailed: (detail: string) => string;
  profileFilled: (child: string, fields: string) => string;
  profileMatches: (child: string) => string;
  voiceSubstituted: (name: string) => string;
  playPreview: (name: string) => string;
  stopPreview: (name: string) => string;
  howShouldToyPlay: (name: string) => string;
  interactionMode: string;
  beTheToyTitle: string;
  beTheToyDesc: (toyName: string) => string;
  helpMePlayTitle: string;
  helpMePlayDesc: (toyName: string) => string;
  povIntro: (toyName: string) => string;
  // Human names for SessionConfig keys, for the profileFilled note.
  // childName and language are deliberately absent: neither is ever restored
  // from a profile (see ConfigForm's loadSaved).
  fieldNames: Record<"agentName" | "voiceId" | "childAge" | "goal" | "directives" | "minutes", string>;

  // SessionView
  gettingReady: string;
  overridesAlarmTitle: string;
  overridesDisabledBody: string;
  connecting: string;
  readyWhenYouAre: string;
  agentListening: (agent: string) => string;
  agentTalking: (agent: string) => string;
  nothingSaidYet: string;
  endSession: string;
  startBtn: string;
  enableOverridesFirst: string;
  micPermission: string;
  couldNotStart: string;

  // EndView
  savingTranscript: string;
  transcriptNotSaved: string;
  browserRefusedSave: string;
  doNotCloseTab: string;
  retrySaving: string;

  // SummaryView
  writingSummary: string;
  summaryMissingNote: string;
  retry: string;
  done: string;
  asrAlarm: (child: string) => string;
  persistNote: string;
  howItWent: string;
  engagementLabel: string;
  engagement: Record<"low" | "medium" | "high", string>;
  confidentWith: string;
  stillTricky: string;
  nextTime: string;
  couldNotWriteSummary: string;
  couldNotReachServer: string;

  // ToyScan
  scanToy: string;
  scanLead: string;
  noToySpotted: string;
  photoHttpError: (status: number) => string;
  photoReadError: string;
  lookingAtToy: string;
  takePhoto: string;
  back: string;

  // ToyConfirm
  confirmToy: string;
  personalityLabel: string;
  howYoullPlay: string;
  useThisToy: string;
  retakePhoto: string;

  // Unlock
  passcodeLabel: string;
  unlockBtn: string;
  wrongPasscode: string;
  unlockNetworkError: string;
};

// The picker shows NATIVE names — a parent choosing their own language
// shouldn't need English to find it. `dir` is data here so no component ever
// writes `if (language === "he")`.
export const LANGUAGE_META: Record<Language, { nativeName: string; dir: "ltr" | "rtl" }> = {
  en: { nativeName: "English", dir: "ltr" },
  ru: { nativeName: "Русский", dir: "ltr" },
  es: { nativeName: "Español", dir: "ltr" },
  de: { nativeName: "Deutsch", dir: "ltr" },
  he: { nativeName: "עברית", dir: "rtl" },
  tl: { nativeName: "Tagalog", dir: "ltr" },
  uk: { nativeName: "Українська", dir: "ltr" },
};

const en: UIStrings = {
  languagePickerLabel: "Language",

  chooseMode: "Choose a mode",
  lessonTitle: "Lesson",
  lessonSub: "A short spoken lesson toward a goal you set.",
  toyTitle: "Interactive Toy",
  toySub: "Scan a real toy and bring it to life to play with.",

  savedChildren: "Saved children",
  pickUp: "Pick up where you left off",
  who: "Who",
  what: "What",
  how: "How",
  childNameLabel: "Child's name",
  childAgeLabel: "Child's age",
  goalLabel: "Goal",
  purposeLabel: "Purpose of play",
  goalPlaceholder: "Count to 10",
  purposePlaceholder: "Practice colours; wind down before bed",
  extraLabel: "Extra instructions",
  extraPlaceholder: "Shy — praise them a lot. Loves dinosaurs.",
  agentNameLabel: "Agent name",
  helperNameLabel: "Helper's name",
  voiceLegend: "Voice",
  loadingVoices: "Loading voices…",
  sessionLength: "Session length (minutes)",
  startSession: "Start session",
  noVoices: "Your ElevenLabs account has no voices in it. Add one at elevenlabs.io, then reload.",
  voicesFailed: (detail) =>
    `Could not load the voice list: ${detail} Check that ELEVENLABS_API_KEY in .env.local is set and valid, and that \`npm run dev\` is still running, then reload this page. Until the voices load, a session cannot be started.`,
  profileFilled: (child, fields) =>
    `Filled in from ${child}'s last session: ${fields}. Anything you already changed was left alone.`,
  profileMatches: (child) =>
    `Found a saved profile for ${child}; everything in it matches what's on the form already.`,
  voiceSubstituted: (name) =>
    `The voice saved for this child is no longer in your ElevenLabs account, so ${name} is selected instead. Pick a different one below if you'd rather — preview them with ▶.`,
  playPreview: (name) => `Play preview of ${name}`,
  stopPreview: (name) => `Stop preview of ${name}`,
  howShouldToyPlay: (name) => `How should ${name} play?`,
  interactionMode: "Interaction mode",
  beTheToyTitle: "Be the toy",
  beTheToyDesc: (toyName) => `the AI talks as ${toyName}.`,
  helpMePlayTitle: "Help me play",
  helpMePlayDesc: (toyName) => `a guide helps the child play with ${toyName}.`,
  povIntro: (toyName) => `${toyName} will introduce itself by name when the session starts.`,
  fieldNames: {
    agentName: "agent name",
    voiceId: "voice",
    childAge: "age",
    goal: "goal",
    directives: "extra instructions",
    minutes: "session length",
  },

  gettingReady: "Getting ready…",
  overridesAlarmTitle: "Session stopped — overrides are not enabled",
  overridesDisabledBody:
    "Stopped the session immediately: this agent is ignoring the settings this app sends, " +
    "so your child would have been talking to an unguarded default agent — no safety rules, " +
    "no lesson, no chosen voice. Fix: open the agent at elevenlabs.io/app/agents, go to its " +
    "Security settings, and enable overrides for all four of System prompt, First message, " +
    "Language and Voice (see SETUP.md). Then start the session again.",
  connecting: "Connecting…",
  readyWhenYouAre: "Ready when you are",
  agentListening: (agent) => `${agent} is listening`,
  agentTalking: (agent) => `${agent} is talking`,
  nothingSaidYet: "Nothing said yet.",
  endSession: "End session",
  startBtn: "Start",
  enableOverridesFirst: "Enable overrides first, then start again",
  micPermission: "I need microphone permission to talk. Please allow it in your browser and try again.",
  couldNotStart: "Could not start the session. Check your keys in .env.local.",

  savingTranscript: "Saving the transcript…",
  transcriptNotSaved: "The transcript is NOT saved",
  browserRefusedSave: "The browser refused to save the transcript.",
  doNotCloseTab:
    "This lesson is still in this browser tab and nowhere else. Do not close or reload the tab — that would lose it for good. If your browser is in private mode or storage is full, fix that, then retry.",
  retrySaving: "Retry saving",

  writingSummary: "Writing the summary…",
  summaryMissingNote:
    "The transcript is saved on this device. Only the summary is missing, and the next session will simply start without one.",
  retry: "Retry",
  done: "Done",
  asrAlarm: (child) =>
    `Heads up: speech recognition struggled to understand ${child} this session. If this keeps happening, the transcripts are worth reading yourself.`,
  persistNote:
    "This report isn't saved on this device, so the next lesson will start without it. The lesson itself is fine — nothing about tonight's session was lost.",
  howItWent: "How it went",
  engagementLabel: "Engagement",
  engagement: { low: "low", medium: "medium", high: "high" },
  confidentWith: "Confident with",
  stillTricky: "Still tricky",
  nextTime: "Next time",
  couldNotWriteSummary: "Could not write the summary.",
  couldNotReachServer: "Could not reach the server.",

  scanToy: "Scan a toy",
  scanLead: "Take a clear photo of the toy, filling the frame.",
  noToySpotted: "I couldn't spot a toy in that photo. Try again with the toy filling the frame.",
  photoHttpError: (status) => `The photo could not be processed (HTTP ${status}).`,
  photoReadError: "Something went wrong reading the photo.",
  lookingAtToy: "Looking at the toy…",
  takePhoto: "📷 Take a photo of the toy",
  back: "Back",

  confirmToy: "Confirm the toy",
  personalityLabel: "Personality",
  howYoullPlay: "How you'll play",
  useThisToy: "Use this toy",
  retakePhoto: "Retake photo",

  passcodeLabel: "Passcode",
  unlockBtn: "Unlock",
  wrongPasscode: "That is not the passcode.",
  unlockNetworkError: "Could not reach the server. Check your connection and try again.",
};

const ru: UIStrings = {
  languagePickerLabel: "Язык",

  chooseMode: "Выберите режим",
  lessonTitle: "Урок",
  lessonSub: "Короткий устный урок с целью, которую задаёте вы.",
  toyTitle: "Интерактивная игрушка",
  toySub: "Сфотографируйте настоящую игрушку и оживите её для игры.",

  savedChildren: "Сохранённые дети",
  pickUp: "Продолжите с того места, где остановились",
  who: "Кто",
  what: "Что",
  how: "Как",
  childNameLabel: "Имя ребёнка",
  childAgeLabel: "Возраст ребёнка",
  goalLabel: "Цель",
  purposeLabel: "Цель игры",
  goalPlaceholder: "Счёт до 10",
  purposePlaceholder: "Учим цвета; спокойная игра перед сном",
  extraLabel: "Дополнительные указания",
  extraPlaceholder: "Стесняется — почаще хвалите. Обожает динозавров.",
  agentNameLabel: "Имя агента",
  helperNameLabel: "Имя помощника",
  voiceLegend: "Голос",
  loadingVoices: "Загружаем голоса…",
  sessionLength: "Длительность занятия (минуты)",
  startSession: "Начать занятие",
  noVoices: "В вашем аккаунте ElevenLabs нет ни одного голоса. Добавьте голос на elevenlabs.io и перезагрузите страницу.",
  voicesFailed: (detail) =>
    `Не удалось загрузить список голосов: ${detail} Проверьте, что ELEVENLABS_API_KEY в .env.local задан и действителен, а \`npm run dev\` всё ещё запущен, затем перезагрузите страницу. Пока голоса не загрузятся, занятие начать нельзя.`,
  profileFilled: (child, fields) =>
    `Заполнено из прошлого занятия (${child}): ${fields}. Всё, что вы уже изменили, осталось как есть.`,
  profileMatches: (child) =>
    `Найден сохранённый профиль для ${child}; всё в нём совпадает с тем, что уже в форме.`,
  voiceSubstituted: (name) =>
    `Голоса, сохранённого для этого ребёнка, больше нет в вашем аккаунте ElevenLabs, поэтому выбран ${name}. Если хотите другой — выберите ниже, послушать можно кнопкой ▶.`,
  playPreview: (name) => `Прослушать голос ${name}`,
  stopPreview: (name) => `Остановить прослушивание ${name}`,
  howShouldToyPlay: (name) => `Как ${name} будет играть?`,
  interactionMode: "Режим взаимодействия",
  beTheToyTitle: "Быть игрушкой",
  beTheToyDesc: (toyName) => `ИИ говорит от лица ${toyName}.`,
  helpMePlayTitle: "Помоги мне играть",
  helpMePlayDesc: (toyName) => `помощник помогает ребёнку играть с ${toyName}.`,
  povIntro: (toyName) => `${toyName} представится по имени в начале занятия.`,
  fieldNames: {
    agentName: "имя агента",
    voiceId: "голос",
    childAge: "возраст",
    goal: "цель",
    directives: "дополнительные указания",
    minutes: "длительность",
  },

  gettingReady: "Готовимся…",
  overridesAlarmTitle: "Занятие остановлено — переопределения не включены",
  overridesDisabledBody:
    "Занятие остановлено немедленно: агент игнорирует настройки, которые отправляет это приложение, — " +
    "ребёнок говорил бы с агентом по умолчанию, без защитных правил, без урока и без выбранного голоса. " +
    "Как исправить: откройте агента на elevenlabs.io/app/agents, зайдите в его настройки Security и " +
    "включите переопределения для всех четырёх: System prompt, First message, Language и Voice " +
    "(см. SETUP.md). Затем начните занятие заново.",
  connecting: "Подключаемся…",
  readyWhenYouAre: "Готовы, когда вы готовы",
  agentListening: (agent) => `${agent} слушает`,
  agentTalking: (agent) => `${agent} говорит`,
  nothingSaidYet: "Пока ничего не сказано.",
  endSession: "Завершить занятие",
  startBtn: "Начать",
  enableOverridesFirst: "Сначала включите переопределения, затем начните снова",
  micPermission: "Мне нужен доступ к микрофону. Разрешите его в браузере и попробуйте ещё раз.",
  couldNotStart: "Не удалось начать занятие. Проверьте ключи в .env.local.",

  savingTranscript: "Сохраняем запись…",
  transcriptNotSaved: "Запись НЕ сохранена",
  browserRefusedSave: "Браузер отказался сохранить запись.",
  doNotCloseTab:
    "Это занятие существует только в этой вкладке браузера и больше нигде. Не закрывайте и не перезагружайте вкладку — иначе оно пропадёт навсегда. Если браузер в приватном режиме или хранилище переполнено, исправьте это и повторите.",
  retrySaving: "Повторить сохранение",

  writingSummary: "Пишем отчёт…",
  summaryMissingNote:
    "Запись сохранена на этом устройстве. Не хватает только отчёта — следующее занятие просто начнётся без него.",
  retry: "Повторить",
  done: "Готово",
  asrAlarm: (child) =>
    `Обратите внимание: распознавание речи плохо понимало ${child} на этом занятии. Если это повторяется, записи стоит читать самостоятельно.`,
  persistNote:
    "Этот отчёт не сохранён на устройстве, поэтому следующее занятие начнётся без него. Само занятие в порядке — ничего из сегодняшнего не потеряно.",
  howItWent: "Как всё прошло",
  engagementLabel: "Вовлечённость",
  engagement: { low: "низкая", medium: "средняя", high: "высокая" },
  confidentWith: "Уверенно",
  stillTricky: "Пока сложно",
  nextTime: "В следующий раз",
  couldNotWriteSummary: "Не удалось написать отчёт.",
  couldNotReachServer: "Не удалось связаться с сервером.",

  scanToy: "Сканировать игрушку",
  scanLead: "Сделайте чёткое фото игрушки крупным планом.",
  noToySpotted: "Не удалось разглядеть игрушку на этом фото. Попробуйте ещё раз, чтобы игрушка занимала весь кадр.",
  photoHttpError: (status) => `Не удалось обработать фото (HTTP ${status}).`,
  photoReadError: "Что-то пошло не так при чтении фото.",
  lookingAtToy: "Рассматриваем игрушку…",
  takePhoto: "📷 Сфотографировать игрушку",
  back: "Назад",

  confirmToy: "Подтвердите игрушку",
  personalityLabel: "Характер",
  howYoullPlay: "Как будете играть",
  useThisToy: "Играть с этой игрушкой",
  retakePhoto: "Переснять",

  passcodeLabel: "Код доступа",
  unlockBtn: "Открыть",
  wrongPasscode: "Это не тот код.",
  unlockNetworkError: "Не удалось связаться с сервером. Проверьте соединение и попробуйте ещё раз.",
};

const es: UIStrings = {
  languagePickerLabel: "Idioma",

  chooseMode: "Elige un modo",
  lessonTitle: "Lección",
  lessonSub: "Una breve lección hablada hacia una meta que tú fijas.",
  toyTitle: "Juguete interactivo",
  toySub: "Escanea un juguete real y dale vida para jugar.",

  savedChildren: "Peques guardados",
  pickUp: "Continúa donde lo dejaste",
  who: "Quién",
  what: "Qué",
  how: "Cómo",
  childNameLabel: "Nombre del peque",
  childAgeLabel: "Edad del peque",
  goalLabel: "Meta",
  purposeLabel: "Propósito del juego",
  goalPlaceholder: "Contar hasta 10",
  purposePlaceholder: "Practicar los colores; relajarse antes de dormir",
  extraLabel: "Instrucciones adicionales",
  extraPlaceholder: "Le da vergüenza hablar: elógiale mucho. Le encantan los dinosaurios.",
  agentNameLabel: "Nombre del agente",
  helperNameLabel: "Nombre del ayudante",
  voiceLegend: "Voz",
  loadingVoices: "Cargando voces…",
  sessionLength: "Duración de la sesión (minutos)",
  startSession: "Empezar sesión",
  noVoices: "Tu cuenta de ElevenLabs no tiene ninguna voz. Añade una en elevenlabs.io y recarga.",
  voicesFailed: (detail) =>
    `No se pudo cargar la lista de voces: ${detail} Comprueba que ELEVENLABS_API_KEY en .env.local está configurada y es válida, y que \`npm run dev\` sigue en marcha; luego recarga esta página. Hasta que las voces carguen, no se puede empezar una sesión.`,
  profileFilled: (child, fields) =>
    `Rellenado con la última sesión de ${child}: ${fields}. Lo que ya habías cambiado se dejó tal cual.`,
  profileMatches: (child) =>
    `Hay un perfil guardado para ${child}; todo coincide con lo que ya está en el formulario.`,
  voiceSubstituted: (name) =>
    `La voz guardada para este peque ya no está en tu cuenta de ElevenLabs, así que se seleccionó ${name}. Elige otra abajo si lo prefieres — escúchalas con ▶.`,
  playPreview: (name) => `Escuchar muestra de ${name}`,
  stopPreview: (name) => `Detener muestra de ${name}`,
  howShouldToyPlay: (name) => `¿Cómo debería jugar ${name}?`,
  interactionMode: "Modo de interacción",
  beTheToyTitle: "Ser el juguete",
  beTheToyDesc: (toyName) => `la IA habla como ${toyName}.`,
  helpMePlayTitle: "Ayúdame a jugar",
  helpMePlayDesc: (toyName) => `un guía ayuda al peque a jugar con ${toyName}.`,
  povIntro: (toyName) => `${toyName} se presentará por su nombre al empezar la sesión.`,
  fieldNames: {
    agentName: "nombre del agente",
    voiceId: "voz",
    childAge: "edad",
    goal: "meta",
    directives: "instrucciones adicionales",
    minutes: "duración",
  },

  gettingReady: "Preparando…",
  overridesAlarmTitle: "Sesión detenida — las anulaciones no están activadas",
  overridesDisabledBody:
    "Sesión detenida de inmediato: este agente ignora la configuración que envía esta app, así que tu " +
    "peque habría estado hablando con un agente por defecto sin protección — sin reglas de seguridad, " +
    "sin lección, sin la voz elegida. Solución: abre el agente en elevenlabs.io/app/agents, ve a sus " +
    "ajustes de Security y activa las anulaciones para los cuatro: System prompt, First message, " +
    "Language y Voice (ver SETUP.md). Luego empieza la sesión de nuevo.",
  connecting: "Conectando…",
  readyWhenYouAre: "Listo cuando quieras",
  agentListening: (agent) => `${agent} está escuchando`,
  agentTalking: (agent) => `${agent} está hablando`,
  nothingSaidYet: "Aún no se ha dicho nada.",
  endSession: "Terminar sesión",
  startBtn: "Empezar",
  enableOverridesFirst: "Activa primero las anulaciones y vuelve a empezar",
  micPermission: "Necesito permiso del micrófono para hablar. Permítelo en tu navegador e inténtalo de nuevo.",
  couldNotStart: "No se pudo iniciar la sesión. Revisa tus claves en .env.local.",

  savingTranscript: "Guardando la transcripción…",
  transcriptNotSaved: "La transcripción NO está guardada",
  browserRefusedSave: "El navegador se negó a guardar la transcripción.",
  doNotCloseTab:
    "Esta lección solo existe en esta pestaña del navegador. No cierres ni recargues la pestaña — se perdería para siempre. Si tu navegador está en modo privado o el almacenamiento está lleno, arréglalo y reintenta.",
  retrySaving: "Reintentar guardado",

  writingSummary: "Escribiendo el resumen…",
  summaryMissingNote:
    "La transcripción está guardada en este dispositivo. Solo falta el resumen; la próxima sesión simplemente empezará sin él.",
  retry: "Reintentar",
  done: "Listo",
  asrAlarm: (child) =>
    `Atención: el reconocimiento de voz tuvo problemas para entender a ${child} en esta sesión. Si sigue pasando, vale la pena que leas las transcripciones personalmente.`,
  persistNote:
    "Este informe no quedó guardado en este dispositivo, así que la próxima lección empezará sin él. La lección en sí está bien — no se perdió nada de la sesión de hoy.",
  howItWent: "Cómo fue",
  engagementLabel: "Participación",
  engagement: { low: "baja", medium: "media", high: "alta" },
  confidentWith: "Domina",
  stillTricky: "Aún le cuesta",
  nextTime: "La próxima vez",
  couldNotWriteSummary: "No se pudo escribir el resumen.",
  couldNotReachServer: "No se pudo conectar con el servidor.",

  scanToy: "Escanear un juguete",
  scanLead: "Haz una foto clara del juguete, llenando el encuadre.",
  noToySpotted: "No pude ver un juguete en esa foto. Prueba otra vez con el juguete llenando el encuadre.",
  photoHttpError: (status) => `No se pudo procesar la foto (HTTP ${status}).`,
  photoReadError: "Algo salió mal al leer la foto.",
  lookingAtToy: "Mirando el juguete…",
  takePhoto: "📷 Hacer una foto del juguete",
  back: "Atrás",

  confirmToy: "Confirma el juguete",
  personalityLabel: "Personalidad",
  howYoullPlay: "Cómo jugaréis",
  useThisToy: "Usar este juguete",
  retakePhoto: "Repetir foto",

  passcodeLabel: "Código de acceso",
  unlockBtn: "Desbloquear",
  wrongPasscode: "Ese no es el código.",
  unlockNetworkError: "No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.",
};

const de: UIStrings = {
  languagePickerLabel: "Sprache",

  chooseMode: "Modus wählen",
  lessonTitle: "Lektion",
  lessonSub: "Eine kurze gesprochene Lektion mit einem Ziel, das du festlegst.",
  toyTitle: "Interaktives Spielzeug",
  toySub: "Scanne ein echtes Spielzeug und erwecke es zum Leben.",

  savedChildren: "Gespeicherte Kinder",
  pickUp: "Mach weiter, wo du aufgehört hast",
  who: "Wer",
  what: "Was",
  how: "Wie",
  childNameLabel: "Name des Kindes",
  childAgeLabel: "Alter des Kindes",
  goalLabel: "Ziel",
  purposeLabel: "Zweck des Spielens",
  goalPlaceholder: "Bis 10 zählen",
  purposePlaceholder: "Farben üben; vor dem Schlafen zur Ruhe kommen",
  extraLabel: "Zusätzliche Hinweise",
  extraPlaceholder: "Schüchtern — viel loben. Liebt Dinosaurier.",
  agentNameLabel: "Name des Agenten",
  helperNameLabel: "Name des Helfers",
  voiceLegend: "Stimme",
  loadingVoices: "Stimmen werden geladen…",
  sessionLength: "Dauer der Einheit (Minuten)",
  startSession: "Einheit starten",
  noVoices: "Dein ElevenLabs-Konto enthält keine Stimmen. Füge auf elevenlabs.io eine hinzu und lade die Seite neu.",
  voicesFailed: (detail) =>
    `Die Stimmenliste konnte nicht geladen werden: ${detail} Prüfe, ob ELEVENLABS_API_KEY in .env.local gesetzt und gültig ist und ob \`npm run dev\` noch läuft, und lade die Seite dann neu. Solange die Stimmen nicht geladen sind, kann keine Einheit gestartet werden.`,
  profileFilled: (child, fields) =>
    `Aus der letzten Einheit von ${child} übernommen: ${fields}. Alles, was du schon geändert hattest, blieb unangetastet.`,
  profileMatches: (child) =>
    `Für ${child} gibt es ein gespeichertes Profil; alles darin stimmt mit dem Formular überein.`,
  voiceSubstituted: (name) =>
    `Die für dieses Kind gespeicherte Stimme ist nicht mehr in deinem ElevenLabs-Konto, deshalb ist jetzt ${name} ausgewählt. Wähl unten gern eine andere — anhören mit ▶.`,
  playPreview: (name) => `Hörprobe von ${name} abspielen`,
  stopPreview: (name) => `Hörprobe von ${name} stoppen`,
  howShouldToyPlay: (name) => `Wie soll ${name} spielen?`,
  interactionMode: "Interaktionsmodus",
  beTheToyTitle: "Das Spielzeug sein",
  beTheToyDesc: (toyName) => `die KI spricht als ${toyName}.`,
  helpMePlayTitle: "Hilf mir beim Spielen",
  helpMePlayDesc: (toyName) => `ein Begleiter hilft dem Kind, mit ${toyName} zu spielen.`,
  povIntro: (toyName) => `${toyName} stellt sich zu Beginn der Einheit mit Namen vor.`,
  fieldNames: {
    agentName: "Name des Agenten",
    voiceId: "Stimme",
    childAge: "Alter",
    goal: "Ziel",
    directives: "zusätzliche Hinweise",
    minutes: "Dauer",
  },

  gettingReady: "Wird vorbereitet…",
  overridesAlarmTitle: "Einheit gestoppt — Overrides sind nicht aktiviert",
  overridesDisabledBody:
    "Die Einheit wurde sofort gestoppt: Dieser Agent ignoriert die Einstellungen dieser App — dein Kind " +
    "hätte mit einem ungeschützten Standard-Agenten gesprochen, ohne Sicherheitsregeln, ohne Lektion, " +
    "ohne die gewählte Stimme. Lösung: Öffne den Agenten auf elevenlabs.io/app/agents, geh in die " +
    "Security-Einstellungen und aktiviere Overrides für alle vier: System prompt, First message, " +
    "Language und Voice (siehe SETUP.md). Starte die Einheit dann neu.",
  connecting: "Verbinden…",
  readyWhenYouAre: "Bereit, wenn du es bist",
  agentListening: (agent) => `${agent} hört zu`,
  agentTalking: (agent) => `${agent} spricht`,
  nothingSaidYet: "Noch nichts gesagt.",
  endSession: "Einheit beenden",
  startBtn: "Start",
  enableOverridesFirst: "Erst Overrides aktivieren, dann neu starten",
  micPermission: "Ich brauche Mikrofon-Zugriff zum Sprechen. Bitte erlaube ihn im Browser und versuch es erneut.",
  couldNotStart: "Die Einheit konnte nicht gestartet werden. Prüfe deine Schlüssel in .env.local.",

  savingTranscript: "Mitschrift wird gespeichert…",
  transcriptNotSaved: "Die Mitschrift ist NICHT gespeichert",
  browserRefusedSave: "Der Browser hat das Speichern der Mitschrift verweigert.",
  doNotCloseTab:
    "Diese Lektion existiert nur in diesem Browser-Tab und nirgendwo sonst. Schließe den Tab nicht und lade ihn nicht neu — sonst ist sie endgültig verloren. Falls dein Browser im privaten Modus ist oder der Speicher voll ist, behebe das und versuch es erneut.",
  retrySaving: "Speichern wiederholen",

  writingSummary: "Zusammenfassung wird geschrieben…",
  summaryMissingNote:
    "Die Mitschrift ist auf diesem Gerät gespeichert. Nur die Zusammenfassung fehlt; die nächste Einheit startet einfach ohne sie.",
  retry: "Erneut versuchen",
  done: "Fertig",
  asrAlarm: (child) =>
    `Hinweis: Die Spracherkennung hatte in dieser Einheit Mühe, ${child} zu verstehen. Wenn das öfter passiert, lohnt es sich, die Mitschriften selbst zu lesen.`,
  persistNote:
    "Dieser Bericht ist nicht auf diesem Gerät gespeichert, die nächste Lektion startet also ohne ihn. Die Lektion selbst ist in Ordnung — von der heutigen Einheit ist nichts verloren.",
  howItWent: "So lief es",
  engagementLabel: "Beteiligung",
  engagement: { low: "niedrig", medium: "mittel", high: "hoch" },
  confidentWith: "Sicher bei",
  stillTricky: "Noch schwierig",
  nextTime: "Nächstes Mal",
  couldNotWriteSummary: "Die Zusammenfassung konnte nicht geschrieben werden.",
  couldNotReachServer: "Der Server war nicht erreichbar.",

  scanToy: "Ein Spielzeug scannen",
  scanLead: "Mach ein klares, bildfüllendes Foto des Spielzeugs.",
  noToySpotted: "Auf dem Foto war kein Spielzeug zu erkennen. Versuch es erneut, mit dem Spielzeug bildfüllend.",
  photoHttpError: (status) => `Das Foto konnte nicht verarbeitet werden (HTTP ${status}).`,
  photoReadError: "Beim Lesen des Fotos ist etwas schiefgegangen.",
  lookingAtToy: "Spielzeug wird angesehen…",
  takePhoto: "📷 Spielzeug fotografieren",
  back: "Zurück",

  confirmToy: "Spielzeug bestätigen",
  personalityLabel: "Persönlichkeit",
  howYoullPlay: "So werdet ihr spielen",
  useThisToy: "Dieses Spielzeug verwenden",
  retakePhoto: "Foto wiederholen",

  passcodeLabel: "Zugangscode",
  unlockBtn: "Entsperren",
  wrongPasscode: "Das ist nicht der Code.",
  unlockNetworkError: "Der Server war nicht erreichbar. Prüfe deine Verbindung und versuch es erneut.",
};

// Hebrew addresses the parent in the plural ("אתם") throughout — the standard
// gender-neutral register for an audience of unknown gender, matching the
// app-wide rule of never assuming anyone's gender.
const he: UIStrings = {
  languagePickerLabel: "שפה",

  chooseMode: "בחירת מצב",
  lessonTitle: "שיעור",
  lessonSub: "שיעור מדובר קצר לקראת מטרה שאתם קובעים.",
  toyTitle: "צעצוע אינטראקטיבי",
  toySub: "סרקו צעצוע אמיתי והחיו אותו כדי לשחק.",

  savedChildren: "ילדים שמורים",
  pickUp: "המשיכו מאיפה שהפסקתם",
  who: "מי",
  what: "מה",
  how: "איך",
  childNameLabel: "שם הילד או הילדה",
  childAgeLabel: "גיל",
  goalLabel: "מטרה",
  purposeLabel: "מטרת המשחק",
  goalPlaceholder: "לספור עד 10",
  purposePlaceholder: "לתרגל צבעים; להירגע לפני השינה",
  extraLabel: "הנחיות נוספות",
  extraPlaceholder: "קצת ביישנות — הרבו לשבח. דינוזאורים זו אהבה גדולה.",
  agentNameLabel: "שם הסוכן",
  helperNameLabel: "שם העוזר",
  voiceLegend: "קול",
  loadingVoices: "הקולות בטעינה…",
  sessionLength: "אורך המפגש (דקות)",
  startSession: "התחלת מפגש",
  noVoices: "בחשבון ElevenLabs שלכם אין אף קול. הוסיפו אחד ב־elevenlabs.io וטענו מחדש.",
  voicesFailed: (detail) =>
    `לא ניתן לטעון את רשימת הקולות: ${detail} ודאו ש־ELEVENLABS_API_KEY בקובץ ‎.env.local מוגדר ותקף, וש־\`npm run dev\` עדיין רץ, ואז טענו את העמוד מחדש. עד שהקולות ייטענו, אי אפשר להתחיל מפגש.`,
  profileFilled: (child, fields) =>
    `הושלם מהמפגש הקודם של ${child}: ${fields}. כל מה שכבר שיניתם נשאר כפי שהוא.`,
  profileMatches: (child) => `נמצא פרופיל שמור עבור ${child}; הכול בו תואם למה שכבר בטופס.`,
  voiceSubstituted: (name) =>
    `הקול שנשמר לילד הזה כבר לא נמצא בחשבון ElevenLabs שלכם, ולכן נבחר ${name}. אפשר לבחור אחר למטה — האזינו עם ▶.`,
  playPreview: (name) => `השמעת דוגמה של ${name}`,
  stopPreview: (name) => `עצירת הדוגמה של ${name}`,
  howShouldToyPlay: (name) => `איך ${name} ישחק?`,
  interactionMode: "מצב אינטראקציה",
  beTheToyTitle: "להיות הצעצוע",
  beTheToyDesc: (toyName) => `הבינה המלאכותית מדברת בתור ${toyName}.`,
  helpMePlayTitle: "עזרו לי לשחק",
  helpMePlayDesc: (toyName) => `מדריך עוזר לילד לשחק עם ${toyName}.`,
  povIntro: (toyName) => `${toyName} יציג את עצמו בשמו כשהמפגש יתחיל.`,
  fieldNames: {
    agentName: "שם הסוכן",
    voiceId: "קול",
    childAge: "גיל",
    goal: "מטרה",
    directives: "הנחיות נוספות",
    minutes: "אורך המפגש",
  },

  gettingReady: "רק רגע…",
  overridesAlarmTitle: "המפגש נעצר — הדריסות (overrides) אינן מופעלות",
  overridesDisabledBody:
    "המפגש נעצר מיד: הסוכן מתעלם מההגדרות שהאפליקציה שולחת, כך שהילד היה מדבר עם סוכן ברירת־מחדל לא " +
    "מוגן — בלי כללי בטיחות, בלי שיעור, בלי הקול שנבחר. הפתרון: פתחו את הסוכן ב־elevenlabs.io/app/agents, " +
    "היכנסו להגדרות ה־Security שלו והפעילו overrides לכל הארבעה: System prompt‏, First message‏, Language " +
    "ו־Voice (ראו SETUP.md). ואז התחילו את המפגש מחדש.",
  connecting: "מתחבר…",
  readyWhenYouAre: "מוכנים כשאתם מוכנים",
  agentListening: (agent) => `${agent} מקשיב`,
  agentTalking: (agent) => `${agent} מדבר`,
  nothingSaidYet: "עוד לא נאמר דבר.",
  endSession: "סיום המפגש",
  startBtn: "התחלה",
  enableOverridesFirst: "הפעילו קודם את הדריסות, ואז התחילו שוב",
  micPermission: "דרושה הרשאת מיקרופון כדי לדבר. אשרו אותה בדפדפן ונסו שוב.",
  couldNotStart: "לא ניתן להתחיל את המפגש. בדקו את המפתחות ב־.env.local.",

  savingTranscript: "התמליל נשמר…",
  transcriptNotSaved: "התמליל לא נשמר",
  browserRefusedSave: "הדפדפן סירב לשמור את התמליל.",
  doNotCloseTab:
    "השיעור הזה קיים רק בלשונית הדפדפן הזו ובשום מקום אחר. אל תסגרו ואל תרעננו את הלשונית — כך הוא יאבד לתמיד. אם הדפדפן במצב פרטי או שהאחסון מלא, תקנו זאת ונסו שוב.",
  retrySaving: "ניסיון שמירה נוסף",

  writingSummary: "הסיכום נכתב…",
  summaryMissingNote: "התמליל שמור במכשיר הזה. חסר רק הסיכום, והמפגש הבא פשוט יתחיל בלעדיו.",
  retry: "ניסיון נוסף",
  done: "סיום",
  asrAlarm: (child) =>
    `שימו לב: זיהוי הדיבור התקשה להבין את ${child} במפגש הזה. אם זה חוזר על עצמו, כדאי לקרוא את התמלילים בעצמכם.`,
  persistNote:
    "הדוח הזה לא נשמר במכשיר, ולכן השיעור הבא יתחיל בלעדיו. השיעור עצמו בסדר גמור — שום דבר מהמפגש של היום לא אבד.",
  howItWent: "איך היה",
  engagementLabel: "מעורבות",
  engagement: { low: "נמוכה", medium: "בינונית", high: "גבוהה" },
  confidentWith: "כבר בביטחון",
  stillTricky: "עדיין מאתגר",
  nextTime: "בפעם הבאה",
  couldNotWriteSummary: "לא ניתן לכתוב את הסיכום.",
  couldNotReachServer: "אין חיבור לשרת.",

  scanToy: "סריקת צעצוע",
  scanLead: "צלמו תמונה ברורה של הצעצוע, כך שימלא את הפריים.",
  noToySpotted: "לא הצלחתי לזהות צעצוע בתמונה. נסו שוב כשהצעצוע ממלא את הפריים.",
  photoHttpError: (status) => `לא ניתן לעבד את התמונה (HTTP ${status}).`,
  photoReadError: "משהו השתבש בקריאת התמונה.",
  lookingAtToy: "מתבונן בצעצוע…",
  takePhoto: "📷 צילום הצעצוע",
  back: "חזרה",

  confirmToy: "אישור הצעצוע",
  personalityLabel: "אופי",
  howYoullPlay: "איך תשחקו",
  useThisToy: "לשחק עם הצעצוע הזה",
  retakePhoto: "צילום מחדש",

  passcodeLabel: "קוד גישה",
  unlockBtn: "פתיחה",
  wrongPasscode: "זה לא הקוד.",
  unlockNetworkError: "אין חיבור לשרת. בדקו את החיבור ונסו שוב.",
};

const tl: UIStrings = {
  languagePickerLabel: "Wika",

  chooseMode: "Pumili ng mode",
  lessonTitle: "Aralin",
  lessonSub: "Maikling aralin sa pagsasalita tungo sa layuning itinakda mo.",
  toyTitle: "Interactive na Laruan",
  toySub: "I-scan ang totoong laruan at buhayin ito para makipaglaro.",

  savedChildren: "Mga naka-save na bata",
  pickUp: "Ituloy kung saan ka huminto",
  who: "Sino",
  what: "Ano",
  how: "Paano",
  childNameLabel: "Pangalan ng bata",
  childAgeLabel: "Edad ng bata",
  goalLabel: "Layunin",
  purposeLabel: "Layunin ng paglalaro",
  goalPlaceholder: "Magbilang hanggang 10",
  purposePlaceholder: "Mag-praktis ng mga kulay; kumalma bago matulog",
  extraLabel: "Karagdagang bilin",
  extraPlaceholder: "Mahiyain — purihin nang madalas. Mahilig sa dinosaur.",
  agentNameLabel: "Pangalan ng agent",
  helperNameLabel: "Pangalan ng katulong",
  voiceLegend: "Boses",
  loadingVoices: "Nilo-load ang mga boses…",
  sessionLength: "Tagal ng session (minuto)",
  startSession: "Simulan ang session",
  noVoices: "Walang boses ang iyong ElevenLabs account. Magdagdag ng isa sa elevenlabs.io, tapos i-reload.",
  voicesFailed: (detail) =>
    `Hindi ma-load ang listahan ng mga boses: ${detail} Tiyaking naka-set at wasto ang ELEVENLABS_API_KEY sa .env.local, at tumatakbo pa ang \`npm run dev\`, tapos i-reload ang page na ito. Hangga't hindi na-load ang mga boses, hindi makakapagsimula ng session.`,
  profileFilled: (child, fields) =>
    `Pinunan mula sa huling session ni ${child}: ${fields}. Hindi ginalaw ang anumang binago mo na.`,
  profileMatches: (child) =>
    `May nakitang naka-save na profile para kay ${child}; tugma ang lahat dito sa nasa form na.`,
  voiceSubstituted: (name) =>
    `Wala na sa iyong ElevenLabs account ang boses na naka-save para sa batang ito, kaya ${name} ang napili. Pumili ng iba sa ibaba kung gusto mo — pakinggan sila gamit ang ▶.`,
  playPreview: (name) => `I-play ang preview ni ${name}`,
  stopPreview: (name) => `Itigil ang preview ni ${name}`,
  howShouldToyPlay: (name) => `Paano dapat maglaro si ${name}?`,
  interactionMode: "Paraan ng paglalaro",
  beTheToyTitle: "Maging ang laruan",
  beTheToyDesc: (toyName) => `magsasalita ang AI bilang si ${toyName}.`,
  helpMePlayTitle: "Tulungan akong maglaro",
  helpMePlayDesc: (toyName) => `may gabay na tutulong sa bata na makipaglaro kay ${toyName}.`,
  povIntro: (toyName) => `Magpapakilala si ${toyName} sa sarili niyang pangalan sa simula ng session.`,
  fieldNames: {
    agentName: "pangalan ng agent",
    voiceId: "boses",
    childAge: "edad",
    goal: "layunin",
    directives: "karagdagang bilin",
    minutes: "tagal",
  },

  gettingReady: "Naghahanda…",
  overridesAlarmTitle: "Itinigil ang session — hindi naka-enable ang mga override",
  overridesDisabledBody:
    "Agad itinigil ang session: binabalewala ng agent na ito ang mga setting na ipinapadala ng app, kaya " +
    "makakausap sana ng anak mo ang isang default na agent na walang proteksyon — walang mga panuntunang " +
    "pangkaligtasan, walang aralin, walang napiling boses. Ayusin: buksan ang agent sa " +
    "elevenlabs.io/app/agents, pumunta sa Security settings nito, at i-enable ang overrides para sa lahat " +
    "ng apat: System prompt, First message, Language at Voice (tingnan ang SETUP.md). Pagkatapos, simulan " +
    "ulit ang session.",
  connecting: "Kumokonekta…",
  readyWhenYouAre: "Handa kapag handa ka na",
  agentListening: (agent) => `Nakikinig si ${agent}`,
  agentTalking: (agent) => `Nagsasalita si ${agent}`,
  nothingSaidYet: "Wala pang nasasabi.",
  endSession: "Tapusin ang session",
  startBtn: "Simulan",
  enableOverridesFirst: "I-enable muna ang overrides, tapos magsimula ulit",
  micPermission: "Kailangan ko ng pahintulot sa mikropono para makapagsalita. Payagan ito sa browser at subukan ulit.",
  couldNotStart: "Hindi masimulan ang session. Suriin ang iyong mga key sa .env.local.",

  savingTranscript: "Sine-save ang transcript…",
  transcriptNotSaved: "HINDI naka-save ang transcript",
  browserRefusedSave: "Tumanggi ang browser na i-save ang transcript.",
  doNotCloseTab:
    "Nasa tab na ito ng browser lang ang aralin at wala nang iba. Huwag isara o i-reload ang tab — mawawala ito nang tuluyan. Kung naka-private mode ang browser mo o puno ang storage, ayusin iyon, tapos subukan ulit.",
  retrySaving: "Subukan ulit i-save",

  writingSummary: "Sinusulat ang buod…",
  summaryMissingNote:
    "Naka-save ang transcript sa device na ito. Ang buod lang ang kulang, at magsisimula lang ang susunod na session nang wala ito.",
  retry: "Subukan ulit",
  done: "Tapos na",
  asrAlarm: (child) =>
    `Paalala: nahirapan ang speech recognition na maintindihan si ${child} sa session na ito. Kung paulit-ulit ito, sulit na basahin mo mismo ang mga transcript.`,
  persistNote:
    "Hindi naka-save ang ulat na ito sa device, kaya magsisimula ang susunod na aralin nang wala ito. Ayos lang ang aralin mismo — walang nawala sa session ngayon.",
  howItWent: "Kumusta ang takbo",
  engagementLabel: "Pakikilahok",
  engagement: { low: "mababa", medium: "katamtaman", high: "mataas" },
  confidentWith: "Kabisado na",
  stillTricky: "Medyo mahirap pa",
  nextTime: "Sa susunod",
  couldNotWriteSummary: "Hindi maisulat ang buod.",
  couldNotReachServer: "Hindi maabot ang server.",

  scanToy: "Mag-scan ng laruan",
  scanLead: "Kumuha ng malinaw na litrato ng laruan, punuin ang frame.",
  noToySpotted: "Wala akong nakitang laruan sa litratong iyan. Subukan ulit nang pinupuno ng laruan ang frame.",
  photoHttpError: (status) => `Hindi ma-proseso ang litrato (HTTP ${status}).`,
  photoReadError: "May nagkaproblema sa pagbasa ng litrato.",
  lookingAtToy: "Tinitingnan ang laruan…",
  takePhoto: "📷 Kunan ng litrato ang laruan",
  back: "Bumalik",

  confirmToy: "Kumpirmahin ang laruan",
  personalityLabel: "Ugali",
  howYoullPlay: "Paano kayo maglalaro",
  useThisToy: "Gamitin ang laruang ito",
  retakePhoto: "Kunan ulit",

  passcodeLabel: "Passcode",
  unlockBtn: "I-unlock",
  wrongPasscode: "Hindi iyan ang passcode.",
  unlockNetworkError: "Hindi maabot ang server. Suriin ang koneksyon mo at subukan ulit.",
};

const uk: UIStrings = {
  languagePickerLabel: "Мова",

  chooseMode: "Оберіть режим",
  lessonTitle: "Урок",
  lessonSub: "Короткий усний урок із метою, яку задаєте ви.",
  toyTitle: "Інтерактивна іграшка",
  toySub: "Відскануйте справжню іграшку й оживіть її для гри.",

  savedChildren: "Збережені діти",
  pickUp: "Продовжте з того місця, де зупинилися",
  who: "Хто",
  what: "Що",
  how: "Як",
  childNameLabel: "Ім'я дитини",
  childAgeLabel: "Вік дитини",
  goalLabel: "Мета",
  purposeLabel: "Мета гри",
  goalPlaceholder: "Лічба до 10",
  purposePlaceholder: "Вчимо кольори; спокійна гра перед сном",
  extraLabel: "Додаткові вказівки",
  extraPlaceholder: "Соромиться — частіше хваліть. Обожнює динозаврів.",
  agentNameLabel: "Ім'я агента",
  helperNameLabel: "Ім'я помічника",
  voiceLegend: "Голос",
  loadingVoices: "Завантажуємо голоси…",
  sessionLength: "Тривалість заняття (хвилини)",
  startSession: "Почати заняття",
  noVoices: "У вашому акаунті ElevenLabs немає жодного голосу. Додайте голос на elevenlabs.io і перезавантажте сторінку.",
  voicesFailed: (detail) =>
    `Не вдалося завантажити список голосів: ${detail} Перевірте, що ELEVENLABS_API_KEY у .env.local задано і він дійсний, а \`npm run dev\` досі запущено, потім перезавантажте сторінку. Поки голоси не завантажаться, заняття почати не можна.`,
  profileFilled: (child, fields) =>
    `Заповнено з минулого заняття (${child}): ${fields}. Усе, що ви вже змінили, залишилося як є.`,
  profileMatches: (child) =>
    `Знайдено збережений профіль для ${child}; усе в ньому збігається з тим, що вже у формі.`,
  voiceSubstituted: (name) =>
    `Голосу, збереженого для цієї дитини, більше немає у вашому акаунті ElevenLabs, тому обрано ${name}. Якщо хочете інший — оберіть нижче, послухати можна кнопкою ▶.`,
  playPreview: (name) => `Прослухати голос ${name}`,
  stopPreview: (name) => `Зупинити прослуховування ${name}`,
  howShouldToyPlay: (name) => `Як ${name} гратиме?`,
  interactionMode: "Режим взаємодії",
  beTheToyTitle: "Бути іграшкою",
  beTheToyDesc: (toyName) => `ШІ говорить від імені ${toyName}.`,
  helpMePlayTitle: "Допоможи мені грати",
  helpMePlayDesc: (toyName) => `помічник допомагає дитині грати з ${toyName}.`,
  povIntro: (toyName) => `${toyName} представиться на ім'я на початку заняття.`,
  fieldNames: {
    agentName: "ім'я агента",
    voiceId: "голос",
    childAge: "вік",
    goal: "мета",
    directives: "додаткові вказівки",
    minutes: "тривалість",
  },

  gettingReady: "Готуємося…",
  overridesAlarmTitle: "Заняття зупинено — перевизначення не ввімкнені",
  overridesDisabledBody:
    "Заняття зупинено негайно: агент ігнорує налаштування, які надсилає цей застосунок, — дитина " +
    "розмовляла б з агентом за замовчуванням, без правил безпеки, без уроку і без обраного голосу. " +
    "Як виправити: відкрийте агента на elevenlabs.io/app/agents, зайдіть у його налаштування Security " +
    "і ввімкніть перевизначення для всіх чотирьох: System prompt, First message, Language і Voice " +
    "(див. SETUP.md). Потім почніть заняття знову.",
  connecting: "З'єднуємося…",
  readyWhenYouAre: "Готові, коли ви готові",
  agentListening: (agent) => `${agent} слухає`,
  agentTalking: (agent) => `${agent} говорить`,
  nothingSaidYet: "Поки нічого не сказано.",
  endSession: "Завершити заняття",
  startBtn: "Почати",
  enableOverridesFirst: "Спершу ввімкніть перевизначення, потім почніть знову",
  micPermission: "Мені потрібен доступ до мікрофона. Дозвольте його в браузері та спробуйте ще раз.",
  couldNotStart: "Не вдалося почати заняття. Перевірте ключі в .env.local.",

  savingTranscript: "Зберігаємо запис…",
  transcriptNotSaved: "Запис НЕ збережено",
  browserRefusedSave: "Браузер відмовився зберегти запис.",
  doNotCloseTab:
    "Це заняття існує лише в цій вкладці браузера і більше ніде. Не закривайте і не перезавантажуйте вкладку — інакше воно зникне назавжди. Якщо браузер у приватному режимі або сховище переповнене, виправте це і повторіть.",
  retrySaving: "Повторити збереження",

  writingSummary: "Пишемо звіт…",
  summaryMissingNote:
    "Запис збережено на цьому пристрої. Бракує лише звіту — наступне заняття просто почнеться без нього.",
  retry: "Повторити",
  done: "Готово",
  asrAlarm: (child) =>
    `Зверніть увагу: розпізнавання мовлення погано розуміло ${child} на цьому занятті. Якщо це повторюється, записи варто читати самостійно.`,
  persistNote:
    "Цей звіт не збережено на пристрої, тому наступне заняття почнеться без нього. Саме заняття в порядку — нічого з сьогоднішнього не втрачено.",
  howItWent: "Як усе минуло",
  engagementLabel: "Залученість",
  engagement: { low: "низька", medium: "середня", high: "висока" },
  confidentWith: "Упевнено",
  stillTricky: "Поки складно",
  nextTime: "Наступного разу",
  couldNotWriteSummary: "Не вдалося написати звіт.",
  couldNotReachServer: "Не вдалося зв'язатися з сервером.",

  scanToy: "Сканувати іграшку",
  scanLead: "Зробіть чітке фото іграшки великим планом.",
  noToySpotted: "Не вдалося розгледіти іграшку на цьому фото. Спробуйте ще раз, щоб іграшка займала весь кадр.",
  photoHttpError: (status) => `Не вдалося обробити фото (HTTP ${status}).`,
  photoReadError: "Щось пішло не так під час читання фото.",
  lookingAtToy: "Роздивляємось іграшку…",
  takePhoto: "📷 Сфотографувати іграшку",
  back: "Назад",

  confirmToy: "Підтвердьте іграшку",
  personalityLabel: "Характер",
  howYoullPlay: "Як гратимете",
  useThisToy: "Грати з цією іграшкою",
  retakePhoto: "Перезняти",

  passcodeLabel: "Код доступу",
  unlockBtn: "Відкрити",
  wrongPasscode: "Це не той код.",
  unlockNetworkError: "Не вдалося зв'язатися з сервером. Перевірте з'єднання і спробуйте ще раз.",
};

export const STRINGS: Record<Language, UIStrings> = { en, ru, es, de, he, tl, uk };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- lib/i18n.test.ts`
Expected: PASS.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: clean — in particular, every one of the seven dictionaries satisfies `UIStrings` (a missing or misnamed key fails here).

- [ ] **Step 6: Commit**

```bash
git add lib/i18n.ts lib/i18n.test.ts
git commit -m "feat: typed UI string dictionary in 7 languages"
```

---

### Task 4: LanguageProvider, the header with the picker, and page wiring

**Files:**
- Create: `app/components/LanguageProvider.tsx`
- Create: `app/components/Header.tsx`
- Create: `app/components/Header.module.css`
- Modify: `app/layout.tsx`
- Modify: `app/page.tsx:68-75`
- Modify: `app/unlock/page.tsx`
- Modify: `app/app.module.css` (remove the now-unused `.title` rule)

**Interfaces:**
- Consumes: `loadLanguage`/`saveLanguage` (Task 2), `STRINGS`, `LANGUAGE_META`, `UIStrings` (Task 3), `Language`, `LANGUAGE_CODES`, `isLanguage` (Task 1).
- Produces: `LanguageProvider` (default export) and `useLanguage(): { language: Language; setLanguage: (l: Language) => void; t: UIStrings }` from `app/components/LanguageProvider.tsx`; `Header` (default export, no props) from `app/components/Header.tsx`. Tasks 5–8 call `useLanguage()` — components can do so because the provider wraps the whole app from this task on.

There is no component-test infrastructure in this repo (vitest runs in a node environment); this task is verified by type-check, lint, and running the app.

- [ ] **Step 1: Read the Next.js guides for the code you're about to touch**

Per AGENTS.md this Next.js has breaking changes. Read (at minimum skim for API changes) the guides under `node_modules/next/dist/docs/01-app/` covering **layouts**, **client components / "use client"**, and **fonts** — enough to confirm that wrapping `{children}` in a client component inside the root layout, and the `next/font/google` usage already in `app/layout.tsx`, still work the way the existing code assumes.

- [ ] **Step 2: Create `app/components/LanguageProvider.tsx`**

```tsx
"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { loadLanguage, saveLanguage } from "../../lib/browser-storage";
import { LANGUAGE_META, STRINGS, type UIStrings } from "../../lib/i18n";
import type { Language } from "../../lib/types";

// The one global setting: which language the app teaches AND displays in.
// Owned here, persisted per-device, consumed everywhere via useLanguage().
// It is deliberately NOT per-child (see the design doc): the header picker is
// the single source of truth, and ConfigForm injects this value into the
// SessionConfig at submit.
type LanguageContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: UIStrings;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export default function LanguageProvider({ children }: { children: React.ReactNode }) {
  // Starts as "en" on both server and client so hydration matches, then the
  // stored choice is applied in an effect. The parent sees an English flash
  // on load — accepted in the design as the cost of having no locale
  // routing. Same one-shot client-only localStorage read as ConfigForm's
  // listProfiles and SessionView's lastSummary (see the comments there for
  // why an effect, not useSyncExternalStore).
  const [language, setLanguageState] = useState<Language>("en");

  useEffect(() => {
    const stored = loadLanguage();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored) setLanguageState(stored);
  }, []);

  // Mirror the choice onto the document, where CSS and assistive tech read
  // it: `lang` for screen readers/hyphenation, `dir` for RTL (Hebrew).
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = LANGUAGE_META[language].dir;
  }, [language]);

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    try {
      saveLanguage(next);
    } catch {
      // Persistence is a convenience; a blocked write must not break the
      // picker. The choice still applies for this visit.
    }
  }, []);

  const value = useMemo(
    () => ({ language, setLanguage, t: STRINGS[language] }),
    [language, setLanguage],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const value = useContext(LanguageContext);
  if (!value) throw new Error("useLanguage must be used inside <LanguageProvider>");
  return value;
}
```

- [ ] **Step 3: Create `app/components/Header.tsx`**

```tsx
"use client";

import { LANGUAGE_META } from "../../lib/i18n";
import { LANGUAGE_CODES, isLanguage } from "../../lib/types";
import { useLanguage } from "./LanguageProvider";
import styles from "./Header.module.css";

// The app's header: the (untranslated — it's the product's name) title plus
// the global language picker. Native names in the options, because a parent
// picking their own language shouldn't need English to find it.
export default function Header() {
  const { language, setLanguage, t } = useLanguage();

  return (
    <header className={styles.header}>
      <h1 className={styles.title}>AI Teacher</h1>
      <select
        className={styles.picker}
        aria-label={t.languagePickerLabel}
        value={language}
        // A <select>'s value is a bare string; narrow it with the guard
        // rather than a cast — same idiom the old ConfigForm field used.
        onChange={(e) => {
          if (isLanguage(e.target.value)) setLanguage(e.target.value);
        }}
      >
        {LANGUAGE_CODES.map((code) => (
          <option key={code} value={code}>
            {LANGUAGE_META[code].nativeName}
          </option>
        ))}
      </select>
    </header>
  );
}
```

- [ ] **Step 4: Create `app/components/Header.module.css`**

Logical properties only (no left/right) — this header must survive `dir="rtl"` unchanged:

```css
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-4);
}

.title {
  font-size: var(--t-xl);
  font-weight: 800;
  letter-spacing: -0.02em;
}

.picker {
  font: inherit;
  padding: var(--s-2) var(--s-3);
  border-radius: var(--r-sm);
  max-width: 11rem;
}
```

(These tokens are used on faith from `app/app.module.css` — before committing, check `app/globals.css` for which `--s-*`/`--r-*`/`--t-*` custom properties actually exist and substitute the nearest real ones.)

- [ ] **Step 5: Mount the provider in `app/layout.tsx`**

Add the import and wrap `{children}`:

```tsx
import LanguageProvider from "./components/LanguageProvider";
```

and change the body line to:

```tsx
      <body>
        <LanguageProvider>{children}</LanguageProvider>
      </body>
```

Leave `<html lang="en" ...>` as is — the provider's effect updates `lang`/`dir` on the client after hydration.

- [ ] **Step 6: Use the header in `app/page.tsx`**

Add `import Header from "./components/Header";` and replace

```tsx
        <h1 className={styles.title}>AI Teacher</h1>
```

with

```tsx
        <Header />
```

Then delete the now-unused `.title` rule from `app/app.module.css`.

- [ ] **Step 7: Localize `app/unlock/page.tsx` and give it the header**

Replace its `<h1 className={styles.title}>AI Teacher</h1>` with `<Header />` (import from `../components/Header`), add `const { t } = useLanguage();` (import from `../components/LanguageProvider`) at the top of the component, and swap the strings:

- `<label ...>Passcode</label>` → `{t.passcodeLabel}`
- `"That is not the passcode."` fallback → `t.wrongPasscode`
- `"Could not reach the server. Check your connection and try again."` → `t.unlockNetworkError`
- `Unlock` button text → `{t.unlockBtn}`

If nothing in `app/unlock/Unlock.module.css` references `.title` anymore, delete that rule.

- [ ] **Step 8: Verify**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: all clean/pass.

Then run the app (`npm run dev`), open it, and check: the header shows the picker; switching to Русский persists across a reload; switching to עברית flips the page to RTL (`<html dir="rtl">` in devtools); the unlock page (if `APP_PASSCODE` is configured) shows the same header.

- [ ] **Step 9: Commit**

```bash
git add app/components/LanguageProvider.tsx app/components/Header.tsx app/components/Header.module.css app/layout.tsx app/page.tsx app/app.module.css app/unlock/page.tsx app/unlock/Unlock.module.css
git commit -m "feat: global language picker in the header"
```

---

### Task 5: ConfigForm — global language in, per-form picker out

**Files:**
- Modify: `app/components/ConfigForm.tsx`

**Interfaces:**
- Consumes: `useLanguage()` from `app/components/LanguageProvider` (Task 4).
- Produces: no new exports. Behavior contract for the rest of the app: the `SessionConfig` passed to `onStart` ALWAYS carries the current global language, regardless of what any saved profile contains.

- [ ] **Step 1: Wire in the global language**

In `app/components/ConfigForm.tsx`:

1. Remove the import of `LANGUAGE_OPTIONS` from `../../lib/prompt` and delete the `const LANGUAGES = LANGUAGE_OPTIONS;` line together with its comment block (the "one list" concern that comment records is now owned by lib/i18n.ts and lib/prompt.ts sharing the `Language` union).
2. Add: `import { useLanguage } from "./LanguageProvider";` and `import type { UIStrings } from "../../lib/i18n";`
3. Inside the component, first line: `const { language, t } = useLanguage();`
4. `DEFAULTS` keeps `language: "en"` — the type requires a member, but the value no longer reaches a started session (step 3 below).

- [ ] **Step 2: Remove the Language field from the form**

Delete the entire `<div className={styles.field}>` block containing the `${formId}-language` label and `<select>` (currently `app/components/ConfigForm.tsx:300-319`).

- [ ] **Step 3: Inject the global language at submit, and neutralize both profile-restore paths**

In `submit()`, change

```tsx
    const chosen = { ...config, voiceId };
```

to

```tsx
    // The global header setting is the single source of truth for language —
    // whatever a restored profile or DEFAULTS put in `config.language` is
    // overwritten here, so the saved session remains a complete record of
    // what was actually taught.
    const chosen = { ...config, voiceId, language };
```

In `loadSaved()`, change the skip line to also skip `language` (old profiles still contain one — it must be neither applied nor named in the profile note):

```tsx
      // childName is what we looked the profile up *by* — never overwrite the
      // spelling the parent just typed with the stored one. language is a
      // GLOBAL setting now (the header picker) — a stored per-child language
      // is a leftover from the old scheme and is deliberately ignored.
      if (key === "childName" || key === "language" || touched.current.has(key)) continue;
```

In `applyCard()`, change `setConfig({ ...p });` to:

```tsx
    setConfig({ ...p, language });
```

- [ ] **Step 4: Localize every string in the component**

Replace each hardcoded string with its dictionary key (all keys exist since Task 3):

| Location | Replace with |
|---|---|
| `aria-label="Saved children"` | `aria-label={t.savedChildren}` |
| `Pick up where you left off` | `{t.pickUp}` |
| legends `Who` / `What` / `How` | `{t.who}` / `{t.what}` / `{t.how}` |
| `Child&apos;s name` | `{t.childNameLabel}` |
| `Child&apos;s age` | `{t.childAgeLabel}` |
| `{toy ? "Purpose of play" : "Goal"}` | `{toy ? t.purposeLabel : t.goalLabel}` |
| goal `placeholder={...}` | `placeholder={toy ? t.purposePlaceholder : t.goalPlaceholder}` |
| `Extra instructions` | `{t.extraLabel}` |
| directives `placeholder="Shy — praise them a lot. Loves dinosaurs."` | `placeholder={t.extraPlaceholder}` |
| `{toy ? "Helper's name" : "Agent name"}` | `{toy ? t.helperNameLabel : t.agentNameLabel}` |
| legend `Voice` | `{t.voiceLegend}` |
| `Loading voices…` | `{t.loadingVoices}` |
| voice-substituted `<p role="status">` body | `{t.voiceSubstituted(voiceChoice.name)}` |
| preview `aria-label` | `playingVoiceId === v.voiceId ? t.stopPreview(v.name) : t.playPreview(v.name)` |
| `Session length (minutes)` | `{t.sessionLength}` |
| `Start session` | `{t.startSession}` |
| toy-mode `<span className={styles.modeLabel}>` | `{t.howShouldToyPlay(config.agentName \|\| toy.name)}` |
| `aria-label="Interaction mode"` | `aria-label={t.interactionMode}` |
| `<strong>Be the toy</strong> — the AI talks as {toy.name}.` | `<strong>{t.beTheToyTitle}</strong> — {t.beTheToyDesc(toy.name)}` |
| `<strong>Help me play</strong> — a guide helps the child play with {toy.name}.` | `<strong>{t.helpMePlayTitle}</strong> — {t.helpMePlayDesc(toy.name)}` |
| POV note `{toy.name} will introduce itself…` | `{t.povIntro(toy.name)}` |

The two `setProfileNote(...)` strings become:

```tsx
    setProfileNote(
      applied.length > 0
        ? t.profileFilled(
            config.childName,
            applied.map((k) => t.fieldNames[k as keyof UIStrings["fieldNames"]]).join(", "),
          )
        : t.profileMatches(config.childName),
    );
```

The cast is sound: `applied` can only contain keys of `DEFAULTS` minus `childName`/`language` — both skipped in the loop — which is exactly the key set of `fieldNames`. Do NOT add childName/language to `fieldNames`.

**The voices error needs restructuring, not just translation.** The fetch effect runs once (`[]` deps) and today bakes an English string into state; a stored string would also stay in the old language after the parent switches. Store structured data instead and render it through `t`:

1. Change the state:

```tsx
  const [voicesError, setVoicesError] = useState<
    { kind: "noVoices" } | { kind: "failed"; detail: string } | null
  >(null);
```

2. In the effect: `setVoicesError({ kind: "noVoices" })` replaces the no-voices string; the catch block becomes

```tsx
      .catch((e: unknown) => {
        setVoices([]);
        setVoicesError({ kind: "failed", detail: e instanceof Error ? e.message : "unknown error" });
      });
```

3. Render:

```tsx
        {voicesError && (
          <p role="alert" className={styles.error}>
            {voicesError.kind === "noVoices" ? t.noVoices : t.voicesFailed(voicesError.detail)}
          </p>
        )}
```

This keeps the effect language-independent AND re-renders the error in the new language when the parent switches mid-error.

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean. Then in the running app: the form has no Language field; switch the header to Español and confirm the whole form re-renders in Spanish; start a session with the header on Русский and confirm the agent greets in Russian (the config carried `language: "ru"`).

- [ ] **Step 6: Commit**

```bash
git add app/components/ConfigForm.tsx
git commit -m "feat: ConfigForm uses the global language and is fully localized"
```

---

### Task 6: Localize SessionView (and move the overrides message into the dictionary)

**Files:**
- Modify: `app/components/SessionView.tsx`
- Modify: `lib/overrides.ts:107-112` (delete `OVERRIDES_DISABLED_MESSAGE`)

**Interfaces:**
- Consumes: `useLanguage()` (Task 4); `t.overridesDisabledBody` and the other SessionView keys (Task 3).
- Produces: no new exports. `lib/overrides.ts` loses its `OVERRIDES_DISABLED_MESSAGE` export — nothing else imports it (verified: only SessionView.tsx does).

- [ ] **Step 1: Move the overrides-disabled message**

1. In `lib/overrides.ts`, delete the `export const OVERRIDES_DISABLED_MESSAGE = ...` block at the end of the file (lines 107–112). The text now lives as `overridesDisabledBody` in every language in `lib/i18n.ts` (Task 3 already added it).
2. In `app/components/SessionView.tsx`, remove `OVERRIDES_DISABLED_MESSAGE` from the `../../lib/overrides` import.

- [ ] **Step 2: Restructure the overridesDisabled state**

`overridesDisabled` currently stores the message string. Storing a string would freeze the language it was set in; store the FACT and render the current translation instead. In `SessionInner`:

```tsx
  // True when the override canary tripped (see onMessage): the session was
  // aborted because the agent was not running our configuration. The message
  // shown for it comes from the dictionary at render time, so it follows the
  // header's language even if the parent switches after the alarm fired.
  const [overridesDisabled, setOverridesDisabled] = useState(false);
```

- `setOverridesDisabled(OVERRIDES_DISABLED_MESSAGE)` in onMessage → `setOverridesDisabled(true)`
- `setOverridesDisabled(null)` in `start()` → `setOverridesDisabled(false)`
- The alarm JSX becomes:

```tsx
      {overridesDisabled && (
        <section role="alert" className={styles.alarm}>
          <h2>{t.overridesAlarmTitle}</h2>
          <p>{t.overridesDisabledBody}</p>
        </section>
      )}
```

(All other `overridesDisabled &&` / `!overridesDisabled` guards keep working — it's still truthy/falsy.)

- [ ] **Step 3: Get `t` into the component and localize the rest**

`SessionView` (the outer provider wrapper) needs no changes. In `SessionInner`, add `const { t } = useLanguage();` (import `useLanguage` from `./LanguageProvider`) and replace:

| Location | Replace with |
|---|---|
| `if (!ready) return <p ...>Getting ready…</p>` | `{t.gettingReady}` |
| `"Connecting…"` (status line) | `t.connecting` |
| `"Ready when you are"` | `t.readyWhenYouAre` |
| `` `${config.agentName} is listening` `` | `t.agentListening(config.agentName)` |
| `` `${config.agentName} is talking` `` | `t.agentTalking(config.agentName)` |
| `Nothing said yet.` | `{t.nothingSaidYet}` |
| `End session` button | `{t.endSession}` |
| `Enable overrides first, then start again` | `{t.enableOverridesFirst}` |
| `{conversation.status === "connecting" ? "Connecting…" : "Start"}` | `{conversation.status === "connecting" ? t.connecting : t.startBtn}` |
| mic-permission `setError("I need microphone permission…")` | `setError(t.micPermission)` |
| `setError("Could not start the session. Check your keys in .env.local.")` | `setError(t.couldNotStart)` |

Note on `start()`: it is a `useCallback` with deps `[conversation, config]` — add `t` to the dependency array (it changes when the language does, and the two errors above close over it). Note on `error` state: the other two writers (`onDisconnect`, `onError`) store messages that come from ElevenLabs, not from us — those stay as-is; there is nothing to translate server text into.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean. In the running app (any language): start and end a short session; the status line, transcript placeholder and buttons render in the picked language.

- [ ] **Step 5: Commit**

```bash
git add app/components/SessionView.tsx lib/overrides.ts
git commit -m "feat: localize SessionView; overrides message moves to the dictionary"
```

---

### Task 7: Localize EndView and SummaryView

**Files:**
- Modify: `app/components/EndView.tsx`
- Modify: `app/components/SummaryView.tsx`

**Interfaces:**
- Consumes: `useLanguage()` (Task 4) and the EndView/SummaryView dictionary keys (Task 3).
- Produces: no new exports.

- [ ] **Step 1: EndView**

Add `const { t } = useLanguage();` (import from `./LanguageProvider`) inside the component and replace:

| Location | Replace with |
|---|---|
| `Saving the transcript…` | `{t.savingTranscript}` |
| `<h2>The transcript is NOT saved</h2>` | `<h2>{t.transcriptNotSaved}</h2>` |
| fallback `"The browser refused to save the transcript."` | `t.browserRefusedSave` |
| the `Do not close or reload the tab` paragraph | `{t.doNotCloseTab}` |
| `Retry saving` | `{t.retrySaving}` |

The `state.message` for a real `Error` stays as-is (it is the browser's own exception text — e.g. a quota error — and not ours to translate).

- [ ] **Step 2: SummaryView**

Add `const { t } = useLanguage();` and replace:

| Location | Replace with |
|---|---|
| `Writing the summary…` | `{t.writingSummary}` |
| `The transcript is saved on this device. …` note | `{t.summaryMissingNote}` |
| `Retry` / `Done` buttons (both instances of Done) | `{t.retry}` / `{t.done}` |
| ASR alarm paragraph body | `{t.asrAlarm(session.config.childName)}` |
| `setPersistNote("This report isn't saved…")` | see below — restructure |
| `<h2 ...>How it went</h2>` | `{t.howItWent}` |
| `<span ...>Engagement</span>` | `{t.engagementLabel}` |
| engagement pill TEXT `{summary.engagement}` | `{t.engagement[summary.engagement]}` — the `className={styles[summary.engagement]}` stays on the raw enum value |
| `<Chips title="Confident with" .../>` | `title={t.confidentWith}` |
| `<Chips title="Still tricky" .../>` | `title={t.stillTricky}` |
| `<span ...>Next time</span>` | `{t.nextTime}` |
| `setError(data.error ?? "Could not write the summary.")` | see below — restructure |
| `setError("Could not reach the server.")` | see below — restructure |

**Restructure `error` and `persistNote` the same way as ConfigForm's voicesError** (a stored string freezes its language):

```tsx
  const [error, setError] = useState<{ kind: "server"; message: string } | { kind: "network" } | null>(null);
  const [persistFailed, setPersistFailed] = useState(false);
```

- Success path: `attachSummary` catch → `setPersistFailed(true)`; render `{persistFailed && (<p className={styles.note} role="status">{t.persistNote}</p>)}` (keep the existing comment about role="status").
- `data.error` present → `setError({ kind: "server", message: data.error })`; no summary and no error field → `setError({ kind: "server", message: "" })`; fetch rejection → `setError({ kind: "network" })`.
- Render: `{error.kind === "network" ? t.couldNotReachServer : error.message || t.couldNotWriteSummary}` — a server-provided message (English, from our own route) is shown verbatim; only OUR fallbacks are translated.
- `summarize`'s `useCallback` deps stay `[session, sessionId]` — with the restructuring it no longer closes over `t` (that was the point).

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean. In the running app: finish a short session in Українська — "Зберігаємо запис…", "Пишемо звіт…" and the report card labels all render in Ukrainian.

- [ ] **Step 4: Commit**

```bash
git add app/components/EndView.tsx app/components/SummaryView.tsx
git commit -m "feat: localize the end-of-session and summary screens"
```

---

### Task 8: Localize ModePicker, ToyScan and ToyConfirm

**Files:**
- Modify: `app/components/ModePicker.tsx`
- Modify: `app/components/ToyScan.tsx`
- Modify: `app/components/ToyConfirm.tsx`

**Interfaces:**
- Consumes: `useLanguage()` (Task 4) and the ModePicker/ToyScan/ToyConfirm dictionary keys (Task 3).
- Produces: no new exports.

- [ ] **Step 1: ModePicker**

Add `const { t } = useLanguage();` (import from `./LanguageProvider`) and replace: `aria-label="Choose a mode"` → `aria-label={t.chooseMode}`, `Lesson` → `{t.lessonTitle}`, the lesson subtitle → `{t.lessonSub}`, `Interactive Toy` → `{t.toyTitle}`, the toy subtitle → `{t.toySub}`. The emoji spans stay.

- [ ] **Step 2: ToyScan**

Add `const { t } = useLanguage();` and replace:

| Location | Replace with |
|---|---|
| `aria-label="Scan a toy"` | `aria-label={t.scanToy}` |
| lead paragraph | `{t.scanLead}` |
| `"I couldn't spot a toy in that photo. …"` | `t.noToySpotted` |
| `` throw new Error(payload.error ?? `The photo could not be processed (HTTP ${res.status}).`) `` | `` throw new Error(payload.error ?? t.photoHttpError(res.status)) `` |
| `"Something went wrong reading the photo."` fallback | `t.photoReadError` |
| `"Looking at the toy…"` | `t.lookingAtToy` |
| `"📷 Take a photo of the toy"` | `t.takePhoto` |
| `Back` | `{t.back}` |

`error` here is set from a user-triggered async handler (not a mount effect), and a retake resets it — the freeze-on-switch concern is negligible; keep the string state as-is.

- [ ] **Step 3: ToyConfirm**

Add `const { t } = useLanguage();` and replace: `aria-label="Confirm the toy"` → `{t.confirmToy}`, `<dt>Personality</dt>` → `{t.personalityLabel}`, `<dt>How you&apos;ll play</dt>` → `{t.howYoullPlay}`, `Use this toy` → `{t.useThisToy}`, `Retake photo` → `{t.retakePhoto}`. The toy's own name/character/personality/howToPlay come from the vision model and render as-is.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean. Grep for leftovers — every user-visible literal should now be gone from components:

```bash
grep -rn '"[A-Z][a-z].*"' app/components/*.tsx | grep -v "className\|aria-hidden\|import\|//\|/\*" | head -30
```

Review any hits by eye (type names and comments are fine; rendered strings are not).

- [ ] **Step 5: Commit**

```bash
git add app/components/ModePicker.tsx app/components/ToyScan.tsx app/components/ToyConfirm.tsx
git commit -m "feat: localize mode picker and toy flow"
```

---

### Task 9: The AI-written summary follows the language

**Files:**
- Modify: `app/api/summarize/route.ts:26-68` (`buildSummaryPrompt`)
- Test: `app/api/summarize/route.test.ts`

**Interfaces:**
- Consumes: `languageName(language: Language): string` from `lib/prompt.ts` (exists since before this plan; unchanged by Task 1).
- Produces: no interface change — same route, same request/response shape.

- [ ] **Step 1: Write the failing test**

Add to `app/api/summarize/route.test.ts`, at the end of the `"buildSummaryPrompt framing"` describe block:

```ts
  it("tells Claude to write the summary in the session's language", () => {
    const ru = { ...validSession, config: { ...config, language: "ru" as const } };
    expect(buildSummaryPrompt(ru, "child: hi")).toContain("Russian");

    const ruToy = { ...ru, config: { ...ru.config, toy, toyMode: "pov" as const } };
    expect(buildSummaryPrompt(ruToy, "child: hi")).toContain("Russian");

    // And the default English session says English, so the instruction is
    // always present rather than only for "foreign" languages.
    expect(buildSummaryPrompt(validSession, "child: hi")).toContain("English");
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- app/api/summarize/route.test.ts`
Expected: FAIL — the prompt contains no language name.

- [ ] **Step 3: Add the instruction to both prompt variants**

In `app/api/summarize/route.ts`, import the helper:

```ts
import { languageName } from "../../../lib/prompt";
```

In `buildSummaryPrompt`, append the same final line to BOTH template literals (the toy one and the lesson one), after the `transcriptQuality` paragraph:

```ts
Write every field in ${languageName(config.language)} — it is the language the parent reads.
```

(That is: add `\n\nWrite every field in ${languageName(config.language)} — it is the language the parent reads.` to the end of each returned template string.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- app/api/summarize/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/summarize/route.ts app/api/summarize/route.test.ts
git commit -m "feat: session summary is written in the session's language"
```

---

### Task 10: RTL CSS pass and final verification

**Files:**
- Modify: `app/components/ModePicker.module.css:15`
- Modify: `app/components/ConfigForm.module.css:48`
- Modify: `app/components/ToyConfirm.module.css:19`
- Modify: `app/components/SessionView.module.css:201,206`

**Interfaces:** none — CSS only.

The full audit of direction-sensitive properties across every module.css was done while planning; these four files are the complete list of offenders. `align-self: flex-start/flex-end` (SessionView bubbles) and all flexbox layouts are direction-aware already and need no change.

- [ ] **Step 1: Convert physical properties to logical ones**

- `app/components/ModePicker.module.css:15`: `text-align: left;` → `text-align: start;`
- `app/components/ConfigForm.module.css:48`: `text-align: left;` → `text-align: start;`
- `app/components/ToyConfirm.module.css:19`: `text-align: left;` → `text-align: start;`
- `app/components/SessionView.module.css` — the chat-bubble tails:
  - line 201: `border-bottom-left-radius: var(--r-sm);` → `border-end-start-radius: var(--r-sm);`
  - line 206: `border-bottom-right-radius: var(--r-sm);` → `border-end-end-radius: var(--r-sm);`

(Logical border-radius mapping in LTR: `end-start` = bottom-left, `end-end` = bottom-right — identical rendering in LTR, mirrored in RTL, which is exactly what a speech-bubble tail should do.)

- [ ] **Step 2: Confirm nothing else is direction-sensitive**

```bash
grep -rn "text-align: left\|text-align: right\|margin-left\|margin-right\|padding-left\|padding-right\|border-bottom-left\|border-bottom-right\|border-top-left\|border-top-right\|left:\|right:\|float" app/**/*.css app/*.css
```

Expected: no hits on real properties (comments mentioning "left" are fine).

- [ ] **Step 3: Full-app manual verification**

With `npm run dev` running:

1. **Hebrew end-to-end:** pick עברית — layout flips RTL; mode tiles, form, and buttons read right-to-left with no broken alignment; the form's `text-align: start` labels sit on the right. Hebrew text renders in the system fallback font (Nunito has no Hebrew subset — accepted in the design; note anything that looks actually broken, not merely different).
2. **Persistence:** reload — still Hebrew. Switch to English — LTR restored.
3. **Session in a new language:** run a short lesson with the header on Українська: greeting is "Привіт, …! Я …. Пограємо?", the transcript bubbles' tails sit on the correct sides, the summary arrives in Ukrainian.
4. **Old profile migration:** with a profile saved before this change (it contains `language`), type that child's name and blur — the note must NOT name the language among restored fields; start the session and confirm it uses the HEADER language, not the profile's.

- [ ] **Step 4: Full verification suite**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build`
Expected: all pass; the production build compiles.

- [ ] **Step 5: Commit**

```bash
git add app/components/ModePicker.module.css app/components/ConfigForm.module.css app/components/ToyConfirm.module.css app/components/SessionView.module.css
git commit -m "fix: logical CSS properties so Hebrew RTL mirrors correctly"
```

---

## Plan Self-Review (done at planning time)

- **Spec coverage:** union+greetings (Task 1), storage (Task 2), dictionary+native names+meta (Task 3), provider+header+`lang`/`dir`+unlock (Task 4), ConfigForm submit-injection and profile neutralization (Task 5), SessionView incl. overrides message (Task 6), summary screens (Task 7), toy flow + mode picker (Task 8), localized AI summary (Task 9), RTL audit (Task 10). Spec's "server stays locale-unaware" holds: no API route reads the UI language; the summarize route uses the session's own `config.language`.
- **Type consistency:** `useLanguage(): { language, setLanguage, t }` is consumed with exactly those names in Tasks 5–8; dictionary keys used in Tasks 4–8 all appear in the `UIStrings` type in Task 3; `loadLanguage`/`saveLanguage` signatures match between Tasks 2 and 4.
- **Known accepted trade-offs (from the spec):** English flash before hydration; server-rendered `lang="en"` corrected client-side; Hebrew in fallback font.


