"use client";

import { ConversationProvider, useConversation } from "@elevenlabs/react";
import type { Language } from "@elevenlabs/client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildFirstMessage, buildPrompt } from "../../lib/prompt";
import type { SavedSession, SessionConfig, SessionSummary, TranscriptTurn } from "../../lib/types";

type Props = {
  config: SessionConfig;
  onDone: (session: Omit<SavedSession, "summary">) => void;
};

// @elevenlabs/react's useConversation() throws unless it is called inside a
// ConversationProvider (see app history / task-1-report.md), so the exported
// component just sets up the provider and delegates to the real work below.
export default function SessionView({ config, onDone }: Props) {
  return (
    <ConversationProvider>
      <SessionInner config={config} onDone={onDone} />
    </ConversationProvider>
  );
}

function SessionInner({ config, onDone }: Props) {
  const [lastSummary, setLastSummary] = useState<SessionSummary | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptTurn[]>([]);
  const [secondsLeft, setSecondsLeft] = useState(config.minutes * 60);

  const startedAt = useRef<number>(0);
  const windDownSent = useRef(false);
  const finished = useRef(false);
  // Mirrors `transcript` so `finish()` can read a value that's always
  // up to date, even if it runs in the same batch as the state update for
  // the final turn (see `finish` below for why this matters).
  const transcriptRef = useRef<TranscriptTurn[]>([]);

  // Fetch the previous summary before we can build the prompt. The prompt
  // needs `config` (typed by the parent, client-side) and `lastSummary`
  // (on disk, server-side only) — so this fetch is the reason
  // GET /api/last-summary exists at all.
  useEffect(() => {
    fetch(`/api/last-summary?childName=${encodeURIComponent(config.childName)}`)
      .then((r) => r.json())
      .then((d) => setLastSummary(d.summary))
      .catch(() => setLastSummary(null))
      .finally(() => setReady(true));
  }, [config.childName]);

  const systemPrompt = useMemo(() => buildPrompt(config, lastSummary), [config, lastSummary]);

  // A dropped connection must not lose the session — whatever transcript we
  // have (possibly empty) is still handed to onDone, and the `finished` ref
  // guards against onDone firing twice (e.g. once from a manual "End
  // session" click's onDisconnect, and again from unmount cleanup).
  //
  // `finish` reads `transcriptRef.current`, not the `transcript` state
  // variable: if the agent's final message and the disconnect land in the
  // same React batch, `finish` can run before the state update for that
  // last turn has committed, which would silently drop it from the saved
  // session. `transcriptRef` is updated synchronously (see onMessage/start
  // below) alongside every `setTranscript` call, so it's always current by
  // the time `finish` reads it — no staleness, and no dependency on React's
  // batching order.
  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    onDone({
      config,
      transcript: transcriptRef.current,
      startedAt: new Date(startedAt.current).toISOString(),
      endedAt: new Date().toISOString(),
    });
  }, [config, onDone]);

  const conversation = useConversation({
    // Confirmed against node_modules/@elevenlabs/client/dist/types.d.ts:
    // `onMessage?: (props: MessagePayload) => void` where MessagePayload is
    // `{ message: string; event_id?: number; source: "user" | "ai" /* deprecated */; role: "user" | "agent" }`.
    // The brief guessed `source` ("ai"/"user"); the real, non-deprecated
    // field is `role` with values "agent" | "user", which is what we use.
    onMessage: (msg) => {
      const turn: TranscriptTurn = {
        role: msg.role === "agent" ? "agent" : "child",
        text: msg.message,
        at: Date.now() - startedAt.current,
      };
      // Keep the ref in sync with the state update so `finish()` always has
      // the complete transcript to hand to onDone, even under batching.
      transcriptRef.current = [...transcriptRef.current, turn];
      setTranscript((t) => [...t, turn]);
    },
    // Confirmed: onDisconnect receives a DisconnectionDetails object (never
    // zero args). It fires for every disconnect — user-initiated, agent
    // hangup, or transport error — so it's the single place that must call
    // finish(). On an actual error we also surface it to the parent so a
    // dropped connection reads as "the call ended unexpectedly", not silence.
    onDisconnect: (details) => {
      if (details.reason === "error") setError(details.message);
      finish();
    },
    // Confirmed against the same file: `onError?: (message: string, context?: any) => void`,
    // not `(error: Error) => void` as in the brief.
    onError: (message) => setError(message),
    overrides: {
      agent: {
        prompt: { prompt: systemPrompt },
        firstMessage: buildFirstMessage(config),
        // ConfigForm restricts `language` to a handful of ISO codes ("en",
        // "ru", "es", "de") that are all valid members of ElevenLabs'
        // Language union; the cast just narrows our app-level `string` to
        // that union, it does not change what value is actually sent.
        language: config.language as Language,
      },
      tts: { voiceId: config.voiceId },
    },
  });

  const start = useCallback(async () => {
    setError(null);
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("I need microphone permission to talk. Please allow it in your browser and try again.");
      return;
    }
    const res = await fetch("/api/signed-url");
    if (!res.ok) {
      setError("Could not start the session. Check your keys in .env.local.");
      return;
    }
    const { signedUrl } = await res.json();
    startedAt.current = Date.now();
    finished.current = false;
    transcriptRef.current = [];
    setTranscript([]);
    setSecondsLeft(config.minutes * 60);
    windDownSent.current = false;
    // Confirmed: startSession() returns void, not a Promise (it fires the
    // connection off internally and reports success/failure through the
    // onConnect/onError callbacks above) — so it is not awaited here.
    conversation.startSession({
      signedUrl,
      dynamicVariables: {
        agent_name: config.agentName,
        child_name: config.childName,
        child_age: config.childAge,
        goal: config.goal,
        minutes: config.minutes,
      },
    });
  }, [conversation, config]);

  // The clock. The model has no sense of time — at 80% elapsed (20%
  // remaining) we send a contextual update telling it to wrap up. This is
  // the only thing that makes the wind-down happen.
  //
  // Remaining time is derived from wall clock (Date.now() - startedAt.current
  // vs. config.minutes * 60_000) on every tick, not decremented from a
  // counter. A `setInterval(fn, 1000)` in a backgrounded tab is throttled by
  // the browser to roughly once a minute (and drifts even in the foreground)
  // — if we counted ticks, a parent who switches tabs mid-session would
  // stall the countdown, the wind-down would never fire, and the session
  // would run forever. Deriving from wall clock instead means every tick,
  // however late it lands, computes the *actual* remaining time: a tab
  // backgrounded for 3 minutes of a 10-minute session still crosses the
  // wind-down threshold (elapsed >= 80%) and the zero threshold at the true
  // wall-clock moments, so whichever tick fires next after the tab resumes
  // (or during it — throttled intervals still fire, just less often) reports
  // the correct state and reacts to it — nothing depends on how many ticks
  // actually ran.
  useEffect(() => {
    if (conversation.status !== "connected") return;
    let id: ReturnType<typeof setInterval> | null = null;
    const tick = () => {
      const totalMs = config.minutes * 60 * 1000;
      const remainingMs = Math.max(0, totalMs - (Date.now() - startedAt.current));
      setSecondsLeft(Math.ceil(remainingMs / 1000));
      if (!windDownSent.current && remainingMs <= totalMs * 0.2) {
        windDownSent.current = true;
        try {
          conversation.sendContextualUpdate(
            "Time is nearly up. Praise one specific thing she did today, then say a warm goodbye. Do not start anything new.",
          );
        } catch {
          // getConversation() (inside the SDK's sendContextualUpdate) throws
          // "No active conversation" if the conversation ref is already
          // null — e.g. the parent clicked "End session" in the same
          // second this tick landed, while `status` (a separate piece of
          // state) still read "connected". Nothing to wrap up in that case.
        }
      }
      if (remainingMs <= 0) {
        // Stop ticking once we've hit zero — otherwise endSession() (and,
        // if it ever raced past the guard above, the wind-down send) would
        // re-fire on every subsequent tick until `status` catches up and
        // tears this effect down.
        if (id !== null) clearInterval(id);
        conversation.endSession();
      }
    };
    id = setInterval(tick, 1000);
    return () => {
      if (id !== null) clearInterval(id);
    };
    // conversation.sendContextualUpdate/endSession are stable, memoized
    // references (see ConversationControlsProvider in the installed SDK),
    // so depending on them (rather than the whole `conversation` object,
    // which is a fresh literal every render) keeps this effect from
    // tearing down and restarting its interval on unrelated re-renders.
  }, [conversation.status, conversation.sendContextualUpdate, conversation.endSession, config.minutes]);

  if (!ready) return <p>Getting ready…</p>;

  const mins = Math.floor(secondsLeft / 60);
  const secs = String(secondsLeft % 60).padStart(2, "0");

  return (
    <section>
      <p>
        Status: {conversation.status} · {mins}:{secs} left
      </p>
      {error && <p style={{ color: "crimson" }}>{error}</p>}

      {conversation.status === "connected" ? (
        <button onClick={() => conversation.endSession()}>End session</button>
      ) : (
        <button onClick={start} disabled={conversation.status === "connecting"}>
          Start
        </button>
      )}

      <h2>Transcript</h2>
      <div style={{ maxHeight: 400, overflowY: "auto", border: "1px solid #ccc", padding: 12 }}>
        {transcript.length === 0 && <p style={{ color: "#888" }}>Nothing said yet.</p>}
        {transcript.map((turn, i) => (
          <p key={i}>
            <strong>{turn.role === "agent" ? config.agentName : config.childName}:</strong> {turn.text}
          </p>
        ))}
      </div>
    </section>
  );
}
