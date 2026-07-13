"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./Unlock.module.css";

export default function UnlockPage() {
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();
  const formId = useId();

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
        setError(data.error ?? "That is not the passcode.");
        setSubmitting(false);
        return;
      }
      router.replace("/");
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
      setSubmitting(false);
    }
  }

  return (
    <main className={styles.shell}>
      <div className={styles.inner}>
        <h1 className={styles.title}>AI Teacher</h1>
        <div className={styles.card}>
          <form onSubmit={submit} className={styles.form}>
            {error && (
              <p role="alert" className={styles.error}>
                {error}
              </p>
            )}
            <div className={styles.field}>
              <label htmlFor={`${formId}-passcode`}>Passcode</label>
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
              Unlock
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
