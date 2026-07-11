// lib/storage.ts
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SavedSession, SessionConfig, SessionSummary } from "./types";

// The data directory is resolved lazily (not cached in a module-level
// constant) so that it can be overridden per-process via DATA_DIR — this is
// what lets tests point storage at a throwaway temp directory instead of the
// real `data/` folder under the repo root. With no env var set, behavior is
// unchanged: `<cwd>/data`.
function dataDir(): string {
  return process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(process.cwd(), "data");
}
function profilesDir(): string {
  return path.join(dataDir(), "profiles");
}
function sessionsDir(): string {
  return path.join(dataDir(), "sessions");
}

// Unicode-aware, stable, filesystem-safe slug. Keeps letters/digits from any
// script (Cyrillic, Latin, etc.) so distinct non-Latin names don't collapse
// into the same slug. Only genuinely empty/unusable input (no letters or
// digits at all) falls back to "child". Must stay stable forever: changing
// the normalization would make previously saved files unreachable.
function slug(childName: string): string {
  const s = childName
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return s || "child";
}

export async function saveProfile(config: SessionConfig): Promise<void> {
  await mkdir(profilesDir(), { recursive: true });
  await writeFile(
    path.join(profilesDir(), `${slug(config.childName)}.json`),
    JSON.stringify(config, null, 2),
  );
}

export async function loadProfile(childName: string): Promise<SessionConfig | null> {
  try {
    const raw = await readFile(path.join(profilesDir(), `${slug(childName)}.json`), "utf8");
    return JSON.parse(raw) as SessionConfig;
  } catch {
    return null;
  }
}

function sessionBase(session: Pick<SavedSession, "config" | "endedAt">): string {
  const stamp = session.endedAt.replace(/[:.]/g, "-");
  return `${slug(session.config.childName)}--${stamp}`;
}

export async function saveSession(session: SavedSession): Promise<string> {
  await mkdir(sessionsDir(), { recursive: true });
  const base = sessionBase(session);
  const data = JSON.stringify(session, null, 2);

  // Two sessions can share an endedAt millisecond. Never let the second
  // write silently destroy the first: use an exclusive ("wx") write so an
  // existing file causes EEXIST instead of being overwritten, and on
  // collision fall back to `<base>-1.json`, `<base>-2.json`, etc. Because the
  // disambiguating suffix is only ever appended *after* the full timestamp
  // string, and only on an actual collision, lexicographic filename order
  // still matches chronological order for loadLatestSummary.
  let file = path.join(sessionsDir(), `${base}.json`);
  let n = 1;
  for (;;) {
    try {
      await writeFile(file, data, { flag: "wx" });
      return file;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "EEXIST") {
        file = path.join(sessionsDir(), `${base}-${n}.json`);
        n += 1;
        continue;
      }
      throw err;
    }
  }
}

// Deep structural equality over plain JSON-shaped values (objects, arrays,
// primitives) — everything a SavedSession is made of. Used to tell "this is
// the same session, saved again" apart from "this is a different session
// that happens to share the same childName+endedAt millisecond".
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  }
  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);
  return aKeys.length === bKeys.length && aKeys.every((k) => k in bObj && deepEqual(aObj[k], bObj[k]));
}

function sameSession(a: Omit<SavedSession, "summary">, b: SavedSession): boolean {
  return (
    a.startedAt === b.startedAt &&
    a.endedAt === b.endedAt &&
    deepEqual(a.config, b.config) &&
    deepEqual(a.transcript, b.transcript)
  );
}

// Finds the file (if any) that already holds this exact session — same
// config, transcript, startedAt and endedAt — regardless of what its
// `summary` field currently is. This is what lets a retried summarize
// request find and update the record it already wrote instead of creating a
// sibling `-1.json`: the match is on session *content*, not on a client-held
// id (the client has none — see app/api/summarize/route.ts), so it works
// across separate HTTP requests. It also naturally avoids matching a
// genuinely different session that happens to share an endedAt millisecond,
// because that session's transcript/config won't be equal.
export async function findSessionFile(session: Omit<SavedSession, "summary">): Promise<string | null> {
  let files: string[];
  try {
    files = await readdir(sessionsDir());
  } catch {
    return null;
  }
  const base = sessionBase(session);
  const pattern = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(-\\d+)?\\.json$`);
  for (const f of files.filter((f) => pattern.test(f)).sort()) {
    const full = path.join(sessionsDir(), f);
    const saved = JSON.parse(await readFile(full, "utf8")) as SavedSession;
    if (sameSession(session, saved)) return full;
  }
  return null;
}

// Attaches a summary to an already-saved session record, in place — this is
// the second half of the "write transcript, then attach summary" flow. It
// intentionally overwrites (no `wx`): the file at `filePath` is known to
// already be *this* session's record (found via saveSession's return value
// or findSessionFile), so there is no collision to guard against, only an
// update.
// Validates a session file path handed back to us by the client (the path
// POST /api/sessions returned when it wrote the transcript). Passing the known
// path through is cheaper and more exact than re-deriving it from the session
// *content* with findSessionFile — but it means a path now arrives from
// outside, so it is checked before use: it must resolve to a `.json` file
// directly inside the sessions directory, and it must exist. Anything else
// (traversal, a path in another directory, a file that has since been deleted)
// returns null, and the caller falls back to the content match. There is no
// path a client can supply that makes us read or write outside data/sessions.
export async function resolveSessionFile(filePath: string): Promise<string | null> {
  const full = path.resolve(filePath);
  if (path.dirname(full) !== sessionsDir()) return null;
  if (path.extname(full) !== ".json") return null;
  try {
    await readFile(full, "utf8");
    return full;
  } catch {
    return null;
  }
}

export async function attachSummary(filePath: string, summary: SessionSummary): Promise<void> {
  const raw = await readFile(filePath, "utf8");
  const saved = JSON.parse(raw) as SavedSession;
  saved.summary = summary;
  await writeFile(filePath, JSON.stringify(saved, null, 2));
}

export async function loadLatestSummary(childName: string): Promise<SessionSummary | null> {
  let files: string[];
  try {
    files = await readdir(sessionsDir());
  } catch {
    return null;
  }
  // Filenames embed an ISO timestamp, so lexicographic order is chronological order.
  const mine = files.filter((f) => f.startsWith(`${slug(childName)}--`)).sort();
  for (const f of mine.reverse()) {
    const saved = JSON.parse(await readFile(path.join(sessionsDir(), f), "utf8")) as SavedSession;
    if (saved.summary) return saved.summary;
  }
  return null;
}
