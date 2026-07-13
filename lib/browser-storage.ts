// lib/browser-storage.ts
import type { SavedSession, SessionConfig, SessionSummary } from "./types";

// Everything the parent's device remembers. There is no server-side store any
// more: Vercel's filesystem is read-only, and putting the child's transcripts
// on someone else's disk behind a public endpoint is worse than keeping them
// here. The cost is that history is per-device — clear the browser's data and
// it is gone.
//
// Every function takes an optional `store` so the tests can pass a fake; the
// app always omits it and gets the real localStorage.

const PROFILE_PREFIX = "ai-teacher:profile:";
const SESSION_PREFIX = "ai-teacher:session:";

function defaultStore(): Storage {
  return window.localStorage;
}

// Keys must be stable across sessions and safe as a key. Two different children
// must never collide (this was once a real bug with an ASCII-only slug: every
// Cyrillic name collapsed to the same value), so the name is encoded, not
// stripped.
function profileKey(childName: string): string {
  return PROFILE_PREFIX + encodeURIComponent(childName.trim().toLowerCase());
}

export function saveProfile(config: SessionConfig, store: Storage = defaultStore()): void {
  store.setItem(profileKey(config.childName), JSON.stringify(config));
}

export function loadProfile(childName: string, store: Storage = defaultStore()): SessionConfig | null {
  const raw = store.getItem(profileKey(childName));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionConfig;
  } catch {
    return null;
  }
}

function keysWithPrefix(prefix: string, store: Storage): string[] {
  const keys: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i);
    if (key?.startsWith(prefix)) keys.push(key);
  }
  return keys;
}

export function listProfiles(store: Storage = defaultStore()): SessionConfig[] {
  const profiles: SessionConfig[] = [];
  for (const key of keysWithPrefix(PROFILE_PREFIX, store)) {
    try {
      profiles.push(JSON.parse(store.getItem(key) ?? "") as SessionConfig);
    } catch {
      // One unreadable entry must not cost the parent every other child.
    }
  }
  return profiles;
}

// Returns the id the session was stored under. That id is the receipt: EndView
// holds it, and SummaryView uses it to attach the summary to this exact record.
export function saveSession(session: Omit<SavedSession, "summary">, store: Storage = defaultStore()): string {
  // endedAt alone is not unique — two sessions can land in the same
  // millisecond, and the old file-based store had to grow collision suffixes
  // for exactly that. A counter is simpler and cannot collide.
  let id = `${SESSION_PREFIX}${session.endedAt}`;
  let n = 1;
  while (store.getItem(id) !== null) id = `${SESSION_PREFIX}${session.endedAt}#${n++}`;

  const record: SavedSession = { ...session, summary: null };
  store.setItem(id, JSON.stringify(record));
  return id;
}

export function attachSummary(id: string, summary: SessionSummary, store: Storage = defaultStore()): void {
  const raw = store.getItem(id);
  if (!raw) return;
  try {
    const record = JSON.parse(raw) as SavedSession;
    store.setItem(id, JSON.stringify({ ...record, summary }));
  } catch {
    // A record we cannot parse is a record we must not overwrite with a
    // half-formed one.
  }
}

export function loadLatestSummary(childName: string, store: Storage = defaultStore()): SessionSummary | null {
  const wanted = childName.trim().toLowerCase();
  const sessions: SavedSession[] = [];
  for (const key of keysWithPrefix(SESSION_PREFIX, store)) {
    try {
      sessions.push(JSON.parse(store.getItem(key) ?? "") as SavedSession);
    } catch {
      // ignore an unreadable record
    }
  }
  const mine = sessions
    .filter((s) => s.summary !== null && s.config.childName.trim().toLowerCase() === wanted)
    .sort((a, b) => a.endedAt.localeCompare(b.endedAt));
  return mine.length > 0 ? (mine[mine.length - 1].summary as SessionSummary) : null;
}
