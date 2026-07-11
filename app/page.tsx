"use client";

import { useState } from "react";
import ConfigForm from "./components/ConfigForm";
import SessionView from "./components/SessionView";
import SummaryView from "./components/SummaryView";
import type { SavedSession, SessionConfig } from "../lib/types";

type Finished = Omit<SavedSession, "summary">;

export default function Page() {
  const [config, setConfig] = useState<SessionConfig | null>(null);
  const [finished, setFinished] = useState<Finished | null>(null);

  return (
    <main style={{ padding: 32, fontFamily: "system-ui" }}>
      <h1>AI Teacher</h1>

      {finished ? (
        <SummaryView
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
