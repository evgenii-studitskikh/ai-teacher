"use client";

import type { ToyInfo } from "../../lib/types";
import styles from "./ToyConfirm.module.css";

type Props = { toy: ToyInfo; onConfirm: () => void; onRetake: () => void };

// Show what the vision model saw and let the parent confirm before it becomes
// the agent's persona. Retake goes back to the camera.
export default function ToyConfirm({ toy, onConfirm, onRetake }: Props) {
  return (
    <section className={styles.confirm} aria-label="Confirm the toy">
      <span className={styles.emoji} aria-hidden="true">🧸</span>
      <h2 className={styles.name}>{toy.name}</h2>
      <p className={styles.character}>{toy.character}</p>
      <dl className={styles.detail}>
        <dt>Personality</dt>
        <dd>{toy.personality}</dd>
        <dt>How you'll play</dt>
        <dd>{toy.howToPlay}</dd>
      </dl>
      <button type="button" className={styles.use} onClick={onConfirm}>
        Use this toy
      </button>
      <button type="button" className={styles.retake} onClick={onRetake}>
        Retake photo
      </button>
    </section>
  );
}
