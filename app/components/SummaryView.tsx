"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SavedSession, SessionSummary } from "../../lib/types";

type Props = {
  session: Omit<SavedSession, "summary">;
  onFinish: () => void;
};

type SummarizeResponse = { summary?: SessionSummary | null; error?: string };

export default function SummaryView({ session, onFinish }: Props) {
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
        body: JSON.stringify(session),
      });
      // The route always returns JSON, even on failure (see route.ts) — but
      // a dev-server restart, a proxy, or some other layer in front of it
      // could still hand back a non-JSON body. Treat a parse failure the
      // same as any other "no summary" outcome rather than letting it throw
      // past this try, which would skip both setError and the `finally`
      // below and strand the parent on "Writing the summary…" forever.
      const data: SummarizeResponse = await res.json().catch(() => ({}) as SummarizeResponse);
      if (data.summary) setSummary(data.summary);
      else setError(data.error ?? "Could not write the summary. The transcript is saved.");
    } catch {
      // fetch() itself rejected — offline, dev server restarted mid-request,
      // etc. The transcript was already written to disk before this
      // component even mounted (SessionView's onDone only fires after the
      // session ends, and the summarize route writes-then-summarizes), so
      // it's safe to say so here.
      setError("Could not reach the server. The transcript is saved.");
    } finally {
      // Always runs, on every path (success, JSON error payload, unparsable
      // body, or a rejected fetch) — this is what guarantees the parent
      // never gets stuck on the loading state.
      setLoading(false);
    }
  }, [session]);

  // Fire the summarize request exactly once per mount. Next.js App Router
  // runs React StrictMode in dev, which double-invokes mount effects
  // (mount → simulated cleanup → mount again) on the *same* component
  // instance — refs survive that, state set up via useState does too, but
  // nothing before this guard did, so both passes used to call summarize().
  // That meant two Opus calls per session (billed twice) and a client-side
  // race recreating the duplicate-session-file bug: both requests could run
  // findSessionFile before either request's saveSession landed, so both saw
  // no existing file and both created one.
  //
  // `firedRef` is a plain useRef flag checked and set synchronously at the
  // top of the effect, before summarize() is ever called. The first effect
  // invocation sets it to true and fires; StrictMode's extra invocation
  // (and any real re-render that leaves `session` referentially unstable)
  // sees it already true and does nothing. The ref is not reset by
  // StrictMode's fake unmount/remount because it's the same fiber — this is
  // the standard fix for this exact class of bug, not a hack specific to
  // this component.
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
        <p>The transcript is saved either way.</p>
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
