# Global Language Setting — Design

**Date:** 2026-07-16
**Status:** Approved

## What we're building

Language stops being a per-session form field and becomes one global setting,
picked from a language picker in the app header. The picker controls both:

1. **The teaching language** — what the agent speaks and listens in (what the
   old ConfigForm field controlled), and
2. **The UI language** — every label, button, note and error message the
   parent sees, including the AI-written session summary.

Three new languages join the existing four: **Hebrew (`he`)**, **Tagalog
(`tl`)** and **Ukrainian (`uk`)**. All three are confirmed members of the
ElevenLabs `ConversationConfigOverrideAgentLanguage` union, so they are valid
`language` override values as-is.

## Decisions already made

- **Global only.** The per-child saved profile no longer carries an effective
  language. The header picker is the single source of truth; whatever it says
  applies to every session, every child. (Rejected: per-profile override of a
  global default — more complex mental model than "global setting" implies.)
- **Teaching + UI language.** One picker drives both. (The UI translation is
  the bulk of the work.)
- **Homegrown typed dictionary, no i18n library.** Rejected next-intl (built
  around locale routing and server components; this is one client page with
  localStorage persistence) and react-i18next (two new dependencies,
  stringly-typed keys). The typed-Record pattern the codebase already uses for
  greetings gives us the property we care about most: **a language without a
  full translation is a compile error**, not a silent English fallback.

## Architecture

### 1. `Language` union grows — `lib/types.ts`

```ts
export type Language = "en" | "ru" | "es" | "de" | "he" | "tl" | "uk";
```

`SessionConfig` **keeps** its `language` field. A saved session must remain a
complete record of what happened — including what language it was taught in —
and the prompt builder, overrides and summarize route all read it. The change
is where the value comes from: the global setting is injected at submit time,
not picked on the form.

### 2. Three new greetings — `lib/prompt.ts`

The existing `Record<Language, …>` typing makes these mandatory the moment the
union grows. Same two constraints as every greeting: must contain both names
(the override canary depends on it), must not assume the child's sex.

- **Hebrew:** `היי {child}! אני {agent}. שנשחק?` — "shall we play?" (שנשחק)
  sidesteps the gendered imperative בוא/בואי that the obvious "come, let's
  play" translation would force.
- **Tagalog:** `Hi {child}! Ako si {agent}. Maglaro tayo?` — Tagalog has no
  grammatical gender; "tayo" (inclusive we) is warm and neutral.
- **Ukrainian:** `Привіт, {child}! Я {agent}. Пограємо?` — same "shall we
  play?" shape as the Russian greeting, no gendered form.

### 3. UI string dictionary — `lib/i18n.ts` (new)

- A `UIStrings` type listing **every** user-facing string as a named key.
  Strings with interpolation are functions, mirroring how greetings work:
  `filledFromProfile: (child: string, fields: string) => string`.
- `const STRINGS: Record<Language, UIStrings>` — full translations for all
  seven languages. Missing key in any language = compile error.
- `LANGUAGE_META: Record<Language, { nativeName: string; dir: "ltr" | "rtl" }>`
  — the picker shows **native names** ("Українська", "עברית", "Español",
  "Tagalog"…) because the parent choosing their own language shouldn't need
  English to find it. `dir` is data here, not an `if (lang === "he")` scattered
  through components.
- `LANGUAGE_OPTIONS` moves conceptually unchanged: one list, derived from the
  same record that owns the greetings, so the picker and the teaching
  capability can never diverge (the bug the current comment in ConfigForm
  warns about).

Strings that live on the **server** (API route error messages like the voices
failure) stay English in the route and are mapped to dictionary keys on the
client where they are displayed. The server stays locale-unaware.

### 4. `LanguageProvider` + `useLanguage()` — `app/components/LanguageProvider.tsx` (new)

A client context that owns the global value:

- State initialised from `localStorage["ai-teacher:language"]` via a new
  `loadLanguage()` / `saveLanguage()` pair in `lib/browser-storage.ts`,
  following its existing degrade pattern: blocked storage reads as "not set"
  (default `en`), failed writes don't crash the picker. A stored value not in
  the union (corruption, future rollback) is treated as unset.
