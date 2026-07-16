"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import SummaryView from "./SummaryView";
import { saveSession } from "../../lib/browser-storage";
import type { SavedSession } from "../../lib/types";
import styles from "./SummaryView.module.css";
import { useLanguage } from "./LanguageProvider";

type Props = {
  session: Omit<SavedSession, "summary">;
  onFinish: () => void;
};

type SaveState =
  | { status: "saving" }
  | { status: "saved"; sessionId: string }
  | { status: "failed"; message: string };

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
// returned a real id — which is what makes its "the transcript is saved"
// copy true by construction, rather than by hopeful assumption. If the save
// fails, this component says so in the strongest terms it has, and offers only
// a retry: there is deliberately no way to leave this screen while the
// transcript is unsaved.
//
// The save itself moved from a fetch to localStorage (see
// lib/browser-storage.ts): it is synchronous and cannot fail the way a
// network call can (no dropped connection, no server restart mid-request) —
// but it CAN throw (Safari private mode, a full quota), so the same
// save/failed/retry shape still applies, just around a try/catch instead of
// a fetch.
export default function EndView({ session, onFinish }: Props) {
  const { t } = useLanguage();
  const [state, setState] = useState<SaveState>({ status: "saving" });

  const save = useCallback(() => {
    setState({ status: "saving" });
    try {
      const sessionId = saveSession(session);
      setState({ status: "saved", sessionId });
    } catch (e) {
      // localStorage throws when it is full or disabled (Safari private
      // mode) — this is precisely the case the old code lied about.
      setState({
        status: "failed",
        message: e instanceof Error ? e.message : t.browserRefusedSave,
      });
    }
  }, [session, t]);

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

  if (state.status === "saving") return <p className={styles.status}>{t.savingTranscript}</p>;

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
          <h2>{t.transcriptNotSaved}</h2>
          <p>{state.message}</p>
          <p className={styles.note}>{t.doNotCloseTab}</p>
        </div>
        {/* Deliberately no "Done" button here: the only thing this screen can
            offer while the session is unsaved is a way to save it. */}
        <div className={styles.actionsBar}>
          <div className={styles.actions}>
            <button className={styles.primaryBtn} onClick={save}>
              {t.retrySaving}
            </button>
          </div>
        </div>
      </section>
    );
  }

  return <SummaryView session={session} sessionId={state.sessionId} onFinish={onFinish} />;
}
