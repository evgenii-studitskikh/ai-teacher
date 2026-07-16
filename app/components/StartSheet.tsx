"use client";

import { useId, useState } from "react";
import type { Kid, SessionConfig, Teacher, ToyInfo } from "../../lib/types";
import { loadLastStart, saveLastStart } from "../../lib/browser-storage";
import { resolveVoiceSelection } from "../../lib/voice-selection";
import { useLanguage } from "./LanguageProvider";
import type { Voice, VoicesError } from "./useVoices";
import styles from "./StartSheet.module.css";

const MINUTE_CHIPS = [5, 10, 15, 20];

type Props = {
  kid: Kid;
  teacher: Teacher;
  pendingToy: ToyInfo | null; // third-person toy riding along, or null
  voices: Voice[];
  voicesError: VoicesError;
  onStart: (config: SessionConfig) => void;
  onBack: () => void;
};

// The last screen before a session: everything pre-filled from this kid's
// previous session, so a repeat is kid → teacher → Start. Voice resolution is
// DERIVED every render (see lib/voice-selection.ts for the timing bug that
// rule exists to prevent): the teacher's saved voiceId is validated only once
// the real list has landed, and any substitution is announced, never silent.
export default function StartSheet({ kid, teacher, pendingToy, voices, voicesError, onStart, onBack }: Props) {
  const { language, t } = useLanguage();
  const [last] = useState(() => loadLastStart(kid.id));
  const [goal, setGoal] = useState(last?.goal ?? "");
  const [directives, setDirectives] = useState(last?.directives ?? "");
  const [minutes, setMinutes] = useState(last?.minutes ?? 10);
  const formId = useId();

  const voiceChoice = resolveVoiceSelection(teacher.voiceId ?? "", voices);
  const voiceId =
    voiceChoice.kind === "select" || voiceChoice.kind === "substitute"
      ? voiceChoice.voiceId
      : (teacher.voiceId ?? "");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const isPovToy = teacher.kind === "toy";
    const config: SessionConfig = {
      agentName: teacher.name,
      voiceId,
      childName: kid.name,
      childAge: kid.age,
      language,
      goal,
      directives,
      minutes,
      kidId: kid.id,
      teacherId: teacher.id,
      ...(isPovToy
        ? { toy: teacher.toy, toyMode: "pov" as const }
        : pendingToy
          ? {
              toy: pendingToy,
              toyMode: "third-person" as const,
              ...(teacher.personality ? { teacherPersonality: teacher.personality } : {}),
            }
          : teacher.personality
            ? { teacherPersonality: teacher.personality }
            : {}),
    };
    try {
      saveLastStart(kid.id, { teacherId: teacher.id, goal, directives, minutes });
    } catch {
      // The prefill is a convenience; losing it must not block the session.
    }
    onStart(config);
  }

  return (
    <form onSubmit={submit} className={styles.sheet} aria-label={t.todaysSession}>
      <button type="button" className={styles.selection} onClick={onBack}>
        <span className={styles.selectionNames}>
          {kid.name} · {teacher.name}
          {pendingToy ? ` · 🧸 ${pendingToy.name}` : ""}
        </span>
        <span className={styles.selectionChange}>{t.changeSelection}</span>
      </button>

      {voicesError && (
        <p role="alert" className={styles.error}>
          {voicesError.kind === "noVoices" ? t.noVoices : t.voicesFailed(voicesError.detail)}
        </p>
      )}
      {voiceChoice.kind === "substitute" && (
        <p role="status" className={styles.voiceNote}>
          {t.voiceSubstituted(voiceChoice.name)}
        </p>
      )}

      <div className={styles.field}>
        <span className={styles.label}>{t.durationLabel}</span>
        <div className={styles.chips} role="radiogroup" aria-label={t.durationLabel}>
          {MINUTE_CHIPS.map((m) => (
            <button
              key={m}
              type="button"
              className={minutes === m ? `${styles.chip} ${styles.chipOn}` : styles.chip}
              aria-pressed={minutes === m}
              onClick={() => setMinutes(m)}
            >
              {t.minutesShort(m)}
            </button>
          ))}
          <input
            aria-label={t.sessionLength}
            className={styles.minutesInput}
            type="number"
            min={3}
            max={30}
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
            required
          />
        </div>
      </div>

      <div className={styles.field}>
        <label htmlFor={`${formId}-goal`}>{t.goalLabel}</label>
        <input
          id={`${formId}-goal`}
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder={t.goalPlaceholder}
          required
        />
      </div>

      <div className={styles.field}>
        <label htmlFor={`${formId}-directives`}>{t.extraLabel}</label>
        <textarea
          id={`${formId}-directives`}
          value={directives}
          onChange={(e) => setDirectives(e.target.value)}
          placeholder={t.extraPlaceholder}
          rows={3}
        />
      </div>

      {/* Same gate as the old form: Start means "a real, existing voice is
          selected", so it waits for the voices list. */}
      <div className={styles.startBar}>
        <button type="submit" className={styles.start} disabled={!voiceId || voices.length === 0}>
          {t.startSession}
        </button>
      </div>
    </form>
  );
}
