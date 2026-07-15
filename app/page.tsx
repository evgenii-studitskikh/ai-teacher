"use client";

import { useState } from "react";
import ConfigForm from "./components/ConfigForm";
import EndView from "./components/EndView";
import SessionView from "./components/SessionView";
import ModePicker from "./components/ModePicker";
import ToyScan from "./components/ToyScan";
import ToyConfirm from "./components/ToyConfirm";
import type { SavedSession, SessionConfig, ToyInfo } from "../lib/types";
import styles from "./app.module.css";

type Finished = Omit<SavedSession, "summary">;

// Pre-config navigation. Once `config` is set we hand off to SessionView, and
// once `finished` is set, to EndView — both unchanged from before.
type Stage =
  | { name: "home" }
  | { name: "lessonConfig" }
  | { name: "toyScan" }
  | { name: "toyConfirm"; toy: ToyInfo }
  | { name: "toyConfig"; toy: ToyInfo };

export default function Page() {
  const [config, setConfig] = useState<SessionConfig | null>(null);
  const [finished, setFinished] = useState<Finished | null>(null);
  const [stage, setStage] = useState<Stage>({ name: "home" });

  const reset = () => {
    setFinished(null);
    setConfig(null);
    setStage({ name: "home" });
  };

  let body: React.ReactNode;
  if (finished) {
    body = <EndView session={finished} onFinish={reset} />;
  } else if (config) {
    body = <SessionView config={config} onDone={setFinished} />;
  } else if (stage.name === "home") {
    body = (
      <ModePicker
        onLesson={() => setStage({ name: "lessonConfig" })}
        onToy={() => setStage({ name: "toyScan" })}
      />
    );
  } else if (stage.name === "lessonConfig") {
    body = <ConfigForm onStart={setConfig} />;
  } else if (stage.name === "toyScan") {
    body = (
      <ToyScan
        onIdentified={(toy) => setStage({ name: "toyConfirm", toy })}
        onBack={() => setStage({ name: "home" })}
      />
    );
  } else if (stage.name === "toyConfirm") {
    body = (
      <ToyConfirm
        toy={stage.toy}
        onConfirm={() => setStage({ name: "toyConfig", toy: stage.toy })}
        onRetake={() => setStage({ name: "toyScan" })}
      />
    );
  } else {
    body = <ConfigForm toy={stage.toy} onStart={setConfig} />;
  }

  return (
    <main className={styles.shell}>
      <div className={styles.inner}>
        <h1 className={styles.title}>AI Teacher</h1>
        {body}
      </div>
    </main>
  );
}
