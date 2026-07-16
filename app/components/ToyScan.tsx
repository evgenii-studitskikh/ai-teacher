"use client";

import { useRef, useState } from "react";
import { downscaleImage } from "../../lib/image";
import type { ToyInfo } from "../../lib/types";
import { useLanguage } from "./LanguageProvider";
import styles from "./ToyScan.module.css";

type Props = { onIdentified: (toy: ToyInfo) => void; onBack: () => void };

// A single "take a photo" button. `capture="environment"` opens the rear camera
// on phones/tablets and a file picker on desktop — no camera libraries. The
// photo is downscaled in the browser, then sent to /api/identify-toy.
export default function ToyScan({ onIdentified, onBack }: Props) {
  const { t } = useLanguage();
  const [status, setStatus] = useState<"idle" | "working">("idle");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset the input so picking the same file again still fires onChange.
    e.target.value = "";
    if (!file) return;

    setError(null);
    setStatus("working");
    try {
      const { data, mediaType } = await downscaleImage(file);
      const res = await fetch("/api/identify-toy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ image: data, mediaType }),
      });
      const payload: { toy?: ToyInfo | null; error?: string } = await res
        .json()
        .catch(() => ({}) as { toy?: ToyInfo | null; error?: string });
      if (!res.ok) {
        throw new Error(payload.error ?? t.photoHttpError(res.status));
      }
      if (!payload.toy) {
        setError(t.noToySpotted);
        setStatus("idle");
        return;
      }
      onIdentified(payload.toy);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.photoReadError);
      setStatus("idle");
    }
  }

  return (
    <section className={styles.scan} aria-label={t.scanToy}>
      <p className={styles.lead}>{t.scanLead}</p>

      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onFile}
        hidden
      />

      <button
        type="button"
        className={styles.shutter}
        onClick={() => inputRef.current?.click()}
        disabled={status === "working"}
      >
        {status === "working" ? t.lookingAtToy : t.takePhoto}
      </button>

      <button type="button" className={styles.back} onClick={onBack} disabled={status === "working"}>
        {t.back}
      </button>
    </section>
  );
}
