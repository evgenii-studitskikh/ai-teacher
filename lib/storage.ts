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

export async function saveSession(session: SavedSession): Promise<string> {
  await mkdir(sessionsDir(), { recursive: true });
  const stamp = session.endedAt.replace(/[:.]/g, "-");
  const base = `${slug(session.config.childName)}--${stamp}`;
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
