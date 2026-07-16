"use client";

import type { Teacher, ToyInfo } from "../../lib/types";
import type { PresetTeacherId } from "../../lib/preset-teachers";
import { useLanguage } from "./LanguageProvider";
import styles from "./TeacherPicker.module.css";

type Props = {
  presets: Teacher[];
  teachers: Teacher[]; // stored: custom + toy
  lastTeacherId: string | null; // from the kid's last-start, for the badge
  pendingToy: ToyInfo | null; // set when "help me play" is choosing a helper
  onPick: (teacher: Teacher) => void;
  onScanToy: () => void;
  onBack: () => void;
};

// One grid of teacher cards: presets, the parent's own, saved toys, and a
// "scan a toy" card. When a third-person toy is pending, toy teachers and the
// scan card hide — the pending toy is the toy; what's being picked is a helper.
export default function TeacherPicker({
  presets,
  teachers,
  lastTeacherId,
  pendingToy,
  onPick,
  onScanToy,
  onBack,
}: Props) {
  const { t } = useLanguage();
  const shown = pendingToy ? [...presets, ...teachers.filter((x) => x.kind === "custom")] : [...presets, ...teachers];

  function subFor(teacher: Teacher): string {
    if (teacher.kind === "preset") {
      return t.presetTeachers[teacher.id.slice("preset:".length) as PresetTeacherId].description;
    }
    if (teacher.kind === "toy") return teacher.toy?.character ?? "";
    return teacher.personality;
  }

  return (
    <section className={styles.picker} aria-label={t.whoWillTeach}>
      <h2 className={styles.title}>{t.whoWillTeach}</h2>
      {pendingToy && <p className={styles.pendingToy}>{t.playingWith(pendingToy.name)}</p>}
      <ul className={styles.cards}>
        {shown.map((teacher) => (
          <li key={teacher.id}>
            <button type="button" className={styles.card} onClick={() => onPick(teacher)}>
              <span className={styles.badges}>
                {teacher.kind === "preset" && <span className={styles.badge}>{t.presetBadge}</span>}
                {teacher.kind === "toy" && <span className={styles.badge}>{t.toyBadge}</span>}
                {teacher.id === lastTeacherId && <span className={styles.badgeLast}>{t.lastTimeBadge}</span>}
              </span>
              <span className={styles.cardName}>{teacher.name}</span>
              <span className={styles.cardSub}>{subFor(teacher)}</span>
            </button>
          </li>
        ))}
        {!pendingToy && (
          <li>
            <button type="button" className={`${styles.card} ${styles.scanCard}`} onClick={onScanToy}>
              <span className={styles.emoji} aria-hidden="true">🧸</span>
              <span className={styles.cardName}>{t.scanToyTitle}</span>
              <span className={styles.cardSub}>{t.scanToySub}</span>
            </button>
          </li>
        )}
      </ul>
      <button type="button" className={styles.back} onClick={onBack}>
        {t.back}
      </button>
    </section>
  );
}
