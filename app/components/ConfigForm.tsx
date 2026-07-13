"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { SessionConfig } from "../../lib/types";
import { LANGUAGE_OPTIONS } from "../../lib/prompt";
import { resolveVoiceSelection } from "../../lib/voice-selection";
import styles from "./ConfigForm.module.css";

type Voice = { voiceId: string; name: string; previewUrl: string };

const DEFAULTS: SessionConfig = {
  agentName: "Robo",
  voiceId: "",
  childName: "",
  childAge: 5,
  language: "en",
  goal: "",
  directives: "",
  minutes: 10,
};

// Deliberately NOT a second list. The languages the parent can pick and the
// languages the agent has a greeting for must be the same set, or we greet a
// child in a language they don't speak — which is exactly what happened when
// these were two unrelated lists.
const LANGUAGES = LANGUAGE_OPTIONS;

export default function ConfigForm({ onStart }: { onStart: (config: SessionConfig) => void }) {
  const [config, setConfig] = useState<SessionConfig>(DEFAULTS);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voicesError, setVoicesError] = useState<string | null>(null);
  const [profileNote, setProfileNote] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<SessionConfig[]>([]);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);

  // Every field the parent has actually touched in this sitting. Loading a
  // saved profile (below) must never overwrite one of these.
  const touched = useRef(new Set<keyof SessionConfig>());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const formId = useId();

  // Mirrors `config` after every commit so `loadSaved` can read the
  // truly-latest state after its `await fetch` without going through a
  // setState updater — updater functions get double-invoked by StrictMode.
  // Refs must not be written during render (react-hooks/refs), so this runs
  // in an effect rather than the component body; the assignment is
  // idempotent, so re-running it is harmless.
  const configRef = useRef(config);
  useEffect(() => {
    configRef.current = config;
  });

  useEffect(() => {
    // A failing /api/voices used to leave `voices` empty, the Voice dropdown
    // blank, `voiceId` at "", and the Start button permanently disabled — with
    // nothing on screen to say why. A bad or missing ELEVENLABS_API_KEY is the
    // single most likely first-run failure, so it gets a real message.
    fetch("/api/voices")
      .then(async (r) => {
        const data: { voices?: Voice[]; error?: string } = await r
          .json()
          .catch(() => ({}) as { voices?: Voice[]; error?: string });
        if (!r.ok || !data.voices) {
          throw new Error(data.error ?? `The voices request failed (HTTP ${r.status}).`);
        }
        return data.voices;
      })
      .then((list) => {
        if (list.length === 0) {
          setVoicesError("Your ElevenLabs account has no voices in it. Add one at elevenlabs.io, then reload.");
          return;
        }
        // Deliberately does NOT touch config.voiceId. Choosing a voice is the
        // job of the single effect below, which is the only place that knows
        // both what is selected and whether the list has actually loaded.
        setVoices(list);
      })
      .catch((e: unknown) => {
        setVoices([]);
        setVoicesError(
          `Could not load the voice list: ${e instanceof Error ? e.message : "unknown error"} ` +
            "Check that ELEVENLABS_API_KEY in .env.local is set and valid, and that `npm run dev` is " +
            "still running, then reload this page. Until the voices load, a session cannot be started.",
        );
      });
  }, []);

  // Saved children, for the "pick up where you left off" cards above the
  // form. A failed fetch just means no cards render — the form underneath
  // still works exactly as it did before this existed.
  useEffect(() => {
    fetch("/api/profiles/list")
      .then((r) => r.json())
      .then((d) => setProfiles(d.profiles ?? []))
      .catch(() => setProfiles([]));
  }, []);

  // Reload a saved profile when the parent finishes typing the child's name.
  //
  // This used to `setConfig(saved)` — replacing the whole form with last
  // session's values. A parent who set the goal and the session length *before*
  // typing the child's name (the natural order for the form as laid out) had
  // all of it silently reverted, and the child got last week's lesson. So the
  // saved profile is now only allowed to fill in fields the parent has not
  // touched: what they typed always wins, and anything the profile did supply
  // is named out loud underneath the field.
  async function loadSaved() {
    if (!config.childName) return;
    const res = await fetch(`/api/profiles?childName=${encodeURIComponent(config.childName)}`);
    if (!res.ok) return;
    const { config: saved }: { config: SessionConfig | null } = await res.json();
    if (!saved) {
      setProfileNote(null);
      return;
    }

    // Computed purely, outside any setState updater: React 18 StrictMode
    // double-invokes updater functions, and pushing into `applied` from
    // inside one used to record every filled field twice ("goal, goal,
    // minutes, minutes"). `configRef.current` gives the same up-to-date
    // state an updater would have, without the impure side effect.
    const current = configRef.current;
    const next = { ...current };
    const applied: (keyof SessionConfig)[] = [];
    for (const key of Object.keys(DEFAULTS) as (keyof SessionConfig)[]) {
      // childName is what we looked the profile up *by* — never overwrite the
      // spelling the parent just typed with the stored one.
      if (key === "childName" || touched.current.has(key)) continue;
      if (saved[key] === undefined || saved[key] === current[key]) continue;
      Object.assign(next, { [key]: saved[key] });
      applied.push(key);
    }
    setConfig(next);
    setProfileNote(
      applied.length > 0
        ? `Filled in from ${config.childName}'s last session: ${applied.join(", ")}. Anything you already changed was left alone.`
        : `Found a saved profile for ${config.childName}; everything in it matches what's on the form already.`,
    );
  }

  // ---- Which voice the child actually gets -------------------------------
  //
  // DERIVED, every render, from the two things that decide it — never stored.
  // That is the fix for the bug, not just a tidier shape for it.
  //
  // The two data sources race. /api/profiles/list is a local readdir (~1ms);
  // /api/voices proxies a remote ElevenLabs call (hundreds of ms). So the
  // saved-child cards are on screen and being tapped *before* `voices` exists —
  // the cards are the first thing the parent sees, so that window is not an
  // edge case, it is the happy path.
  //
  // The old code resolved the voice once, imperatively, inside applyCard: it
  // ran `voices.some(...)` against the still-empty array, concluded the child's
  // saved voice no longer existed, and blanked it — after which the arriving
  // voices list saw the blank and filled it with the first voice in the
  // account. The parent tapped "Mia" and their child got a stranger.
  //
  // Deriving instead means there is no stale decision to be wrong: the moment
  // `voices` lands, this recomputes against the real list. While the list is
  // empty, resolveVoiceSelection returns "wait" and we simply keep whatever
  // voiceId the card restored. An unloaded list is not evidence that a voice
  // was deleted.
  const voiceChoice = resolveVoiceSelection(config.voiceId, voices);
  const voiceId =
    voiceChoice.kind === "select" || voiceChoice.kind === "substitute" ? voiceChoice.voiceId : config.voiceId;

  const set = <K extends keyof SessionConfig>(key: K, value: SessionConfig[K]) => {
    touched.current.add(key);
    setConfig((c) => ({ ...c, [key]: value }));
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    // `voiceId`, not `config.voiceId`: the derived value is the one the radios
    // showed the parent and the one the child will actually hear, so it is the
    // one that gets used AND the one that gets saved back to the profile —
    // otherwise a substituted voice would be silently un-substituted next time.
    const chosen = { ...config, voiceId };
    await fetch("/api/profiles", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(chosen),
    });
    onStart(chosen);
  }

  // Tapping a saved-child card is an explicit, deliberate act by the parent —
  // unlike the blur-triggered load above, it replaces the whole config and is
  // deliberately NOT routed through `touched`.
  //
  // The saved voiceId is restored **as-is**, with no validation here at all.
  // This function runs at the exact moment the voices list is least likely to
  // exist (the cards are the first thing on screen, and they are fed by a
  // local readdir that beats the remote ElevenLabs call every time), so any
  // check made here would be a check against an empty array — which is how the
  // child used to end up with a different teacher's voice. Validation belongs
  // to the effect above, which runs again the instant the real list lands and
  // which announces any substitution it has to make.
  function applyCard(p: SessionConfig) {
    setConfig({ ...p });
    setProfileNote(null);
  }

  function togglePreview(v: Voice) {
    const audio = audioRef.current;
    if (!audio) return;
    if (playingVoiceId === v.voiceId) {
      audio.pause();
      setPlayingVoiceId(null);
      return;
    }
    audio.src = v.previewUrl;
    audio.play().catch(() => {
      // Autoplay/decoding can fail silently on some browsers; there is
      // nothing useful to surface for a preview button, so it just stays
      // showing "play" rather than a stuck "playing" state.
      setPlayingVoiceId(null);
    });
    setPlayingVoiceId(v.voiceId);
  }

  return (
    <>
      {profiles.length > 0 && (
        <section className={styles.recent} aria-label="Saved children">
          <h2 className={styles.sectionTitle}>Pick up where you left off</h2>
          <ul className={styles.cards}>
            {profiles.map((p) => (
              <li key={p.childName}>
                <button type="button" className={styles.card} onClick={() => applyCard(p)}>
                  <span className={styles.cardName}>{p.childName}</span>
                  <span className={styles.cardGoal}>{p.goal}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <form onSubmit={submit} className={styles.form}>
        {voicesError && (
          <p role="alert" className={styles.error}>
            {voicesError}
          </p>
        )}

        <fieldset className={styles.group}>
          <legend className={styles.legend}>Who</legend>

          <div className={styles.field}>
            <label htmlFor={`${formId}-childName`}>Child&apos;s name</label>
            <input
              id={`${formId}-childName`}
              value={config.childName}
              onChange={(e) => set("childName", e.target.value)}
              onBlur={loadSaved}
              required
            />
          </div>
          {profileNote && (
            <p className={styles.note} aria-live="polite">
              {profileNote}
            </p>
          )}

          <div className={styles.field}>
            <label htmlFor={`${formId}-childAge`}>Child&apos;s age</label>
            <input
              id={`${formId}-childAge`}
              type="number"
              min={2}
              max={12}
              value={config.childAge}
              onChange={(e) => set("childAge", Number(e.target.value))}
              required
            />
          </div>

          <div className={styles.field}>
            <label htmlFor={`${formId}-language`}>Language</label>
            <select
              id={`${formId}-language`}
              value={config.language}
              // A <select>'s value is a bare string, but `language` is a closed
              // union — so narrow it by looking it up in the same list the
              // options were rendered from, rather than asserting the type away.
              onChange={(e) => {
                const picked = LANGUAGES.find((l) => l.value === e.target.value);
                if (picked) set("language", picked.value);
              }}
            >
              {LANGUAGES.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
        </fieldset>

        <fieldset className={styles.group}>
          <legend className={styles.legend}>What</legend>

          <div className={styles.field}>
            <label htmlFor={`${formId}-goal`}>Goal</label>
            <input
              id={`${formId}-goal`}
              value={config.goal}
              onChange={(e) => set("goal", e.target.value)}
              placeholder="Count to 10"
              required
            />
          </div>

          <div className={styles.field}>
            <label htmlFor={`${formId}-directives`}>Extra instructions</label>
            <textarea
              id={`${formId}-directives`}
              value={config.directives}
              onChange={(e) => set("directives", e.target.value)}
              placeholder="Shy — praise them a lot. Loves dinosaurs."
              rows={3}
            />
          </div>
        </fieldset>

        <fieldset className={styles.group}>
          <legend className={styles.legend}>How</legend>

          <div className={styles.field}>
            <label htmlFor={`${formId}-agentName`}>Agent name</label>
            <input
              id={`${formId}-agentName`}
              value={config.agentName}
              onChange={(e) => set("agentName", e.target.value)}
              required
            />
          </div>

          <fieldset className={styles.subgroup}>
            <legend className={styles.sublegend}>Voice</legend>
            {voices.length === 0 && !voicesError && <p className={styles.note}>Loading voices…</p>}
            {/* A swapped voice is the one thing here the parent must not miss:
                their child is about to be taught by a voice they did not
                choose. This is the ONLY circumstance in which the app changes
                a saved voice, and it never does it silently. Derived, like the
                selection itself, so it appears exactly when a substitution is
                in force and vanishes the moment the parent picks a voice
                themselves. role="status" announces it without stealing focus. */}
            {voiceChoice.kind === "substitute" && (
              <p role="status" className={styles.voiceNote}>
                The voice saved for this child is no longer in your ElevenLabs account, so{" "}
                {voiceChoice.name} is selected instead. Pick a different one below if you&apos;d
                rather — preview them with ▶.
              </p>
            )}
            <div className={styles.voiceList}>
              {voices.map((v) => (
                <div className={styles.voiceRow} key={v.voiceId}>
                  <label className={styles.voiceOption}>
                    <input
                      type="radio"
                      name={`${formId}-voice`}
                      value={v.voiceId}
                      checked={voiceId === v.voiceId}
                      onChange={() => set("voiceId", v.voiceId)}
                      required
                    />
                    <span>{v.name}</span>
                  </label>
                  <button
                    type="button"
                    className={styles.playBtn}
                    aria-label={
                      playingVoiceId === v.voiceId ? `Stop preview of ${v.name}` : `Play preview of ${v.name}`
                    }
                    onClick={() => togglePreview(v)}
                  >
                    {playingVoiceId === v.voiceId ? "❚❚" : "▶"}
                  </button>
                </div>
              ))}
            </div>
            <audio ref={audioRef} onEnded={() => setPlayingVoiceId(null)} hidden />
          </fieldset>

          <div className={styles.field}>
            <label htmlFor={`${formId}-minutes`}>Session length (minutes)</label>
            <input
              id={`${formId}-minutes`}
              type="number"
              min={3}
              max={30}
              value={config.minutes}
              onChange={(e) => set("minutes", Number(e.target.value))}
              required
            />
          </div>
        </fieldset>

        {/* A solid, full-bleed bar rather than a bare floating pill: content
            scrolling behind the sticky Start button now disappears behind an
            opaque backdrop instead of peeking through the gaps around a
            rounded pill. See ConfigForm.module.css for the accompanying
            .form padding that gives the last field room to scroll clear. */}
        {/* Start is also gated on the voices list existing, not just on some
            voiceId being set. A voiceId restored from a card is unverified
            until the list lands: starting in that window would either send
            ElevenLabs a voice that has since been deleted, or submit a form
            whose radio group has no options rendered to satisfy `required`.
            The list is a few hundred milliseconds away — the gate is invisible
            in practice, and it makes "Start is enabled" mean "a real, existing
            voice is selected", which is the only thing it should ever mean. */}
        <div className={styles.startBar}>
          <button type="submit" className={styles.start} disabled={!voiceId || voices.length === 0}>
            Start session
          </button>
        </div>
      </form>
    </>
  );
}
