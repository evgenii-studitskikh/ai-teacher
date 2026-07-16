"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { loadLanguage, saveLanguage } from "../../lib/browser-storage";
import { LANGUAGE_META, STRINGS, type UIStrings } from "../../lib/i18n";
import type { Language } from "../../lib/types";

// The one global setting: which language the app teaches AND displays in.
// Owned here, persisted per-device, consumed everywhere via useLanguage().
// It is deliberately NOT per-child (see the design doc): the header picker is
// the single source of truth, and ConfigForm injects this value into the
// SessionConfig at submit.
type LanguageContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: UIStrings;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export default function LanguageProvider({ children }: { children: React.ReactNode }) {
  // Starts as "en" on both server and client so hydration matches, then the
  // stored choice is applied in an effect. The parent sees an English flash
  // on load — accepted in the design as the cost of having no locale
  // routing. Same one-shot client-only localStorage read as ConfigForm's
  // listProfiles and SessionView's lastSummary (see the comments there for
  // why an effect, not useSyncExternalStore).
  const [language, setLanguageState] = useState<Language>("en");

  useEffect(() => {
    const stored = loadLanguage();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored) setLanguageState(stored);
  }, []);

  // Mirror the choice onto the document, where CSS and assistive tech read
  // it: `lang` for screen readers/hyphenation, `dir` for RTL (Hebrew).
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = LANGUAGE_META[language].dir;
  }, [language]);

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    try {
      saveLanguage(next);
    } catch {
      // Persistence is a convenience; a blocked write must not break the
      // picker. The choice still applies for this visit.
    }
  }, []);

  const value = useMemo(
    () => ({ language, setLanguage, t: STRINGS[language] }),
    [language, setLanguage],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const value = useContext(LanguageContext);
  if (!value) throw new Error("useLanguage must be used inside <LanguageProvider>");
  return value;
}
