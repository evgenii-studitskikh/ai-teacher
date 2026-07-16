"use client";

import { useState } from "react";
import type { ToyInfo, ToyMode } from "../../lib/types";
import { buildVoiceDescription } from "../../lib/toy-voice";
import { useLanguage } from "./LanguageProvider";
import styles from "./ToyConfirm.module.css";

type Props = {
  toy: ToyInfo;
  onConfirm: (mode: ToyMode, designedVoiceId: string | null) => void;
  onRetake: () => void;
};

// Show what the vision model saw, let the parent choose HOW the toy plays
// (the old ConfigForm toyMode radio, now the confirm action itself), and
// optionally generate a bespoke ElevenLabs voice for it. Voice generation is
// explicit — it costs credits and an account voice slot — and non-fatal: on
// failure the best-match suggestion from identify-toy still applies.
export default function ToyConfirm({ toy, onConfirm, onRetake }: Props) {
  const { t } = useLanguage();
  const [designedVoiceId, setDesignedVoiceId] = useState<string | null>(null);
  const [voiceState, setVoiceState] = useState<"idle" | "working" | "done">("idle");
  const [voiceError, setVoiceError] = useState<string | null>(null);

  async function generateVoice() {
    setVoiceError(null);
    setVoiceState("working");
    try {
      const res = await fetch("/api/design-voice", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: toy.name, description: buildVoiceDescription(toy) }),
      });
      const payload: { voiceId?: string; error?: string } = await res
        .json()
        .catch(() => ({}) as { voiceId?: string; error?: string });
      if (!res.ok || !payload.voiceId) throw new Error(payload.error ?? `HTTP ${res.status}`);
      setDesignedVoiceId(payload.voiceId);
      setVoiceState("done");
    } catch (e) {
      setVoiceError(t.voiceGenerateFailed(e instanceof Error ? e.message : "unknown error"));
      setVoiceState("idle");
    }
  }

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

      <div className={styles.voiceBlock}>
        {voiceState === "done" ? (
          <p role="status" className={styles.voiceDone}>{t.voiceGenerated}</p>
        ) : (
          <button
            type="button"
            className={styles.generate}
            onClick={generateVoice}
            disabled={voiceState === "working"}
          >
            {voiceState === "working" ? t.generatingVoice : t.generateVoice}
          </button>
        )}
        {voiceError && <p role="alert" className={styles.voiceError}>{voiceError}</p>}
      </div>

      <p className={styles.modeQuestion}>{t.howShouldToyPlay(toy.name)}</p>
      <button type="button" className={styles.use} onClick={() => onConfirm("pov", designedVoiceId)}>
        <strong>{t.beTheToyTitle}</strong> — {t.beTheToyDesc(toy.name)}
      </button>
      <button type="button" className={styles.use} onClick={() => onConfirm("third-person", designedVoiceId)}>
        <strong>{t.helpMePlayTitle}</strong> — {t.helpMePlayDesc(toy.name)}
      </button>
      <button type="button" className={styles.retake} onClick={onRetake}>
        {t.retakePhoto}
      </button>
    </section>
  );
}
