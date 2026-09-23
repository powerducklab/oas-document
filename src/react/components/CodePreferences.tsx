import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

type Selection = { language: string; client: string };
type Preferences = { selection: Selection; setSelection: (selection: Selection) => void };

const Context = createContext<Preferences | null>(null);
const STORAGE_KEY = "pde-oas-code-prefs";
const DEFAULT_SELECTION: Selection = { language: "shell", client: "curl" };

function loadInitialSelection(): Selection {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SELECTION;
    const parsed = JSON.parse(raw) as Partial<Selection>;
    if (typeof parsed.language === "string" && typeof parsed.client === "string") {
      return { language: parsed.language, client: parsed.client };
    }
  } catch {
    /* Stored preference is malformed; fall back to the default. */
  }
  return DEFAULT_SELECTION;
}

/** Keep example preferences consistent within each document instance. */
export function CodePreferencesProvider({ children }: { children: ReactNode }) {
  const [selection, setSelection] = useState<Selection>(loadInitialSelection);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(selection));
    } catch {
      /* localStorage unavailable; the in-memory selection still works. */
    }
  }, [selection]);

  const value = useMemo(() => ({ selection, setSelection }), [selection]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useCodePreferences() {
  const context = useContext(Context);
  if (!context) throw new Error("Code examples require a CodePreferencesProvider.");
  return context;
}
