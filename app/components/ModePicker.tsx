"use client";

import styles from "./ModePicker.module.css";

// The landing choice: run a normal lesson (the original flow) or start an
// Interactive Toy session (photograph a real toy, then play with it by voice).
export default function ModePicker({ onLesson, onToy }: { onLesson: () => void; onToy: () => void }) {
  return (
    <section className={styles.picker} aria-label="Choose a mode">
      <button type="button" className={styles.tile} onClick={onLesson}>
        <span className={styles.emoji} aria-hidden="true">📚</span>
        <span className={styles.tileTitle}>Lesson</span>
        <span className={styles.tileSub}>A short spoken lesson toward a goal you set.</span>
      </button>
      <button type="button" className={styles.tile} onClick={onToy}>
        <span className={styles.emoji} aria-hidden="true">🧸</span>
        <span className={styles.tileTitle}>Interactive Toy</span>
        <span className={styles.tileSub}>Scan a real toy and bring it to life to play with.</span>
      </button>
    </section>
  );
}
