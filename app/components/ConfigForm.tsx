"use client";

import { useEffect, useRef, useState } from "react";
import type { SessionConfig } from "../../lib/types";

type Voice = { voiceId: string; name: string; previewUrl: string };

const DEFAULTS: SessionConfig = {
  agentName: "Robo",
  voiceId: "",
  childName: "",
  childAge: 5,
  language: "en",
  goal: "",
  directives: "",
  minutes: 10,
};

export default function ConfigForm({ onStart }: { onStart: (config: SessionConfig) => void }) {
  const [config, setConfig] = useState<SessionConfig>(DEFAULTS);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voicesError, setVoicesError] = useState<string | null>(null);
  const [profileNote, setProfileNote] = useState<string | null>(null);

  // Every field the parent has actually touched in this sitting. Loading a
  // saved profile (below) must never overwrite one of these.
  const touched = useRef(new Set<keyof SessionConfig>());

  useEffect(() => {
    // A failing /api/voices used to leave `voices` empty, the Voice dropdown
    // blank, `voiceId` at "", and the Start button permanently disabled — with
    // nothing on screen to say why. A bad or missing ELEVENLABS_API_KEY is the
    // single most likely first-run failure, so it gets a real message.
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
          setVoicesError("Your ElevenLabs account has no voices in it. Add one at elevenlabs.io, then reload.");
          return;
        }
        setVoices(list);
        setConfig((c) => (c.voiceId ? c : { ...c, voiceId: list[0].voiceId }));
      })
      .catch((e: unknown) => {
        setVoices([]);
        setVoicesError(
          `Could not load the voice list: ${e instanceof Error ? e.message : "unknown error"} ` +
            "Check that ELEVENLABS_API_KEY in .env.local is set and valid, and that `npm run dev` is " +
            "still running, then reload this page. Until the voices load, a session cannot be started.",
        );
      });
  }, []);

  // Reload a saved profile when the parent finishes typing the child's name.
  //
  // This used to `setConfig(saved)` — replacing the whole form with last
  // session's values. A parent who set the goal and the session length *before*
  // typing the child's name (the natural order for the form as laid out) had
  // all of it silently reverted, and the child got last week's lesson. So the
  // saved profile is now only allowed to fill in fields the parent has not
  // touched: what they typed always wins, and anything the profile did supply
  // is named out loud underneath the field.
  async function loadSaved() {
    if (!config.childName) return;
    const res = await fetch(`/api/profiles?childName=${encodeURIComponent(config.childName)}`);
    if (!res.ok) return;
    const { config: saved }: { config: SessionConfig | null } = await res.json();
    if (!saved) {
      setProfileNote(null);
      return;
    }

    const applied: (keyof SessionConfig)[] = [];
    setConfig((current) => {
      const next = { ...current };
      for (const key of Object.keys(DEFAULTS) as (keyof SessionConfig)[]) {
        // childName is what we looked the profile up *by* — never overwrite the
        // spelling the parent just typed with the stored one.
        if (key === "childName" || touched.current.has(key)) continue;
        if (saved[key] === undefined || saved[key] === current[key]) continue;
        Object.assign(next, { [key]: saved[key] });
        applied.push(key);
      }
      return next;
    });
    setProfileNote(
      applied.length > 0
        ? `Filled in from ${config.childName}'s last session: ${applied.join(", ")}. Anything you already changed was left alone.`
        : `Found a saved profile for ${config.childName}; everything in it matches what's on the form already.`,
    );
  }

  const set = <K extends keyof SessionConfig>(key: K, value: SessionConfig[K]) => {
    touched.current.add(key);
    setConfig((c) => ({ ...c, [key]: value }));
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/profiles", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(config),
    });
    onStart(config);
  }

  const selectedVoice = voices.find((v) => v.voiceId === config.voiceId);

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 12, maxWidth: 480 }}>
      {voicesError && (
        <p role="alert" style={{ color: "crimson", border: "1px solid crimson", padding: 12 }}>
          {voicesError}
        </p>
      )}

      <label>
        Agent name
        <input value={config.agentName} onChange={(e) => set("agentName", e.target.value)} required />
      </label>

      <label>
        Voice
        <select value={config.voiceId} onChange={(e) => set("voiceId", e.target.value)} required>
          {voices.map((v) => (
            <option key={v.voiceId} value={v.voiceId}>{v.name}</option>
          ))}
        </select>
      </label>
      {selectedVoice && <audio controls src={selectedVoice.previewUrl} />}

      <label>
        Child&apos;s name
        <input
          value={config.childName}
          onChange={(e) => set("childName", e.target.value)}
          onBlur={loadSaved}
          required
        />
      </label>
      {profileNote && <p style={{ color: "#555", margin: 0 }}>{profileNote}</p>}

      <label>
        Child&apos;s age
        <input
          type="number"
          min={2}
          max={12}
          value={config.childAge}
          onChange={(e) => set("childAge", Number(e.target.value))}
          required
        />
      </label>

      <label>
        Language
        <select value={config.language} onChange={(e) => set("language", e.target.value)}>
          <option value="en">English</option>
          <option value="ru">Russian</option>
          <option value="es">Spanish</option>
          <option value="de">German</option>
        </select>
      </label>

      <label>
        Goal
        <input
          value={config.goal}
          onChange={(e) => set("goal", e.target.value)}
          placeholder="Count to 10"
          required
        />
      </label>

      <label>
        Extra instructions
        <textarea
          value={config.directives}
          onChange={(e) => set("directives", e.target.value)}
          placeholder="Shy — praise them a lot. Loves dinosaurs."
          rows={3}
        />
      </label>

      <label>
        Session length (minutes)
        <input
          type="number"
          min={3}
          max={30}
          value={config.minutes}
          onChange={(e) => set("minutes", Number(e.target.value))}
          required
        />
      </label>

      <button type="submit" disabled={!config.voiceId}>Start session</button>
    </form>
  );
}
