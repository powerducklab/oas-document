import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

type Selection = { language: string; client: string };
type Preferences = { selection: Selection; setSelection: (selection: Selection) => void };
const Context = createContext<Preferences | null>(null);

/** Keep example preferences consistent within each document instance. */
export function CodePreferencesProvider({ children }: { children: ReactNode }) {
  const [selection, setSelection] = useState({ language: "shell", client: "curl" });
  const value = useMemo(() => ({ selection, setSelection }), [selection]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useCodePreferences() {
  const context = useContext(Context);
  if (!context) throw new Error("Code examples require a CodePreferencesProvider.");
  return context;
}
