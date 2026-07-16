"use client";

import { useEffect, useState } from "react";

export type Voice = {
  voiceId: string;
  name: string;
  previewUrl: string;
  labels?: Record<string, string>;
  description?: string | null;
};

export type VoicesError = { kind: "noVoices" } | { kind: "failed"; detail: string } | null;

// One fetch of the account's voice list for the whole flow. A failing
// /api/voices gets a real error (a bad ELEVENLABS_API_KEY is the most likely
// first-run failure), never a silently empty picker.
export function useVoices(): { voices: Voice[]; voicesError: VoicesError } {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voicesError, setVoicesError] = useState<VoicesError>(null);

  useEffect(() => {
    fetch("/api/voices")
      .then(async (r) => {
        const data: { voices?: Voice[]; error?: string } = await r
          .json()
          .catch(() => ({}) as { voices?: Voice[]; error?: string });
        if (!r.ok || !data.voices) {
          throw new Error(data.error ?? `The voices request failed (HTTP ${r.status}).`);
        }
        return data.voices;
      })
      .then((list) => {
        if (list.length === 0) {
          setVoicesError({ kind: "noVoices" });
          return;
        }
        setVoices(list);
      })
      .catch((e: unknown) => {
        setVoices([]);
        setVoicesError({ kind: "failed", detail: e instanceof Error ? e.message : "unknown error" });
      });
  }, []);

  return { voices, voicesError };
}
