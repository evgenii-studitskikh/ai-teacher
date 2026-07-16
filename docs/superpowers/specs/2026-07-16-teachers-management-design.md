# Teachers Management & Quick-Start Flow — Design

**Date:** 2026-07-16
**Status:** Approved

## Problem

Starting a session today means filling the whole `ConfigForm` every time: child name, age, goal, directives, teacher name, voice, minutes. Repeat sessions should be a few clicks: **select kid → select teacher → adjust pre-filled details if needed → start**.

## Goals

- First-class **Kid** and **Teacher** entities with management UI (add/edit/delete).
- Teachers come in three flavors: **presets** (shipped in code), **custom** (parent-created), and **toy** (scanned POV toys, saved and reusable).
- Start screen pre-fills duration, goal, and additional instructions from the kid's previous session.
- Toy teachers get an automatically matched voice; an opt-in "Generate matching voice" upgrade uses ElevenLabs Voice Design.
- Repeat session = kid → teacher → Start (3 taps).

## Non-Goals

- No server-side storage; everything stays in localStorage (established constraint: Vercel FS is read-only, history is per-device).
- No change to `SessionView`, ElevenLabs overrides, or the first-message safety canary.
- No routing rewrite; the single-page stage machine remains.

## Data Model

New types in `lib/types.ts`:

```ts
export type Kid = {
  id: string;        // crypto.randomUUID()
  name: string;
  age: number;       // 2–12
  createdAt: string;
};

export type Teacher = {
  id: string;
  kind: "preset" | "custom" | "toy";
  name: string;
  voiceId: string | null;   // null = resolve automatically at start
  personality: string;      // free-form, woven into the prompt (English)
  toy?: ToyInfo;            // only for kind: "toy" (POV toys)
  createdAt: string;
};
```

`SessionConfig` keeps all existing fields with unchanged meaning; it is assembled at start time from kid + teacher + start-sheet fields. It gains two optional reference fields: `kidId`, `teacherId` (recorded into saved sessions; nothing downstream depends on them).

### Storage (localStorage, `lib/browser-storage.ts`)

| Key | Value |
|---|---|
| `ai-teacher:kid:<id>` | `Kid` |
| `ai-teacher:teacher:<id>` | `Teacher` (custom + toy only; presets live in code) |
| `ai-teacher:last-start:<kidId>` | `{ teacherId, goal, directives, minutes }` |

CRUD functions follow the existing profile/session function style. Corrupt or missing entries are skipped on list, matching current `listProfiles` behavior.

### Presets

Defined in `lib/preset-teachers.ts`, exactly 3 teachers: a warm generalist, a playful storyteller, and a patient math coach.

- Display names/descriptions are localized via `UIStrings` (compile-checked, 7 languages).
- Personalities are English prose (prompts are English-composed already) and are **not** in `UIStrings`.
- Presets do **not** hardcode `voiceId` (account voice lists vary); voice resolves at start via best match, guarded by the existing `resolveVoiceSelection` announced-substitution logic.
- Presets are immutable: "editing" one performs duplicate-on-edit, creating a custom copy.

### Migration

On first visit (guarded by a marker key, idempotent):

1. Each distinct child name in `ai-teacher:profile:*` becomes a `Kid` (name, age).
2. Each distinct `(agentName, voiceId)` pair becomes a custom `Teacher`.
3. Each profile's goal/directives/minutes (+ matching teacher id) seeds that kid's `last-start`.
4. Old profile keys are removed. A failure mid-migration leaves old profiles intact (marker is written last).

## Flow & Screens

The `Stage` union in `app/page.tsx` changes from mode-first to kid-first:

```
home (kid picker)
 → pickTeacher (teacher picker)
    ├─ preset/custom/toy teacher selected ───────────┐
    └─ "Scan a toy" card → toyScan → toyConfirm ─────┤ (creates/updates a toy teacher,
                                                     ▼  or attaches toy as context)
 → startSheet (duration / goal / instructions, pre-filled)
 → session → finished → end → summary
```

### Home = kid picker

- Cards for each saved kid (name, age) + an "Add kid" card with an inline name/age mini-form (no separate screen).
- A "Manage" affordance opens the management stage.
- Tapping a kid advances to the teacher picker.
- The old `ModePicker` (Lesson/Toy) is removed.

