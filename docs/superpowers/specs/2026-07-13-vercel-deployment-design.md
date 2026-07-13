# Running on Vercel — Design

**Date:** 2026-07-13
**Status:** Approved, ready for implementation planning

## Summary

The app was built local-only: it stores profiles, transcripts and summaries as
JSON files on disk, and it has no authentication because the only person who
could reach it was the parent, on their own laptop. It has now been deployed to
Vercel. Both of those assumptions are gone.

This moves persistence into the browser and puts a passcode in front of the
whole app.

## The two problems

**1. There is no disk.** Vercel's serverless filesystem is read-only. Saving a
session fails with `ENOENT: no such file or directory, mkdir '/var/task/data'`.
(`/tmp` is writable but wiped between invocations, so it is not storage.) The
app correctly tells the parent the transcript was NOT saved — the failure path
works; there is simply nowhere to write.

**2. The deployment is public and unauthenticated.** Verified against the live
URL: `GET /api/signed-url` returns 200 to an anonymous request, so anyone who
finds the URL can open voice sessions on the owner's ElevenLabs account, on
their bill. `GET /api/profiles/list` returns JSON; once storage works it would
publish the children's names, ages and the parent's private notes about them to
anyone who asks, as would their lesson transcripts.

The previous spec's non-goals said, in as many words: *"No accounts, auth, or
multi-tenancy. No deployment — runs locally."* Deploying silently deleted the
assumption every other safety property rested on.

## Decisions

### Persistence moves to the browser

Profiles, saved sessions and summaries live in the browser's local storage on
the parent's device. The server becomes stateless.

Chosen over provisioning a database (Vercel Blob / Postgres / KV) because:

- It works on the next deploy — nothing to provision, no new service, no bill.
- The child's transcripts stay on the parent's own device rather than on a
  third party's disk behind an endpoint that lists them.
- It **removes** the `/api/profiles/list` exposure rather than guarding it: the
  server no longer holds the child's data at all, so there is nothing there to
  leak.

**The cost, accepted knowingly:** history is per-device and per-browser. Clearing
site data loses it. The phone and the laptop do not share a history.

### A passcode gate

Middleware in front of every page and every API route. An unauthenticated
request is bounced to a passcode screen; the passcode is a Vercel environment
variable. No dependencies.

This is what stops a stranger spending the owner's ElevenLabs minutes and
Anthropic credits. Vercel's own Password Protection would do the same with no
code, but it is a paid feature.

### The server keeps exactly two jobs

Both need a secret the browser must never hold:

- `POST /api/signed-url` — mint a short-lived ElevenLabs session URL.
- `POST /api/summarize` — call Claude (`claude-opus-4-8`) over a transcript and
  return the summary. It **returns** the summary; it no longer writes it.

`GET /api/voices` stays (it needs the ElevenLabs key). Everything that touched
disk goes.

## Architecture

### What is deleted

- `lib/storage.ts` and its filesystem tests — nothing on the server persists.
- `GET /api/profiles` and `POST /api/profiles`
- `GET /api/profiles/list`
- `GET /api/last-summary`
- `POST /api/sessions`

### What replaces it

`lib/browser-storage.ts` — the same shape as the old storage layer, backed by
`localStorage`, running on the client:

```ts
saveProfile(config: SessionConfig): void
loadProfile(childName: string): SessionConfig | null
listProfiles(): SessionConfig[]
saveSession(session: SavedSession): string       // returns a session id
attachSummary(id: string, summary: SessionSummary): void
loadLatestSummary(childName: string): SessionSummary | null
```

It is a pure module over an injectable `Storage`, so it is testable in vitest's
`node` environment with a fake — no jsdom required.

### The flow, after the change

1. `SessionView` reads the last summary from local storage (no fetch) and builds
   the prompt.
2. The session runs, exactly as now.
3. On finish, `EndView` writes the transcript to local storage **first**, and
   only then POSTs it to `/api/summarize`.
4. The summary comes back and is attached to the stored session.

The invariant that was fixed after a real bug survives intact: **the transcript
is persisted before Claude is called, and the parent is only told it is saved
once it actually is.** The only thing that changes is that "persisted" now means
local storage rather than a file on disk. Local storage is synchronous and
cannot fail the way a network call can, which makes that guarantee stronger,
not weaker.

### The passcode

`middleware.ts` matches every route except the passcode page and Next's static
assets. It checks a signed cookie; without it, a page request redirects to
`/unlock` and an API request gets a 401. `/api/unlock` compares the submitted
passcode against `APP_PASSCODE` and sets the cookie.

The comparison is constant-time, the cookie is `httpOnly`, `secure`,
`sameSite=lax`. If `APP_PASSCODE` is unset the middleware **denies everything**
rather than falling open — a missing env var must not silently unlock the app.

## Constraints carried over

- The Claude model id stays exactly `claude-opus-4-8`.
- `ELEVENLABS_API_KEY` and `ANTHROPIC_API_KEY` remain server-side only.
- The override canary, the wall-clock timer and the wind-down are untouched.
- The two alarms stay severe.
- `lib/prompt.ts` is untouched.

## Non-goals

No accounts, no per-user data, no multi-tenancy, no sharing history across
devices, no database. One family, one passcode.

## Testing

- `lib/browser-storage.ts` gets unit tests against a fake `Storage`
  (round-trip; empty states; a corrupt entry does not take down the list;
  save-then-attach-summary yields one record; the latest summary for a child is
  the newest one).
- The passcode check (constant-time compare, missing-env denial) is a pure
  function and gets tests.
- `lib/prompt.ts` and `lib/overrides.ts` tests are untouched and must still pass.
