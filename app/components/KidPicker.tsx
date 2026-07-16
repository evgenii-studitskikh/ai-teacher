"use client";

import { useId, useState } from "react";
import type { Kid } from "../../lib/types";
import { useLanguage } from "./LanguageProvider";
import styles from "./KidPicker.module.css";

type Props = {
  kids: Kid[];
  onPick: (kid: Kid) => void;
  onAdd: (name: string, age: number) => void;
  onManage: () => void;
};

// The home screen: tap a child to head for the teacher picker, or add one
// inline. Storage stays with the caller — this component only renders.
export default function KidPicker({ kids, onPick, onAdd, onManage }: Props) {
  const { t } = useLanguage();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [age, setAge] = useState(5);
  const formId = useId();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onAdd(name.trim(), age);
    setAdding(false);
    setName("");
    setAge(5);
  }

  return (
    <section className={styles.picker} aria-label={t.whoIsLearning}>
      <h2 className={styles.title}>{t.whoIsLearning}</h2>
      <ul className={styles.cards}>
        {kids.map((kid) => (
          <li key={kid.id}>
            <button type="button" className={styles.card} onClick={() => onPick(kid)}>
              <span className={styles.cardName}>{kid.name}</span>
              <span className={styles.cardSub}>{t.ageShort(kid.age)}</span>
            </button>
          </li>
        ))}
        <li>
          {adding ? (
            <form className={styles.addForm} onSubmit={submit}>
              <label htmlFor={`${formId}-name`}>{t.childNameLabel}</label>
              <input
                id={`${formId}-name`}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
              />
              <label htmlFor={`${formId}-age`}>{t.childAgeLabel}</label>
              <input
                id={`${formId}-age`}
                type="number"
                min={2}
                max={12}
                value={age}
                onChange={(e) => setAge(Number(e.target.value))}
                required
              />
              <div className={styles.addActions}>
                <button type="submit" className={styles.save}>{t.save}</button>
                <button type="button" className={styles.cancel} onClick={() => setAdding(false)}>
                  {t.cancel}
                </button>
              </div>
            </form>
          ) : (
            <button type="button" className={`${styles.card} ${styles.addCard}`} onClick={() => setAdding(true)}>
              <span className={styles.cardName}>＋</span>
              <span className={styles.cardSub}>{t.addKid}</span>
            </button>
          )}
        </li>
      </ul>
      <button type="button" className={styles.manage} onClick={onManage}>
        {t.manage}
      </button>
    </section>
  );
}
