"use client";

import { useState } from "react";
import ConfigForm from "./components/ConfigForm";
import SessionView from "./components/SessionView";
import type { SessionConfig } from "../lib/types";

export default function Page() {
  const [config, setConfig] = useState<SessionConfig | null>(null);

  return (
    <main style={{ padding: 32, fontFamily: "system-ui" }}>
      <h1>AI Teacher</h1>
      {config ? (
        <SessionView config={config} onDone={() => setConfig(null)} />
      ) : (
        <ConfigForm onStart={setConfig} />
      )}
    </main>
  );
}
