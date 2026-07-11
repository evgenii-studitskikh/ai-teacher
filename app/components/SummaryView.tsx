"use client";

import { useCallback, useEffect, useState } from "react";
import type { SavedSession, SessionSummary } from "../../lib/types";

type Props = {
  session: Omit<SavedSession, "summary">;
  onFinish: () => void;
};

export default function SummaryView({ session, onFinish }: Props) {
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const summarize = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/summarize", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(session),
    });
    const data = await res.json();
    setLoading(false);
    if (data.summary) setSummary(data.summary);
    else setError(data.error ?? "Could not write the summary. The transcript is saved.");
  }, [session]);

  useEffect(() => {
    // Fire the summarize request once when the view mounts. `summarize` sets
    // `loading` synchronously before its first `await`, which the newer
    // react-hooks/set-state-in-effect rule flags — but this is the ordinary
    // fetch-on-mount pattern (also used by SessionView's last-summary fetch)
    // and there is no external system to subscribe to instead.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
          Heads up: speech recognition struggled to understand her this session. If this
          keeps happening, the transcripts are worth reading yourself.
        </p>
      )}
      <button onClick={onFinish}>Done</button>
    </section>
  );
}
