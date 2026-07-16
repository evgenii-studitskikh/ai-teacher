"use client";

import { useId, useRef, useState } from "react";
import { useLanguage } from "./LanguageProvider";
import type { Voice } from "./useVoices";
import styles from "./VoicePicker.module.css";

type Props = {
  voices: Voice[];
  voiceId: string | null; // null = automatic (only meaningful with allowAuto)
  onChange: (voiceId: string | null) => void;
  allowAuto?: boolean;
};

// The voice radio list with ▶ preview, shared by the teacher editor and
// anywhere else a voice is chosen. Controlled: selection state lives with the
// caller; this component only renders and previews.
export default function VoicePicker({ voices, voiceId, onChange, allowAuto = false }: Props) {
  const { t } = useLanguage();
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const groupId = useId();

  function togglePreview(v: Voice) {
    const audio = audioRef.current;
    if (!audio) return;
    if (playingVoiceId === v.voiceId) {
      audio.pause();
      setPlayingVoiceId(null);
      return;
    }
    audio.src = v.previewUrl;
    audio.play().catch(() => setPlayingVoiceId(null));
    setPlayingVoiceId(v.voiceId);
  }

  return (
    <div className={styles.voiceList}>
      {voices.length === 0 && <p className={styles.note}>{t.loadingVoices}</p>}
      {allowAuto && voices.length > 0 && (
        <label className={styles.voiceOption}>
          <input
            type="radio"
            name={`${groupId}-voice`}
            checked={voiceId === null}
            onChange={() => onChange(null)}
          />
          <span>{t.autoVoice}</span>
        </label>
      )}
      {voices.map((v) => (
        <div className={styles.voiceRow} key={v.voiceId}>
          <label className={styles.voiceOption}>
            <input
              type="radio"
              name={`${groupId}-voice`}
              value={v.voiceId}
              checked={voiceId === v.voiceId}
              onChange={() => onChange(v.voiceId)}
            />
            <span>{v.name}</span>
          </label>
          <button
            type="button"
            className={styles.playBtn}
            aria-label={playingVoiceId === v.voiceId ? t.stopPreview(v.name) : t.playPreview(v.name)}
            onClick={() => togglePreview(v)}
          >
            {playingVoiceId === v.voiceId ? "❚❚" : "▶"}
          </button>
        </div>
      ))}
      <audio ref={audioRef} onEnded={() => setPlayingVoiceId(null)} hidden />
    </div>
  );
}
