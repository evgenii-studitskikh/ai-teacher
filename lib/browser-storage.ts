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

// A store that behaves as if storage exists but is entirely blocked: reads
// see it as empty (so the app opens exactly as it would on a brand-new
// browser, with no history), and every mutation throws (so a caller that
// tries to save something load-bearing — a transcript, a profile — finds
// out immediately, instead of being told a write succeeded when nothing was
// stored). Silently swallowing a write here would be the same lie EndView
// exists to prevent, just moved one layer down.
function blockedStore(): Storage {
  const fail = (): never => {
    throw new Error("Storage is blocked by your browser settings.");
  };
  return {
    get length() {
      return 0;
    },
    clear: fail,
    getItem: () => null,
    key: () => null,
    removeItem: fail,
    setItem: fail,
  };
}

function defaultStore(): Storage {
  try {
    // Merely accessing this getter — not calling any method on it — throws
    // a SecurityError in Chrome/Edge with "block all site data" (and
    // equivalent policies elsewhere). That throw happens while evaluating a
    // function's default parameter, which runs BEFORE that function's own
    // try/catch, so every call site downstream needs this caught here, at
    // the point of access, or none of the read-side degrading below ever
    // gets a chance to run.
    return window.localStorage;
  } catch {
    return blockedStore();
  }
}

// Keys must be stable across sessions and safe as a key. Two different children
// must never collide (this was once a real bug with an ASCII-only slug: every
// Cyrillic name collapsed to the same value), so the name is encoded, not
// stripped.
//
// The name is also Unicode-normalised (NFC) before case-folding. Without
// this, a name typed on one device as a single composed codepoint (e.g. "й",
// U+0439) and the same name typed on another device as a base letter plus a
// combining mark (U+0438 U+0306) are visually identical but are different
// strings — the child would silently fragment into two profiles.
function normalizeChildName(childName: string): string {
  return childName.trim().normalize("NFC").toLowerCase();
}

function profileKey(childName: string): string {
  return PROFILE_PREFIX + encodeURIComponent(normalizeChildName(childName));
}

export function saveProfile(config: SessionConfig, store: Storage = defaultStore()): void {
  store.setItem(profileKey(config.childName), JSON.stringify(config));
}

export function loadProfile(childName: string, store: Storage = defaultStore()): SessionConfig | null {
  let raw: string | null;
  try {
    raw = store.getItem(profileKey(childName));
  } catch {
    // Storage access itself failed (Safari private mode, storage disabled by
    // policy, ...). A read must degrade, not crash the config screen.
    return null;
  }
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionConfig;
  } catch {
    return null;
  }
}

function keysWithPrefix(prefix: string, store: Storage): string[] {
  const keys: string[] = [];
  try {
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (key?.startsWith(prefix)) keys.push(key);
    }
  } catch {
    // Storage access itself failed. Callers treat an empty key list the same
    // as "nothing saved yet", which is the correct degrade for a read.
    return [];
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
  // JSON.parse and store.setItem are deliberately NOT in the same try: a
  // record we cannot parse is a record we must not overwrite with a
  // half-formed one, so that failure is swallowed — but a failure to WRITE
  // (quota exceeded, storage disabled mid-session) must propagate. Catching
  // both in one block used to silently eat a full-quota SUMMARY save: the
  // caller (SummaryView) got no exception, assumed the summary was safely
  // attached, and never told the parent their history would not carry over.
  let record: SavedSession;
  try {
    record = JSON.parse(raw) as SavedSession;
  } catch {
    return;
  }
  store.setItem(id, JSON.stringify({ ...record, summary }));
}

export function loadLatestSummary(childName: string, store: Storage = defaultStore()): SessionSummary | null {
  const wanted = normalizeChildName(childName);
  const sessions: SavedSession[] = [];
  for (const key of keysWithPrefix(SESSION_PREFIX, store)) {
    try {
      sessions.push(JSON.parse(store.getItem(key) ?? "") as SavedSession);
    } catch {
      // ignore an unreadable record
    }
  }
  const mine = sessions
    .filter((s) => s.summary !== null && normalizeChildName(s.config.childName) === wanted)
    // Plain lexicographic comparison, not localeCompare: this is
    // machine-generated ISO-8601 timestamp data, not human-language text, and
    // a locale collator is not guaranteed to sort it byte-for-byte in order.
    .sort((a, b) => (a.endedAt < b.endedAt ? -1 : a.endedAt > b.endedAt ? 1 : 0));
  return mine.length > 0 ? (mine[mine.length - 1].summary as SessionSummary) : null;
}
