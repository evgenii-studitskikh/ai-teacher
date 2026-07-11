"use client";

import { useEffect, useState } from "react";
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

  useEffect(() => {
    fetch("/api/voices")
      .then((r) => r.json())
      .then((d) => {
        setVoices(d.voices ?? []);
        setConfig((c) => (c.voiceId ? c : { ...c, voiceId: d.voices?.[0]?.voiceId ?? "" }));
      })
      .catch(() => setVoices([]));
  }, []);

  // Reload a saved profile when the parent finishes typing the child's name.
  async function loadSaved() {
    if (!config.childName) return;
    const res = await fetch(`/api/profiles?childName=${encodeURIComponent(config.childName)}`);
    const { config: saved } = await res.json();
    if (saved) setConfig(saved);
  }

  const set = <K extends keyof SessionConfig>(key: K, value: SessionConfig[K]) =>
    setConfig((c) => ({ ...c, [key]: value }));

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
          placeholder="She's shy — praise her a lot. She loves dinosaurs."
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