### Teacher picker

One grid, cards visually distinguished by flavor:

- **Preset teachers** — always present.
- **Custom teachers** — user-created.
- **Toy teachers** — previously scanned POV toys, reusable without re-scanning.
- **"Scan a toy"** card — runs the existing `ToyScan` → `ToyConfirm` flow, then asks the existing `toyMode` question (moved here): *toy is the teacher* vs *teacher helps play*.
  - **Be the toy (POV):** saves/updates a toy teacher (auto voice-matched) and selects it.
  - **Help me play:** returns to the teacher picker with the toy attached as session context; the parent then picks a regular teacher, and the toy info rides into the prompt exactly as third-person mode does today.

### Start sheet

- Compact header showing selected kid + teacher (tap to go back).
- Three fields pre-filled from `last-start:<kidId>`: **duration** (chips 5/10/15/20 + stepper), **goal** (text), **additional instructions** (textarea). All editable; if the pre-fill is right, Start is one tap.
- Language continues to come from the global header picker, injected at start.
- Voice resolution (wait/select/substitute) runs here before start, as today.

## Prompt Integration

`buildPrompt()` in `lib/prompt.ts` gains a persona block sourced from `teacher.personality`, following the `toyPersona()` pattern. It is woven in after the base "warm, playful teacher" framing. Empty personality = today's behavior, byte-for-byte unchanged intent. `agentName` still lands in `buildFirstMessage()`, so the ElevenLabs override canary keeps working untouched.

## Toy Voice

### Auto-match (default)

`POST /api/identify-toy` gains an optional input: the account's voice list (id + name + labels/description, from the existing `/api/voices` data). The vision model, already describing the toy, additionally returns a `suggestedVoiceId` — Zod-validated against the provided ids. It becomes the toy teacher's `voiceId`. Model can't pick / field missing → `voiceId: null` → normal default resolution. No new API route.

### Voice Design (opt-in upgrade)

New route `POST /api/design-voice` wrapping ElevenLabs' Voice Design API: takes the toy's description, generates and saves a voice to the account, returns the new `voiceId`, which is stored on the toy teacher.

- Exposed as a "Generate matching voice" button on the toy teacher's management card and on `ToyConfirm`.
- Explicitly opt-in: costs credits and consumes an account voice slot.
- Errors (slot limit, API failure) surface as a plain message; the toy keeps its best-match voice.
- If a generated voice later disappears from the account, `resolveVoiceSelection` handles announced substitution as today.

## Management UI

One `manage` stage reachable from home, two tabs: **Kids** and **Teachers** (shared component pattern, CSS modules).

- Rows edit inline; delete requires a confirm tap.
- Deleting a kid removes their `last-start`; saved sessions remain (independently keyed, historical).
- Deleting a teacher referenced by a kid's `last-start`: next start simply has no pre-selected teacher.
- Presets appear in the Teachers tab but only offer "Duplicate & edit".
- Toy teachers show their name/character and the "Generate matching voice" button.

## i18n

Every new parent-facing label (picker headings, "Add kid", "Scan a toy", tab names, preset display names/descriptions, voice-generation strings) goes into `UIStrings` — the `Record<Language, UIStrings>` shape forces all 7 translations at compile time. RTL comes free from the existing logical-CSS-properties convention.

## Error Handling

- Migration: idempotent, marker-guarded, old data left intact on failure.
- Storage: corrupt/missing entries skipped on list.
- Voice design: non-fatal; fall back to best-match voice with a visible message.
- Voice suggestion in identify-toy: invalid/missing → `null`, default resolution applies.

## Testing

Vitest, colocated as elsewhere in `lib/`:

- `lib/browser-storage.test.ts` — kid/teacher/last-start CRUD + migration (happy path, idempotency, corrupt entries).
- `lib/prompt.test.ts` — teacher-persona block present/absent; canary message unchanged.
- `lib/preset-teachers.test.ts` — presets are well-formed (non-empty personality, unique ids, no hardcoded voiceId).
- `app/api/identify-toy` test — `suggestedVoiceId` validated against provided list; absent list → no suggestion.

Component-level flow remains manually verified, as today.
