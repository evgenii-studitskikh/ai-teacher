"use client";

import { LANGUAGE_META } from "../../lib/i18n";
import { LANGUAGE_CODES, isLanguage } from "../../lib/types";
import { useLanguage } from "./LanguageProvider";
import styles from "./Header.module.css";

// The app's header: the (untranslated — it's the product's name) title plus
// the global language picker. Native names in the options, because a parent
// picking their own language shouldn't need English to find it.
export default function Header() {
  const { language, setLanguage, t } = useLanguage();

  return (
    <header className={styles.header}>
      <h1 className={styles.title}>AI Teacher</h1>
      <select
        className={styles.picker}
        aria-label={t.languagePickerLabel}
        value={language}
        // A <select>'s value is a bare string; narrow it with the guard
        // rather than a cast — same idiom the old ConfigForm field used.
        onChange={(e) => {
          if (isLanguage(e.target.value)) setLanguage(e.target.value);
        }}
      >
        {LANGUAGE_CODES.map((code) => (
          <option key={code} value={code}>
            {LANGUAGE_META[code].nativeName}
          </option>
        ))}
      </select>
    </header>
  );
}
