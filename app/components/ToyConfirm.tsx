"use client";

import type { ToyInfo } from "../../lib/types";
import { useLanguage } from "./LanguageProvider";
import styles from "./ToyConfirm.module.css";

type Props = { toy: ToyInfo; onConfirm: () => void; onRetake: () => void };

// Show what the vision model saw and let the parent confirm before it becomes
// the agent's persona. Retake goes back to the camera.
export default function ToyConfirm({ toy, onConfirm, onRetake }: Props) {
  const { t } = useLanguage();
  return (
    <section className={styles.confirm} aria-label={t.confirmToy}>
      <span className={styles.emoji} aria-hidden="true">🧸</span>
      <h2 className={styles.name}>{toy.name}</h2>
      <p className={styles.character}>{toy.character}</p>
      <dl className={styles.detail}>
        <dt>{t.personalityLabel}</dt>
        <dd>{toy.personality}</dd>
        <dt>{t.howYoullPlay}</dt>
        <dd>{toy.howToPlay}</dd>
      </dl>
      <button type="button" className={styles.use} onClick={onConfirm}>
        {t.useThisToy}
      </button>
      <button type="button" className={styles.retake} onClick={onRetake}>
        {t.retakePhoto}
      </button>
    </section>
  );
}
