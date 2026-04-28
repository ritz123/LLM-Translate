import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { CssBaseline, ThemeProvider } from "@mui/material";
import {
  APP_THEME_STORAGE_KEY,
  createAppTheme,
  readStoredThemeId,
  type AppThemeId,
} from "./createAppTheme";

export type ThemePreference = {
  themeId: AppThemeId;
  setThemeId: (id: AppThemeId) => void;
};

const ThemePreferenceContext = createContext<ThemePreference | null>(null);

export function useThemePreference(): ThemePreference {
  const v = useContext(ThemePreferenceContext);
  if (!v) throw new Error("useThemePreference must be used within AppThemeProvider");
  return v;
}

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeIdState] = useState<AppThemeId>(() => readStoredThemeId());

  const setThemeId = useCallback((id: AppThemeId) => {
    setThemeIdState(id);
    try {
      localStorage.setItem(APP_THEME_STORAGE_KEY, id);
    } catch {
      /* private mode */
    }
  }, []);

  const theme = useMemo(() => createAppTheme(themeId), [themeId]);
  const preference = useMemo(() => ({ themeId, setThemeId }), [themeId, setThemeId]);

  return (
    <ThemePreferenceContext.Provider value={preference}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ThemePreferenceContext.Provider>
  );
}