- Exposes `{ language, setLanguage, t }` where `t` is `STRINGS[language]`.
- An effect mirrors the choice onto the document:
  `document.documentElement.lang = language` and
  `document.documentElement.dir = LANGUAGE_META[language].dir`.
- Mounted in `app/layout.tsx` around `{children}`, so both the main page and
  the unlock page localize.

Known trade-off: the server-rendered HTML says `lang="en"` and English
strings, and swaps after hydration. For a local/parent-device app this flash
is acceptable; not worth an inline-script mitigation now.

### 5. Header with picker — `app/components/Header.tsx` (new)

Replaces the bare `<h1>AI Teacher</h1>` in `app/page.tsx`: the title plus a
compact `<select>` of native language names, wired to `useLanguage()`. The
same narrowing idiom as the current form field (look the string value up in
the options list rather than casting). Also rendered on the unlock page.

### 6. ConfigForm changes

- The Language `<select>` and its field block are **removed**.
- `DEFAULTS` keeps a `language` entry (the type requires one) but the value is
  irrelevant: at submit, `chosen = { ...config, voiceId, language }` takes the
  global value from `useLanguage()`.
- **Profile restore paths must not resurrect a stored language.** Old profiles
  in localStorage still contain `language`; both restore paths neutralize it:
  - `loadSaved()` skips the `language` key (like it already skips
    `childName`), so it is never "applied" nor named in the profile note.
  - `applyCard(p)` spreads the profile then overwrites `language` with the
    global value.
- `saveProfile` keeps saving whatever the session used — harmless, complete,
  and no migration needed.

### 7. Localized summary — `app/api/summarize/route.ts`

`buildSummaryPrompt` gains one line: `Write your answer in {languageName}.`
using the existing `languageName(config.language)`. The request already
carries the config; no API shape change.

### 8. RTL support

- `dir="rtl"` lands on `<html>` via the provider effect when Hebrew is picked.
- One audit pass over the CSS modules for physical `left`/`right`/`margin-left`
  style properties that break under RTL; convert offenders to logical
  properties (`margin-inline-start`, `inset-inline-end`, …). This is a
  targeted fix pass, not a wholesale rewrite.
- Font: Nunito has no Hebrew subset. Hebrew text falls back to the system
  font stack — acceptable; revisit with a Hebrew-capable font only if it
  looks bad in practice.

## What is NOT changing

- The system prompt itself stays written in English (models follow English
  instructions well; one prompt to maintain) — only the *spoken language*
  instruction inside it changes, exactly as today.
- The override canary (`lib/overrides.ts`) is language-agnostic already
  (NFKC + letter/digit normalization handles Hebrew and Cyrillic); no change.
- Server API routes stay locale-unaware.
- No URL/locale routing; the language is device state, like everything else.

## Error handling

- Blocked/unavailable localStorage: picker still works for the session
  (state in memory), persistence silently unavailable — same posture as
  profiles today.
- Corrupt stored language value: treated as unset, default `en`.
- A profile saved under the old scheme: its `language` is ignored by both
  restore paths; nothing to migrate.

## Testing

- `lib/prompt.test.ts`: extend the existing greeting tests to the three new
  languages — both names present (canary constraint), no gendered pronouns,
  and the built prompt names the right language.
- `lib/browser-storage.test.ts`: `loadLanguage`/`saveLanguage` — roundtrip,
  blocked store degrade, invalid stored value → null.
- `lib/i18n` completeness is compile-time enforced; no runtime test needed.
- ConfigForm behavior: profile with a different stored language + global
  setting → submitted config carries the global language, and the profile
  note never mentions "language".
- Manual pass: pick Hebrew, confirm RTL layout doesn't break the form,
  session view, or summary; confirm the greeting/subtitle flow in each new
  language.

## Implementation order

1. `lib/types.ts` union + `lib/prompt.ts` greetings (+ tests) — compile
   errors guide the rest.
2. `lib/i18n.ts` dictionary + `lib/browser-storage.ts` persistence (+ tests).
3. `LanguageProvider`, `Header`, layout/page wiring.
4. ConfigForm: remove field, inject global at submit, neutralize restore
   paths (+ tests).
5. Sweep every component's strings into the dictionary.
6. Summarize route line + test.
7. RTL CSS audit pass; manual verification.
