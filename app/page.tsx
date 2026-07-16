"use client";

import { useEffect, useMemo, useState } from "react";
import EndView from "./components/EndView";
import Header from "./components/Header";
import KidPicker from "./components/KidPicker";
import ManageView from "./components/ManageView";
import SessionView from "./components/SessionView";
import StartSheet from "./components/StartSheet";
import TeacherPicker from "./components/TeacherPicker";
import ToyConfirm from "./components/ToyConfirm";
import ToyScan from "./components/ToyScan";
import { useLanguage } from "./components/LanguageProvider";
import { useVoices } from "./components/useVoices";
import {
  listKids,
  listTeachers,
  loadLastStart,
  migrateProfilesToKids,
  saveKid,
  upsertToyTeacher,
} from "../lib/browser-storage";
import { PRESET_TEACHER_IDS, makePresetTeacher } from "../lib/preset-teachers";
import type { Kid, SavedSession, SessionConfig, Teacher, ToyInfo } from "../lib/types";
import styles from "./app.module.css";

type Finished = Omit<SavedSession, "summary">;

// Pre-session navigation, kid-first. Once `config` is set we hand off to
// SessionView, and once `finished` is set, to EndView — both unchanged.
type Stage =
  | { name: "home" }
  | { name: "pickTeacher"; kid: Kid; pendingToy: ToyInfo | null }
  | { name: "toyScan"; kid: Kid }
  | { name: "toyConfirm"; kid: Kid; toy: ToyInfo; suggestedVoiceId: string | null }
  | { name: "startSheet"; kid: Kid; teacher: Teacher; pendingToy: ToyInfo | null }
  | { name: "manage" };

export default function Page() {
  const { t } = useLanguage();
  const [config, setConfig] = useState<SessionConfig | null>(null);
  const [finished, setFinished] = useState<Finished | null>(null);
  const [stage, setStage] = useState<Stage>({ name: "home" });
  const [kids, setKids] = useState<Kid[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const { voices, voicesError } = useVoices();

  const presets = useMemo(
    () => PRESET_TEACHER_IDS.map((id) => makePresetTeacher(id, t.presetTeachers[id].name)),
    [t],
  );

  // Client-only reads in a one-shot effect, like ConfigForm's old profile
  // read: localStorage does not exist during the server render. Migration
  // failures leave the legacy profiles intact — the app then simply starts
  // with an empty kid list, same as a blocked store.
  useEffect(() => {
    try {
      migrateProfilesToKids();
    } catch {
      // Blocked storage: nothing to migrate anyway.
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setKids(listKids());
    setTeachers(listTeachers());
  }, []);

  const refresh = () => {
    setKids(listKids());
    setTeachers(listTeachers());
  };

  const reset = () => {
    setFinished(null);
    setConfig(null);
    setStage({ name: "home" });
    refresh();
  };

  let body: React.ReactNode;
  if (finished) {
    body = <EndView session={finished} onFinish={reset} />;
  } else if (config) {
    body = <SessionView config={config} onDone={setFinished} />;
  } else if (stage.name === "home") {
    body = (
      <KidPicker
        kids={kids}
        onPick={(kid) => setStage({ name: "pickTeacher", kid, pendingToy: null })}
        onAdd={(name, age) => {
          const kid: Kid = { id: crypto.randomUUID(), name, age, createdAt: new Date().toISOString() };
          try {
            saveKid(kid);
          } catch {
            // Blocked storage: the kid exists for this sitting only.
          }
          refresh();
          setStage({ name: "pickTeacher", kid, pendingToy: null });
        }}
        onManage={() => setStage({ name: "manage" })}
      />
    );
  } else if (stage.name === "pickTeacher") {
    const { kid, pendingToy } = stage;
    body = (
      <TeacherPicker
        presets={presets}
        teachers={teachers}
        lastTeacherId={loadLastStart(kid.id)?.teacherId ?? null}
        pendingToy={pendingToy}
        onPick={(teacher) => setStage({ name: "startSheet", kid, teacher, pendingToy })}
        onScanToy={() => setStage({ name: "toyScan", kid })}
        onBack={() => setStage({ name: "home" })}
      />
    );
  } else if (stage.name === "toyScan") {
    const { kid } = stage;
    body = (
      <ToyScan
        voices={voices}
        onIdentified={(toy, suggestedVoiceId) => setStage({ name: "toyConfirm", kid, toy, suggestedVoiceId })}
        onBack={() => setStage({ name: "pickTeacher", kid, pendingToy: null })}
      />
    );
  } else if (stage.name === "toyConfirm") {
    const { kid, toy, suggestedVoiceId } = stage;
    body = (
      <ToyConfirm
        toy={toy}
        onConfirm={(mode, designedVoiceId) => {
          if (mode === "pov") {
            // The toy becomes (or updates) a reusable toy teacher. A designed
            // voice beats the catalog suggestion.
            let teacher: Teacher;
            try {
              teacher = upsertToyTeacher(toy, { suggested: suggestedVoiceId, designed: designedVoiceId });
            } catch {
              // Blocked storage: play with an unsaved, one-off toy teacher.
              teacher = {
                id: "toy:ephemeral",
                kind: "toy",
                name: toy.name,
                voiceId: designedVoiceId ?? suggestedVoiceId,
                personality: toy.personality,
                toy,
                createdAt: new Date().toISOString(),
              };
            }
            refresh();
            setStage({ name: "startSheet", kid, teacher, pendingToy: null });
          } else {
            setStage({ name: "pickTeacher", kid, pendingToy: toy });
          }
        }}
        onRetake={() => setStage({ name: "toyScan", kid })}
      />
    );
  } else if (stage.name === "startSheet") {
    body = (
      <StartSheet
        kid={stage.kid}
        teacher={stage.teacher}
        pendingToy={stage.pendingToy}
        voices={voices}
        voicesError={voicesError}
        onStart={setConfig}
        onBack={() => setStage({ name: "pickTeacher", kid: stage.kid, pendingToy: stage.pendingToy })}
      />
    );
  } else {
    body = (
      <ManageView
        kids={kids}
        teachers={teachers}
        presets={presets}
        voices={voices}
        voicesError={voicesError}
        onChanged={refresh}
        onBack={() => setStage({ name: "home" })}
      />
    );
  }

  return (
    <main className={styles.shell}>
      <div className={styles.inner}>
        <Header />
        {body}
      </div>
    </main>
  );
}
