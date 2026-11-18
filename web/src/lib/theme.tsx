import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Theme = "light" | "dark";
const KEY = "guinchos.theme";

function systemTheme(): Theme {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function stored(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}

function apply(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#151b23" : "#3730a3");
}

const ThemeCtx = createContext<{ theme: Theme; toggle: () => void }>(null!);
export const useTheme = () => useContext(ThemeCtx);

/** Tema atual: escolha salva do usuário ou, se não houver, o do sistema. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => stored() ?? systemTheme());

  useEffect(() => apply(theme), [theme]);

  // Sem escolha salva, acompanha mudanças do sistema.
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    const onChange = () => { if (!stored()) setTheme(systemTheme()); };
    mq?.addEventListener("change", onChange);
    return () => mq?.removeEventListener("change", onChange);
  }, []);

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    try { localStorage.setItem(KEY, next); } catch {}
    setTheme(next);
  };

  return <ThemeCtx.Provider value={{ theme, toggle }}>{children}</ThemeCtx.Provider>;
}

/** Preferência simples persistida (ex.: menu recolhido). */
export function usePersistedFlag(key: string, initial = false) {
  const [value, setValue] = useState<boolean>(() => {
    try { return localStorage.getItem(key) === "1" ? true : localStorage.getItem(key) === "0" ? false : initial; } catch { return initial; }
  });
  const set = (v: boolean) => {
    try { localStorage.setItem(key, v ? "1" : "0"); } catch {}
    setValue(v);
  };
  return [value, set] as const;
}
