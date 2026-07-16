// Runtime canary for "are the ElevenLabs overrides actually in effect?".
//
// Everything that makes this app safe for a small child — the system prompt
// with its guardrails, the first message, the language, the voice — is sent to
// ElevenLabs as a session *override*. If the agent's dashboard Security
// settings do not have those four overrides enabled, ElevenLabs silently
// ignores all of them: no error, no warning. The child then talks to the raw
// default agent, with no guardrails at all.
//
// The one thing we can observe from the client is the agent's *first* turn.
// It is override-controlled: when overrides are on, it is exactly the string
// `buildFirstMessage(config)` produced. When they are off, it is the
// dashboard's own default greeting (or something the raw model invented),
// which does not contain the child's name or the agent's name. So: compare
// the first agent turn to what we asked for. If it doesn't match, overrides
// are off — abort the session immediately. Fail closed.
//
// The comparison must be tolerant, because the text that comes back over the
// message channel is not guaranteed to be byte-identical to what we sent:
// punctuation can be normalized, an apostrophe can come back as a typographic
// one, whitespace can differ, TTS-driven text normalization can reshape
// surface characters. So we compare on *content words*, not characters:
//
//   1. Normalize: NFKC, lowercase, drop everything that is not a letter or a
//      digit, collapse whitespace. This alone erases every difference of
//      case, punctuation, quote style and spacing.
//   2. Require the two proper nouns — the child's name and the agent's name —
//      to appear. They are the load-bearing part: our first message always
//      contains both, and no default greeting written by anyone else contains
//      *this* child's name. This is what stops a dashboard default that merely
//      *looks* like ours ("Hi! Are you ready to play?", a leftover from manual
//      testing) from scoring high on shape alone and waving an unguarded agent
//      through. Nothing in TTS text normalization deletes a proper noun.
//   3. Then accept on wording: either normalized string containing the other
//      (a prefix/suffix added, or the message arriving truncated), or a Dice
//      coefficient over the word sets of >= 0.6.
//
// The gap the threshold has to straddle is enormous, which is why it is safe:
// a genuinely-overridden first message normalizes to *exactly* the expected
// string (score 1.0), while a default-agent greeting shares only filler words
// like "i" / "you" and never the two proper nouns (score well under 0.3, and
// blocked at step 2 regardless). There is no realistic text normalization that
// turns a 1.0 into a 0.6.

export function normalizeSpokenText(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function diceCoefficient(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const remaining = [...b];
  let shared = 0;
  for (const word of a) {
    const i = remaining.indexOf(word);
    if (i !== -1) {
      shared += 1;
      remaining.splice(i, 1);
    }
  }
  return (2 * shared) / (a.length + b.length);
}

const SIMILARITY_THRESHOLD = 0.6;

/**
 * True when `received` (the first agent turn we actually heard) is plausibly
 * the same utterance as `expected` (the first message we sent as an override).
 * False means the overrides were ignored and the session must be aborted.
 *
 * `mustMention` are the proper nouns the expected message is built from — the
 * child's name and the agent's name. Every one of them must appear in the
 * received text.
 *
 * An empty `received` (or `expected`) is NOT treated as a match. It used to
 * be, on the theory that "we cannot judge an empty string, and aborting a
 * session on one would be a false positive" — but that reasoning only holds
 * if an empty string can never reach here as the thing being judged as *the*
 * first turn. It can: ElevenLabs turns can arrive interrupted or
 * zero-length, and if the caller treats receiving one as "the first turn has
 * been checked", an empty turn silently consumes the one-shot canary and the
 * real first turn — the one that would have exposed a disabled override —
 * is never checked again for the rest of the session. So this function
 * always fails closed on empty input; the caller (SessionView.tsx) is
 * responsible for not invoking it, and not consuming the one-shot flag,
 * until there is a non-empty agent turn to judge. An interrupted/empty first
 * turn is skipped entirely and the next non-empty agent turn is the one
 * actually checked.
 */
export function firstMessageMatches(expected: string, received: string, mustMention: string[] = []): boolean {
  const e = normalizeSpokenText(expected);
  const r = normalizeSpokenText(received);
  if (e.length === 0 || r.length === 0) return false;

  for (const mention of mustMention) {
    const m = normalizeSpokenText(mention);
    if (m.length > 0 && !r.includes(m)) return false;
  }

  if (r.includes(e) || e.includes(r)) return true;
  return diceCoefficient(e.split(" "), r.split(" ")) >= SIMILARITY_THRESHOLD;
}
