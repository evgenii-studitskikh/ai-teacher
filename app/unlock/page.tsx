"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "../components/Header";
import { useLanguage } from "../components/LanguageProvider";
import styles from "./Unlock.module.css";

export default function UnlockPage() {
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();
  const formId = useId();
  const { t } = useLanguage();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/unlock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ passcode }),
      });
      if (!res.ok) {
        const data: { error?: string } = await res.json().catch(() => ({}));
        setError(data.error ?? t.wrongPasscode);
        setSubmitting(false);
        return;
      }
      router.replace("/");
    } catch {
      setError(t.unlockNetworkError);
      setSubmitting(false);
    }
  }

  return (
    <main className={styles.shell}>
      <div className={styles.inner}>
        <Header />
        <div className={styles.card}>
          <form onSubmit={submit} className={styles.form}>
            {error && (
              <p role="alert" className={styles.error}>
                {error}
              </p>
            )}
            <div className={styles.field}>
              <label htmlFor={`${formId}-passcode`}>{t.passcodeLabel}</label>
              <input
                id={`${formId}-passcode`}
                type="password"
                autoComplete="current-password"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                required
              />
            </div>
            <button type="submit" className={styles.submit} disabled={submitting || !passcode}>
              {t.unlockBtn}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
