"use client";

import { useState } from "react";
import ConfigForm from "./components/ConfigForm";
import EndView from "./components/EndView";
import SessionView from "./components/SessionView";
import type { SavedSession, SessionConfig } from "../lib/types";

type Finished = Omit<SavedSession, "summary">;

export default function Page() {
  const [config, setConfig] = useState<SessionConfig | null>(null);
  const [finished, setFinished] = useState<Finished | null>(null);

  return (
    <main style={{ padding: 32, fontFamily: "system-ui" }}>
      <h1>AI Teacher</h1>

      {finished ? (
        // EndView saves the transcript first and only then summarizes it; it
        // is the component that owns that ordering (see EndView.tsx).
        <EndView
          session={finished}
          onFinish={() => {
            setFinished(null);
            setConfig(null);
          }}
        />
      ) : config ? (
        <SessionView config={config} onDone={setFinished} />
      ) : (
        <ConfigForm onStart={setConfig} />
      )}
    </main>
  );
}
