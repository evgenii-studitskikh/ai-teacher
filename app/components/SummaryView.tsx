"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SavedSession, SessionSummary } from "../../lib/types";

type Props = {
  session: Omit<SavedSession, "summary">;
  // The path the transcript was written to. Its presence is the proof that the
  // save succeeded: EndView does not mount this component until POST
  // /api/sessions has come back with a real path. That is what licenses every
  // "the transcript is saved" line below — this component can no longer be
  // reached in a state where that sentence is false.
  filePath: string;
  onFinish: () => void;
};

type SummarizeResponse = { summary?: SessionSummary | null; error?: string };

export default function SummaryView({ session, filePath, onFinish }: Props) {
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const summarize = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/summarize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // `filePath` tells the route exactly which record to attach the
        // summary to, so a retry updates that same file instead of matching by
        // content or (worse) writing a second one.
        body: JSON.stringify({ ...session, filePath }),
      });
      // The route always returns JSON, even on failure (see route.ts) — but
      // a dev-server restart, a proxy, or some other layer in front of it
      // could still hand back a non-JSON body. Treat a parse failure the
      // same as any other "no summary" outcome rather than letting it throw
      // past this try, which would skip both setError and the `finally`
      // below and strand the parent on "Writing the summary…" forever.
      const data: SummarizeResponse = await res.json().catch(() => ({}) as SummarizeResponse);
      if (data.summary) setSummary(data.summary);
      else setError(data.error ?? "Could not write the summary.");
    } catch {
      // fetch() itself rejected — offline, dev server restarted mid-request,
      // etc. Unlike before, this genuinely costs nothing but the summary: the
      // transcript was written by POST /api/sessions before this component was
      // ever mounted, and `filePath` above is the receipt for it.
      setError("Could not reach the server.");
    } finally {
      // Always runs, on every path (success, JSON error payload, unparsable
      // body, or a rejected fetch) — this is what guarantees the parent
      // never gets stuck on the loading state.
      setLoading(false);
    }
  }, [session, filePath]);

  // Fire the summarize request exactly once per mount. Next.js App Router
  // runs React StrictMode in dev, which double-invokes mount effects
  // (mount → simulated cleanup → mount again) on the *same* component
  // instance — refs survive that, state set up via useState does too, but
  // nothing before this guard did, so both passes used to call summarize().
  // That meant two Opus calls per session (billed twice) and a client-side
  // race recreating the duplicate-session-file bug.
  //
  // Retry is unaffected: the button below calls `summarize` directly, not
  // through this effect, so the guard never gates a user-initiated retry.
  const firedRef = useRef(false);
  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    summarize();
  }, [summarize]);

  if (loading) return <p>Writing the summary…</p>;

  if (error) {
    return (
      <section>
        <p style={{ color: "crimson" }}>{error}</p>
        {/* True by construction: see the `filePath` prop above. */}
        <p>
          The transcript is saved — <code>{filePath}</code>. Only the summary is missing, and the
          next session will simply start without one.
        </p>
        <button onClick={summarize}>Retry</button>
        <button onClick={onFinish}>Done</button>
      </section>
    );
  }

  if (!summary) return null;

  return (
    <section>
      <h2>How it went</h2>
      <p>{summary.whatWeDid}</p>
      <p>
        <strong>Confident with:</strong> {summary.grasped.join(", ") || "—"}
      </p>
      <p>
        <strong>Struggled with:</strong> {summary.struggled.join(", ") || "—"}
      </p>
      <p>
        <strong>Next time:</strong> {summary.nextFocus}
      </p>
      <p>
        <strong>Engagement:</strong> {summary.engagement}
      </p>
      {summary.transcriptQuality === "poor" && (
        <p style={{ color: "crimson" }}>
          Heads up: speech recognition struggled to understand {session.config.childName} this
          session. If this keeps happening, the transcripts are worth reading yourself.
        </p>
      )}
      <button onClick={onFinish}>Done</button>
    </section>
  );
}
