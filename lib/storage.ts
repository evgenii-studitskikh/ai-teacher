// lib/storage.ts
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SavedSession, SessionConfig, SessionSummary } from "./types";

const DATA = path.join(process.cwd(), "data");
const PROFILES = path.join(DATA, "profiles");
const SESSIONS = path.join(DATA, "sessions");

function slug(childName: string): string {
  return childName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "child";
}

export async function saveProfile(config: SessionConfig): Promise<void> {
  await mkdir(PROFILES, { recursive: true });
  await writeFile(
    path.join(PROFILES, `${slug(config.childName)}.json`),
    JSON.stringify(config, null, 2),
  );
}

export async function loadProfile(childName: string): Promise<SessionConfig | null> {
  try {
    const raw = await readFile(path.join(PROFILES, `${slug(childName)}.json`), "utf8");
    return JSON.parse(raw) as SessionConfig;
  } catch {
    return null;
  }
}

export async function saveSession(session: SavedSession): Promise<string> {
  await mkdir(SESSIONS, { recursive: true });
  const stamp = session.endedAt.replace(/[:.]/g, "-");
  const file = path.join(SESSIONS, `${slug(session.config.childName)}--${stamp}.json`);
  await writeFile(file, JSON.stringify(session, null, 2));
  return file;
}

export async function loadLatestSummary(childName: string): Promise<SessionSummary | null> {
  let files: string[];
  try {
    files = await readdir(SESSIONS);
  } catch {
    return null;
  }
  // Filenames embed an ISO timestamp, so lexicographic order is chronological order.
  const mine = files.filter((f) => f.startsWith(`${slug(childName)}--`)).sort();
  for (const f of mine.reverse()) {
    const saved = JSON.parse(await readFile(path.join(SESSIONS, f), "utf8")) as SavedSession;
    if (saved.summary) return saved.summary;
  }
  return null;
}
