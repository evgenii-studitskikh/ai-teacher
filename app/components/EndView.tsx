"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import SummaryView from "./SummaryView";
import type { SavedSession } from "../../lib/types";
import styles from "./SummaryView.module.css";

type Props = {
  session: Omit<SavedSession, "summary">;
  onFinish: () => void;
};

type SaveState =
  | { status: "saving" }
  | { status: "saved"; filePath: string }
  | { status: "failed"; message: string };

type SaveResponse = { filePath?: string | null; error?: string };

// Everything that happens after the child stops talking, in the one order that
// is safe: **save the transcript, then summarize it.**
//
// The old flow had no save step of its own — the transcript's only disk write
// lived inside the summarize route. So when the summarize fetch failed at the
// network level (the dev server restarting mid-request is enough), the route
// had never run, nothing had been written, and the UI nevertheless told the
// parent "the transcript is saved either way" and offered a Done button that
// dropped the session. The lesson was gone and the parent had been told it
// wasn't.
//
// Here the save is a step with its own state, and it gates everything after
// it. SummaryView is not even mounted until a save has actually succeeded and
// returned a real path — which is what makes its "the transcript is saved"
// copy true by construction, rather than by hopeful assumption. If the save
// fails, this component says so in the strongest terms it has, and offers only
// a retry: there is deliberately no way to leave this screen while the
// transcript is unsaved.
export default function EndView({ session, onFinish }: Props) {
  const [state, setState] = useState<SaveState>({ status: "saving" });

  const save = useCallback(async () => {
    setState({ status: "saving" });
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(session),
      });
      const data: SaveResponse = await res.json().catch(() => ({}) as SaveResponse);
      if (res.ok && data.filePath) {
        setState({ status: "saved", filePath: data.filePath });
      } else {
        setState({ status: "failed", message: data.error ?? `The server refused the save (HTTP ${res.status}).` });
      }
    } catch {
      // fetch() itself rejected: the request never reached the server, so
      // nothing was written. This is precisely the case the old code lied
      // about.
      setState({ status: "failed", message: "Could not reach the server — the request never got there." });
    }
  }, [session]);

  // Fire the save exactly once per mount. React StrictMode double-invokes
  // mount effects in dev; a ref checked synchronously (not state, which would
  // not have committed yet) is what keeps that from firing two saves. A retry
  // goes through the button, which calls `save` directly and is unaffected.
  const firedRef = useRef(false);
  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    save();
  }, [save]);

  if (state.status === "saving") return <p className={styles.status}>Saving the transcript…</p>;

  if (state.status === "failed") {
    return (
      <section className={styles.screen}>
        {/* The instruction that prevents the loss lives INSIDE the alert.
            It used to sit outside it, so a screen-reader parent heard the
            alarm ("The transcript is NOT saved") but not the one sentence that
            tells them what not to do about it — "Do not close or reload the
            tab". A live region announces its own subtree and nothing else, so
            the fix is simply that this paragraph is now part of it. The copy is
            unchanged, and .note keeps its own plain colour so the paragraph
            still reads as instruction rather than as more alarm. */}
        <div className={styles.error} role="alert">
          <h2>The transcript is NOT saved</h2>
          <p>{state.message}</p>
          <p className={styles.note}>
            This lesson is still in this browser tab and nowhere else. Do not close or reload the tab
            — that would lose it for good. Check that the app&apos;s server (<code>npm run dev</code>) is
            still running, then retry.
          </p>
        </div>
        {/* Deliberately no "Done" button here: the only thing this screen can
            offer while the session is unsaved is a way to save it. */}
        <div className={styles.actionsBar}>
          <div className={styles.actions}>
            <button className={styles.primaryBtn} onClick={save}>
              Retry saving
            </button>
          </div>
        </div>
      </section>
    );
  }

  return <SummaryView session={session} filePath={state.filePath} onFinish={onFinish} />;
}
