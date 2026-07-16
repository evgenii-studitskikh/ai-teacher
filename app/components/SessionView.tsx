"use client";

import { ConversationProvider, useConversation } from "@elevenlabs/react";
import type { Language } from "@elevenlabs/client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadLatestSummary } from "../../lib/browser-storage";
import { firstMessageMatches, normalizeSpokenText } from "../../lib/overrides";
import { buildFirstMessage, buildPrompt, buildWindDownMessage } from "../../lib/prompt";
import type { SavedSession, SessionConfig, SessionSummary, TranscriptTurn } from "../../lib/types";
import { useLanguage } from "./LanguageProvider";
import styles from "./SessionView.module.css";

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
  const { t } = useLanguage();
  const [lastSummary, setLastSummary] = useState<SessionSummary | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptTurn[]>([]);
  const [secondsLeft, setSecondsLeft] = useState(config.minutes * 60);
  // True when the override canary tripped (see onMessage): the session was
  // aborted because the agent was not running our configuration. The message
  // shown for it comes from the dictionary at render time, so it follows the
  // header's language even if the parent switches after the alarm fired.
  const [overridesDisabled, setOverridesDisabled] = useState(false);

  const startedAt = useRef<number>(0);
  const windDownSent = useRef(false);
  const finished = useRef(false);
  // The override canary only has one shot: the *first* agent turn is the one
  // ElevenLabs takes verbatim from the `firstMessage` override. Everything
  // after it is model-generated and proves nothing.
  const firstAgentTurnSeen = useRef(false);
  // Lets onMessage hang up (see the canary there) without naming the
  // `conversation` object it is itself being passed into.
  const endSessionRef = useRef<(() => void) | null>(null);
  // Mirrors `transcript` so `finish()` can read a value that's always
  // up to date, even if it runs in the same batch as the state update for
  // the final turn (see `finish` below for why this matters).
  const transcriptRef = useRef<TranscriptTurn[]>([]);

  // Load the previous summary before we can build the prompt. The prompt
  // needs `config` (typed by the parent, client-side) and `lastSummary`
  // (in localStorage, browser-side only). `loadLatestSummary` is
  // synchronous, but localStorage does not exist during the server render,
  // so the read still has to happen inside an effect rather than at render
  // time.
  //
  // react-hooks/set-state-in-effect flags this as a synchronous setState in
  // an effect and suggests useSyncExternalStore instead — the right tool for
  // an external store in general, but not this one: loadLatestSummary()
  // returns a freshly-parsed object on every call, so getSnapshot would never
  // return a referentially-stable value and React would warn about (or loop
  // on) "the result of getSnapshot should be cached". There is also no
  // subscription to offer — localStorage does not push change events for
  // same-tab writes — so this is a plain one-shot client-only read, which is
  // exactly what an effect is for.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLastSummary(loadLatestSummary(config.childName));
    setReady(true);
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
      // ---- Override canary -------------------------------------------------
      // The system prompt (with every guardrail in it), the first message, the
      // language and the voice are all sent as ElevenLabs *overrides*. If the
      // agent's dashboard Security settings don't have overrides enabled,
      // ElevenLabs silently ignores all four and the child ends up talking to
      // the raw default agent: no guardrails, no "ask your mum or dad", wrong
      // voice, wrong persona — and, until now, no error anywhere.
      //
      // The first agent turn is the observable that tells us which world we're
      // in: with overrides on it is exactly `buildFirstMessage(config)`; with
      // them off it's the dashboard's own greeting, which contains neither the
      // child's name nor the agent's. The comparison is deliberately tolerant
      // (see lib/overrides.ts) so that punctuation, casing and TTS text
      // normalization cannot trip it.
      //
      // On a mismatch we fail closed: end the call at once and hold the parent
      // on this screen with an actionable error, rather than handing the child
      // to an unguarded LLM. The aborted session is intentionally *not* passed
      // to onDone — it is one meaningless turn, and advancing to the summary
      // screen would bury the very message the parent needs to read.
      //
      // The canary has exactly one shot (`firstAgentTurnSeen`), and ElevenLabs
      // turns can legitimately arrive interrupted or zero-length. If we marked
      // the flag on *any* agent turn — including an empty one — a zero-length
      // first turn would consume the one shot, trivially "match" (there is
      // nothing to compare), and the actual first spoken turn would never be
      // checked again for the rest of the session: a disabled override would
      // go undetected. So the flag is only set once there is a non-empty agent
      // turn to judge; an empty one is ignored for canary purposes and the
      // *next* non-empty agent turn is the one that gets checked.
      if (msg.role === "agent" && !firstAgentTurnSeen.current && normalizeSpokenText(msg.message).length > 0) {
        firstAgentTurnSeen.current = true;
        const ours = firstMessageMatches(buildFirstMessage(config), msg.message, [
          config.childName,
          config.agentName,
        ]);
        if (!ours) {
          finished.current = true; // makes finish() (via onDisconnect) a no-op
          setOverridesDisabled(true);
          // Hang up through a ref, not through the `conversation` object this
          // very call is initializing: referring to it from inside its own
          // callback makes the React compiler treat this closure as
          // render-phase code (it then flags the pre-existing `Date.now()`
          // below as an impure render call). The ref is filled in by the
          // effect right underneath and is always current by the time a
          // message can arrive — a message can only arrive once connected.
          endSessionRef.current?.();
          return;
        }
      }

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
      // Nothing was ever said, so there is no lesson to save or summarize.
      // Advancing anyway would unmount this component — and with it the error
      // we just set — leaving the parent on a summary screen for an empty
      // session with no clue why it never started. This is exactly what a
      // rejected override looks like: ElevenLabs accepts the socket, reads our
      // conversation_initiation_client_data, and closes with code 1008 and a
      // message naming the offending field, all before a word is spoken.
      // Staying put keeps that message on screen, where it is the entire fix.
      if (transcriptRef.current.length === 0) return;
      finish();
    },
    // Confirmed against the same file: `onError?: (message: string, context?: any) => void`,
    // not `(error: Error) => void` as in the brief.
    onError: (message) => setError(message),
    overrides: {
      agent: {
        prompt: { prompt: systemPrompt },
        firstMessage: buildFirstMessage(config),
        // The app-level `Language` union (LANGUAGE_CODES in lib/types.ts,
        // chosen via the header picker) contains only valid members of
        // ElevenLabs' Language union; the cast just narrows our app-level
        // string to that union, it does not change what value is actually
        // sent.
        language: config.language as Language,
      },
      tts: { voiceId: config.voiceId },
    },
  });

  useEffect(() => {
    endSessionRef.current = () => conversation.endSession();
  }, [conversation.endSession, conversation]);

  const start = useCallback(async () => {
    setError(null);
    setOverridesDisabled(false);
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError(t.micPermission);
      return;
    }
    // POST, not GET: the route re-tunes the agent's ASR for this session
    // (keyword biasing needs the child/agent/toy names) before minting the
    // signed URL. `config` is already in scope — it drives the overrides below.
    const res = await fetch("/api/signed-url", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(config),
    });
    if (!res.ok) {
      setError(t.couldNotStart);
      return;
    }
    const { signedUrl } = await res.json();
    startedAt.current = Date.now();
    finished.current = false;
    firstAgentTurnSeen.current = false;
    transcriptRef.current = [];
    setTranscript([]);
    setSecondsLeft(config.minutes * 60);
    windDownSent.current = false;
    // Confirmed: startSession() returns void, not a Promise (it fires the
    // connection off internally and reports success/failure through the
    // onConnect/onError callbacks above) — so it is not awaited here.
    //
    // No `dynamicVariables` here: nothing consumes them. buildPrompt/
    // buildFirstMessage interpolate the config into the strings we send as
    // overrides, so there are no `{{placeholders}}` left for ElevenLabs to
    // fill in. Sending them anyway was dead weight that read as if the agent
    // depended on them.
    conversation.startSession({ signedUrl });
  }, [conversation, config, t]);

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
          // The wind-down text lives in lib/prompt.ts alongside the system
          // prompt: it steers what the agent says out loud to the child, so it
          // is held to the same rule — the child's name, never a pronoun.
          conversation.sendContextualUpdate(buildWindDownMessage(config));
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
  }, [conversation.status, conversation.sendContextualUpdate, conversation.endSession, config]);

  // Auto-scroll the transcript to the newest turn — but ONLY while the parent
  // is already reading the newest turn.
  //
  // Unconditional auto-scroll turned the transcript into a trap: the ASR
  // warning tells the parent to scroll back and read a garbled line for
  // themselves, and the very next turn — a second or two later — yanked them
  // back to the bottom mid-sentence. So the scroll follows the parent's intent
  // instead of overriding it: scrolling away from the bottom detaches, and
  // scrolling back to the bottom re-attaches.
  //
  // `stick` is a ref, not state: it is read inside an effect and must never
  // itself cause a render (a re-render per scroll event, during a smooth
  // scroll, would be miserable).
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  // "At the bottom" is deliberately fuzzy. Sub-pixel rounding, a bubble's
  // trailing margin and the smooth-scroll animation's own final frame all land
  // a few pixels shy of an exact match, and a strict `=== 0` test would read
  // every one of those as "the parent has scrolled away".
  const onTranscriptScroll = () => {
    const el = scroller.current;
    if (!el) return;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight <= 64;
  };
  useEffect(() => {
    if (!stick.current) return;
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [transcript.length]);

  if (!ready) return <p className={styles.status}>{t.gettingReady}</p>;

  const mins = Math.floor(secondsLeft / 60);
  const secs = String(secondsLeft % 60).padStart(2, "0");
  const orbState = conversation.status !== "connected" ? "idle" : conversation.isSpeaking ? "speaking" : "listening";

  return (
    <section className={styles.screen}>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {overridesDisabled && (
        <section role="alert" className={styles.alarm}>
          <h2>{t.overridesAlarmTitle}</h2>
          <p>{t.overridesDisabledBody}</p>
        </section>
      )}

      <div className={styles.stage}>
        <svg className={styles.ring} viewBox="0 0 120 120" aria-hidden="true">
          <circle className={styles.ringTrack} cx="60" cy="60" r="56" />
          <circle
            className={styles.ringFill}
            cx="60"
            cy="60"
            r="56"
            style={{
              strokeDasharray: 2 * Math.PI * 56,
              strokeDashoffset: 2 * Math.PI * 56 * (1 - secondsLeft / (config.minutes * 60)),
            }}
          />
        </svg>
        <div className={`${styles.orb} ${styles[orbState]}`} />
        <p className={styles.clock}>
          {mins}:{secs}
        </p>
      </div>

      <p className={styles.state} role="status">
        {conversation.status === "connecting" && t.connecting}
        {orbState === "idle" &&
          conversation.status === "disconnected" &&
          !overridesDisabled &&
          t.readyWhenYouAre}
        {orbState === "listening" && t.agentListening(config.agentName)}
        {orbState === "speaking" && t.agentTalking(config.agentName)}
      </p>

      <div className={styles.transcript} ref={scroller} onScroll={onTranscriptScroll}>
        {transcript.length === 0 && <p className={styles.empty}>{t.nothingSaidYet}</p>}
        {transcript.map((turn, i) => (
          <div key={i} className={`${styles.bubble} ${turn.role === "agent" ? styles.fromAgent : styles.fromChild}`}>
            <span className={styles.who}>{turn.role === "agent" ? config.agentName : config.childName}</span>
            {turn.text}
          </div>
        ))}
      </div>

      {conversation.status === "connected" ? (
        <div className={styles.endBar}>
          <button className={styles.end} onClick={() => conversation.endSession()}>
            {t.endSession}
          </button>
        </div>
      ) : overridesDisabled ? (
        // The canary has fired: the agent is running WITHOUT our system prompt,
        // so it has none of our guardrails, and nothing this app can do will
        // change that — the fix is in the parent's ElevenLabs dashboard.
        // Restarting from here cannot possibly help; it just reconnects to the
        // same unguarded agent and aborts again.
        //
        // Which made the redesign's Start button a trap. A full-width 56px
        // purple pill with a lift shadow, sitting directly under the alarm, is
        // the loudest thing on the screen and reads as "the way forward" — with
        // a child sitting there waiting, the parent's reflex is to tap it.
        //
        // So while the alarm is up, Start is demoted out of the primary slot
        // entirely: quiet, secondary, and labelled with the precondition rather
        // than with an invitation. It stays *reachable* (once they have flipped
        // the dashboard setting they must be able to get going without hunting
        // for a reload), but it no longer presents itself as the answer. The
        // canary logic itself is untouched — this is presentation only.
        <button className={styles.startBlocked} onClick={start}>
          {t.enableOverridesFirst}
        </button>
      ) : (
        <button className={styles.start} onClick={start} disabled={conversation.status === "connecting"}>
          {conversation.status === "connecting" ? t.connecting : t.startBtn}
        </button>
      )}
    </section>
  );
}
