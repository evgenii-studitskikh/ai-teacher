"use client";

import { useId, useState } from "react";
import type { Kid, Teacher } from "../../lib/types";
import { deleteKid, deleteTeacher, saveKid, saveTeacher } from "../../lib/browser-storage";
import { buildVoiceDescription } from "../../lib/toy-voice";
import { useLanguage } from "./LanguageProvider";
import VoicePicker from "./VoicePicker";
import type { Voice, VoicesError } from "./useVoices";
import styles from "./ManageView.module.css";

type Props = {
  kids: Kid[];
  teachers: Teacher[]; // stored only
  presets: Teacher[];
  voices: Voice[];
  voicesError: VoicesError;
  onChanged: () => void;
  onBack: () => void;
};

type Editing =
  | { kind: "kid"; kid: Kid }
  | { kind: "teacher"; teacher: Teacher }
  | null;

// Two-tab management: Children and Teachers. Edits are inline; deletes are
// two-tap (first tap arms, second confirms). Presets are immutable — their
// only action is "Duplicate & edit", which forks a custom copy. Toy teachers
// additionally offer bespoke voice generation.
export default function ManageView({ kids, teachers, presets, voices, voicesError, onChanged, onBack }: Props) {
  const { t } = useLanguage();
  const [tab, setTab] = useState<"kids" | "teachers">("kids");
  const [editing, setEditing] = useState<Editing>(null);
  const [armedDelete, setArmedDelete] = useState<string | null>(null);
  const [voiceGen, setVoiceGen] = useState<{ id: string; state: "working" | "done" } | { id: string; state: "error"; detail: string } | null>(null);
  const formId = useId();

  function confirmDelete(id: string, doDelete: () => void) {
    if (armedDelete === id) {
      doDelete();
      setArmedDelete(null);
      onChanged();
    } else {
      setArmedDelete(id);
    }
  }

  async function generateVoiceFor(teacher: Teacher) {
    if (!teacher.toy) return;
    setVoiceGen({ id: teacher.id, state: "working" });
    try {
      const res = await fetch("/api/design-voice", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: teacher.toy.name, description: buildVoiceDescription(teacher.toy) }),
      });
      const payload: { voiceId?: string; error?: string } = await res
        .json()
        .catch(() => ({}) as { voiceId?: string; error?: string });
      if (!res.ok || !payload.voiceId) throw new Error(payload.error ?? `HTTP ${res.status}`);
      saveTeacher({ ...teacher, voiceId: payload.voiceId });
      setVoiceGen({ id: teacher.id, state: "done" });
      onChanged();
    } catch (e) {
      setVoiceGen({ id: teacher.id, state: "error", detail: e instanceof Error ? e.message : "unknown error" });
    }
  }

  if (editing?.kind === "kid") {
    const kid = editing.kid;
    return (
      <form
        className={styles.editor}
        onSubmit={(e) => {
          e.preventDefault();
          try {
            saveKid(kid);
          } catch {
            // Storage failures surface as the entry simply not changing.
          }
          setEditing(null);
          onChanged();
        }}
      >
        {/* Session-summary continuity (loadLatestSummary in
            lib/browser-storage.ts) is keyed by the child's NAME, not kidId —
            so renaming a kid here silently starts their continuity over: the
            next session will not find last time's summary under the new
            name. Accepted for a single-family app where a rename is rare and
            the parent notices; a real fix would key summaries by kidId. */}
        <label htmlFor={`${formId}-kname`}>{t.childNameLabel}</label>
        <input
          id={`${formId}-kname`}
          value={kid.name}
          onChange={(e) => setEditing({ kind: "kid", kid: { ...kid, name: e.target.value } })}
          required
        />
        <label htmlFor={`${formId}-kage`}>{t.childAgeLabel}</label>
        <input
          id={`${formId}-kage`}
          type="number"
          min={2}
          max={12}
          value={kid.age}
          onChange={(e) => setEditing({ kind: "kid", kid: { ...kid, age: Number(e.target.value) } })}
          required
        />
        <div className={styles.editorActions}>
          <button type="submit" className={styles.save}>{t.save}</button>
          <button type="button" className={styles.cancel} onClick={() => setEditing(null)}>{t.cancel}</button>
        </div>
      </form>
    );
  }

  if (editing?.kind === "teacher") {
    const teacher = editing.teacher;
    const isToy = teacher.kind === "toy";
    return (
      <form
        className={styles.editor}
        onSubmit={(e) => {
          e.preventDefault();
          try {
            saveTeacher(teacher);
          } catch {
            // Same degrade as kid saves.
          }
          setEditing(null);
          onChanged();
        }}
      >
        <label htmlFor={isToy ? undefined : `${formId}-tname`}>{t.teacherNameLabel}</label>
        {isToy ? (
          // A toy teacher's name is not editable here: it is how re-scans are
          // matched (upsertToyTeacher matches by normalized name) and it is
          // the identity baked into the toy's greeting/prompt. Renaming it in
          // this form would desync the two.
          <p className={styles.rowName}>{teacher.name}</p>
        ) : (
          <input
            id={`${formId}-tname`}
            value={teacher.name}
            onChange={(e) => setEditing({ ...editing, teacher: { ...teacher, name: e.target.value } })}
            required
          />
        )}
        {!isToy && (
          <>
            <label htmlFor={`${formId}-tpers`}>{t.personalityFieldLabel}</label>
            <textarea
              id={`${formId}-tpers`}
              value={teacher.personality}
              onChange={(e) => setEditing({ ...editing, teacher: { ...teacher, personality: e.target.value } })}
              placeholder={t.personalityPlaceholder}
              rows={3}
            />
          </>
        )}
        {isToy && (
          // Read-only: a POV toy session is built from teacher.toy.personality,
          // not this field, so editing it here would be a dead control.
          <>
            <label>{t.personalityFieldLabel}</label>
            <p className={styles.rowSub}>{teacher.personality}</p>
          </>
        )}
        {voicesError && (
          <p role="alert" className={styles.error}>
            {voicesError.kind === "noVoices" ? t.noVoices : t.voicesFailed(voicesError.detail)}
          </p>
        )}
        {!voicesError && (
          <VoicePicker
            voices={voices}
            voiceId={teacher.voiceId}
            onChange={(voiceId) => setEditing({ ...editing, teacher: { ...teacher, voiceId } })}
            allowAuto
          />
        )}
        <div className={styles.editorActions}>
          <button type="submit" className={styles.save}>{t.save}</button>
          <button type="button" className={styles.cancel} onClick={() => setEditing(null)}>{t.cancel}</button>
        </div>
      </form>
    );
  }

  return (
    <section className={styles.manage} aria-label={t.manage}>
      {/* Plain toggle buttons, not a tablist: there are no tabpanels and no
          arrow-key wiring, so the ARIA tab pattern's contract would not be
          met. `group` + `aria-pressed` describes what this actually is. */}
      <div className={styles.tabs} role="group">
        <button type="button" aria-pressed={tab === "kids"} className={tab === "kids" ? styles.tabOn : styles.tab} onClick={() => setTab("kids")}>
          {t.kidsTab}
        </button>
        <button type="button" aria-pressed={tab === "teachers"} className={tab === "teachers" ? styles.tabOn : styles.tab} onClick={() => setTab("teachers")}>
          {t.teachersTab}
        </button>
      </div>

      {tab === "kids" && (
        <ul className={styles.rows}>
          {kids.length === 0 && <li className={styles.empty}>{t.nothingHereYet}</li>}
          {kids.map((kid) => (
            <li key={kid.id} className={styles.row}>
              <span className={styles.rowName}>
                {kid.name} <span className={styles.rowSub}>{t.ageShort(kid.age)}</span>
              </span>
              <span className={styles.rowActions}>
                <button type="button" className={styles.action} onClick={() => setEditing({ kind: "kid", kid })}>
                  {t.edit}
                </button>
                <button type="button" className={styles.danger} onClick={() => confirmDelete(kid.id, () => deleteKid(kid.id))}>
                  {armedDelete === kid.id ? t.confirmDelete : t.deleteAction}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {tab === "teachers" && (
        <>
          <ul className={styles.rows}>
            {presets.map((teacher) => (
              <li key={teacher.id} className={styles.row}>
                <span className={styles.rowName}>
                  {teacher.name} <span className={styles.rowSub}>{t.presetBadge}</span>
                </span>
                <span className={styles.rowActions}>
                  <button
                    type="button"
                    className={styles.action}
                    onClick={() =>
                      setEditing({
                        kind: "teacher",
                        teacher: {
                          ...teacher,
                          id: crypto.randomUUID(),
                          kind: "custom",
                          createdAt: new Date().toISOString(),
                        },
                      })
                    }
                  >
                    {t.duplicateAndEdit}
                  </button>
                </span>
              </li>
            ))}
            {teachers.map((teacher) => (
              <li key={teacher.id} className={styles.row}>
                <span className={styles.rowName}>
                  {teacher.name}{" "}
                  {teacher.kind === "toy" && <span className={styles.rowSub}>{t.toyBadge}</span>}
                </span>
                <span className={styles.rowActions}>
                  {teacher.kind === "toy" &&
                    (voiceGen?.id === teacher.id && voiceGen.state === "done" ? (
                      <span role="status" className={styles.rowSub}>{t.voiceGenerated}</span>
                    ) : (
                      <button
                        type="button"
                        className={styles.action}
                        disabled={voiceGen?.id === teacher.id && voiceGen.state === "working"}
                        onClick={() => generateVoiceFor(teacher)}
                      >
                        {voiceGen?.id === teacher.id && voiceGen.state === "working" ? t.generatingVoice : t.generateVoice}
                      </button>
                    ))}
                  <button type="button" className={styles.action} onClick={() => setEditing({ kind: "teacher", teacher })}>
                    {t.edit}
                  </button>
                  <button type="button" className={styles.danger} onClick={() => confirmDelete(teacher.id, () => deleteTeacher(teacher.id))}>
                    {armedDelete === teacher.id ? t.confirmDelete : t.deleteAction}
                  </button>
                </span>
              </li>
            ))}
          </ul>
          {voiceGen?.state === "error" && (
            <p role="alert" className={styles.error}>{t.voiceGenerateFailed(voiceGen.detail)}</p>
          )}
          <button
            type="button"
            className={styles.action}
            onClick={() =>
              setEditing({
                kind: "teacher",
                teacher: {
                  id: crypto.randomUUID(),
                  kind: "custom",
                  name: "",
                  voiceId: null,
                  personality: "",
                  createdAt: new Date().toISOString(),
                },
              })
            }
          >
            {t.newTeacher}
          </button>
        </>
      )}

      <button type="button" className={styles.back} onClick={onBack}>
        {t.back}
      </button>
    </section>
  );
}
