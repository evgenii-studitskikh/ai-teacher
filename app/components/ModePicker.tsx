"use client";

import { useLanguage } from "./LanguageProvider";
import styles from "./ModePicker.module.css";

// The landing choice: run a normal lesson (the original flow) or start an
// Interactive Toy session (photograph a real toy, then play with it by voice).
export default function ModePicker({ onLesson, onToy }: { onLesson: () => void; onToy: () => void }) {
  const { t } = useLanguage();
  return (
    <section className={styles.picker} aria-label={t.chooseMode}>
      <button type="button" className={styles.tile} onClick={onLesson}>
        <span className={styles.emoji} aria-hidden="true">📚</span>
        <span className={styles.tileTitle}>{t.lessonTitle}</span>
        <span className={styles.tileSub}>{t.lessonSub}</span>
      </button>
      <button type="button" className={styles.tile} onClick={onToy}>
        <span className={styles.emoji} aria-hidden="true">🧸</span>
        <span className={styles.tileTitle}>{t.toyTitle}</span>
        <span className={styles.tileSub}>{t.toySub}</span>
      </button>
    </section>
  );
}
