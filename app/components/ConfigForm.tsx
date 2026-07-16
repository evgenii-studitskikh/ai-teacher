"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { SessionConfig, ToyInfo, ToyMode } from "../../lib/types";
import { loadProfile, listProfiles, saveProfile } from "../../lib/browser-storage";
import { resolveVoiceSelection } from "../../lib/voice-selection";
import { useLanguage } from "./LanguageProvider";
import type { UIStrings } from "../../lib/i18n";
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

export default function ConfigForm({
  onStart,
  toy,
}: {
  onStart: (config: SessionConfig) => void;
  toy?: ToyInfo;
}) {
  const { language, t } = useLanguage();
  const [config, setConfig] = useState<SessionConfig>(() =>
    toy
      ? { ...DEFAULTS, agentName: toy.name, goal: "", toy, toyMode: "pov" as ToyMode }
      : DEFAULTS,
  );
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voicesError, setVoicesError] = useState<
    { kind: "noVoices" } | { kind: "failed"; detail: string } | null
  >(null);
  const [profileNote, setProfileNote] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<SessionConfig[]>([]);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);

  // Every field the parent has actually touched in this sitting. Loading a
  // saved profile (below) must never overwrite one of these.
  const touched = useRef(new Set<keyof SessionConfig>());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const formId = useId();

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
          setVoicesError({ kind: "noVoices" });
          return;
        }
        // Deliberately does NOT touch config.voiceId. Choosing a voice is the
        // job of the single effect below, which is the only place that knows
        // both what is selected and whether the list has actually loaded.
        setVoices(list);
      })
      .catch((e: unknown) => {
        setVoices([]);
        setVoicesError({ kind: "failed", detail: e instanceof Error ? e.message : "unknown error" });
      });
  }, []);

  // Saved children, for the "pick up where you left off" cards above the
  // form. listProfiles() degrades to [] if storage is unavailable, so no
  // cards render and the form underneath still works exactly as it did
  // before this existed. Still inside an effect, not a render-time call:
  // localStorage does not exist during the server render.
  //
  // Same react-hooks/set-state-in-effect situation as SessionView's
  // lastSummary read (see the comment there): useSyncExternalStore is the
  // rule's suggested alternative, but listProfiles() allocates a new array on
  // every call, so it cannot serve as a stable getSnapshot, and there is no
  // change event to subscribe to. A one-shot client-only read in an effect is
  // the correct tool here.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProfiles(listProfiles());
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
  //
  // loadProfile() is synchronous now, so there is no `await` gap in which
  // `config` could go stale — reading it straight from the closure is safe,
  // and the configRef that used to survive that gap is gone with it.
  function loadSaved() {
    if (toy) return; // toy sessions never load a stored lesson profile
    if (!config.childName) return;
    const saved = loadProfile(config.childName);
    if (!saved) {
      setProfileNote(null);
      return;
    }

    const next = { ...config };
    const applied: (keyof SessionConfig)[] = [];
    for (const key of Object.keys(DEFAULTS) as (keyof SessionConfig)[]) {
      // childName is what we looked the profile up *by* — never overwrite the
      // spelling the parent just typed with the stored one. language is a
      // GLOBAL setting now (the header picker) — a stored per-child language
      // is a leftover from the old scheme and is deliberately ignored.
      if (key === "childName" || key === "language" || touched.current.has(key)) continue;
      if (saved[key] === undefined || saved[key] === config[key]) continue;
      Object.assign(next, { [key]: saved[key] });
      applied.push(key);
    }
    setConfig(next);
    setProfileNote(
      applied.length > 0
        ? t.profileFilled(
            config.childName,
            applied.map((k) => t.fieldNames[k as keyof UIStrings["fieldNames"]]).join(", "),
          )
        : t.profileMatches(config.childName),
    );
  }

  // ---- Which voice the child actually gets -------------------------------
  //
  // DERIVED, every render, from the two things that decide it — never stored.
  // That is the fix for the bug, not just a tidier shape for it.
  //
  // The two data sources race. listProfiles() reads localStorage synchronously
  // (sub-millisecond); /api/voices proxies a remote ElevenLabs call (hundreds
  // of ms). So the saved-child cards are on screen and being tapped *before*
  // `voices` exists — the cards are the first thing the parent sees, so that
  // window is not an edge case, it is the happy path.
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

  const setToyMode = (mode: ToyMode) => {
    // In POV the agent speaks AS the toy, so its introduced name must be the
    // toy's name (the greeting says "I'm {agentName}", and the safety canary
    // requires that name in the first spoken turn). Switching to POV forces it;
    // switching to 3rd person restores a guide name if the toy name was in place.
    setConfig((c) => ({
      ...c,
      toyMode: mode,
      agentName: mode === "pov" ? (toy?.name ?? c.agentName) : c.agentName === toy?.name ? "Robo" : c.agentName,
    }));
  };

  function submit(e: React.FormEvent) {
    e.preventDefault();
    // `voiceId`, not `config.voiceId`: the derived value is the one the radios
    // showed the parent and the one the child will actually hear, so it is the
    // one that gets used AND the one that gets saved back to the profile —
    // otherwise a substituted voice would be silently un-substituted next time.
    // The global header setting is the single source of truth for language —
    // whatever a restored profile or DEFAULTS put in `config.language` is
    // overwritten here, so the saved session remains a complete record of
    // what was actually taught.
    const chosen = { ...config, voiceId, language };
    // Toy sessions are ephemeral and must not overwrite the child's saved
    // lesson profile (which would also poison a later lesson with toy fields).
    if (!toy) {
      try {
        saveProfile(chosen);
      } catch {
        // Saving the profile is a convenience; losing it must not block the session.
      }
    }
    onStart(chosen);
  }

  // Tapping a saved-child card is an explicit, deliberate act by the parent —
  // unlike the blur-triggered load above, it replaces the whole config and is
  // deliberately NOT routed through `touched`.
  //
  // The saved voiceId is restored **as-is**, with no validation here at all.
  // This function runs at the exact moment the voices list is least likely to
  // exist (the cards are the first thing on screen, and they are fed by
  // listProfiles() reading localStorage, which beats the remote ElevenLabs
  // call every time), so any
  // check made here would be a check against an empty array — which is how the
  // child used to end up with a different teacher's voice. Validation belongs
  // to the effect above, which runs again the instant the real list lands and
  // which announces any substitution it has to make.
  function applyCard(p: SessionConfig) {
    setConfig({ ...p, language });
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
      {!toy && profiles.length > 0 && (
        <section className={styles.recent} aria-label={t.savedChildren}>
          <h2 className={styles.sectionTitle}>{t.pickUp}</h2>
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
            {voicesError.kind === "noVoices" ? t.noVoices : t.voicesFailed(voicesError.detail)}
          </p>
        )}

        <fieldset className={styles.group}>
          <legend className={styles.legend}>{t.who}</legend>

          <div className={styles.field}>
            <label htmlFor={`${formId}-childName`}>{t.childNameLabel}</label>
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
            <label htmlFor={`${formId}-childAge`}>{t.childAgeLabel}</label>
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
        </fieldset>

        <fieldset className={styles.group}>
          <legend className={styles.legend}>{t.what}</legend>

          {toy && (
            <div className={styles.field}>
              <span className={styles.modeLabel}>{t.howShouldToyPlay(config.agentName || toy.name)}</span>
              <div className={styles.modeGroup} role="radiogroup" aria-label={t.interactionMode}>
                <label className={styles.modeOption}>
                  <input
                    type="radio"
                    name={`${formId}-toyMode`}
                    checked={config.toyMode === "pov"}
                    onChange={() => setToyMode("pov")}
                  />
                  <span>
                    <strong>{t.beTheToyTitle}</strong> — {t.beTheToyDesc(toy.name)}
                  </span>
                </label>
                <label className={styles.modeOption}>
                  <input
                    type="radio"
                    name={`${formId}-toyMode`}
                    checked={config.toyMode === "third-person"}
                    onChange={() => setToyMode("third-person")}
                  />
                  <span>
                    <strong>{t.helpMePlayTitle}</strong> — {t.helpMePlayDesc(toy.name)}
                  </span>
                </label>
              </div>
            </div>
          )}

          <div className={styles.field}>
            <label htmlFor={`${formId}-goal`}>{toy ? t.purposeLabel : t.goalLabel}</label>
            <input
              id={`${formId}-goal`}
              value={config.goal}
              onChange={(e) => set("goal", e.target.value)}
              placeholder={toy ? t.purposePlaceholder : t.goalPlaceholder}
              required
            />
          </div>

          <div className={styles.field}>
            <label htmlFor={`${formId}-directives`}>{t.extraLabel}</label>
            <textarea
              id={`${formId}-directives`}
              value={config.directives}
              onChange={(e) => set("directives", e.target.value)}
              placeholder={t.extraPlaceholder}
              rows={3}
            />
          </div>
        </fieldset>

        <fieldset className={styles.group}>
          <legend className={styles.legend}>{t.how}</legend>

          {toy && config.toyMode === "pov" ? (
            <p className={styles.note}>{t.povIntro(toy.name)}</p>
          ) : (
            <div className={styles.field}>
              <label htmlFor={`${formId}-agentName`}>{toy ? t.helperNameLabel : t.agentNameLabel}</label>
              <input
                id={`${formId}-agentName`}
                value={config.agentName}
                onChange={(e) => set("agentName", e.target.value)}
                required
              />
            </div>
          )}

          <fieldset className={styles.subgroup}>
            <legend className={styles.sublegend}>{t.voiceLegend}</legend>
            {voices.length === 0 && !voicesError && <p className={styles.note}>{t.loadingVoices}</p>}
            {/* A swapped voice is the one thing here the parent must not miss:
                their child is about to be taught by a voice they did not
                choose. This is the ONLY circumstance in which the app changes
                a saved voice, and it never does it silently. Derived, like the
                selection itself, so it appears exactly when a substitution is
                in force and vanishes the moment the parent picks a voice
                themselves. role="status" announces it without stealing focus. */}
            {voiceChoice.kind === "substitute" && (
              <p role="status" className={styles.voiceNote}>
                {t.voiceSubstituted(voiceChoice.name)}
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
                      playingVoiceId === v.voiceId ? t.stopPreview(v.name) : t.playPreview(v.name)
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
            <label htmlFor={`${formId}-minutes`}>{t.sessionLength}</label>
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
            {t.startSession}
          </button>
        </div>
      </form>
    </>
  );
}
