import { createTheme, type Theme } from "@mui/material/styles";

export const APP_THEME_IDS = ["light", "dark", "ocean", "sepia", "contrast"] as const;
export type AppThemeId = (typeof APP_THEME_IDS)[number];

export const APP_THEME_STORAGE_KEY = "translator.ui.theme.v1";

export const APP_THEME_OPTIONS: { id: AppThemeId; label: string }[] = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "ocean", label: "Ocean" },
  { id: "sepia", label: "Sepia" },
  { id: "contrast", label: "High contrast" },
];

const sharedShape = { borderRadius: 10 };
const sharedTypography = { fontFamily: '"Roboto", "Segoe UI", system-ui, sans-serif' };

function isAppThemeId(s: string): s is AppThemeId {
  return (APP_THEME_IDS as readonly string[]).includes(s);
}

export function readStoredThemeId(): AppThemeId {
  try {
    const raw = localStorage.getItem(APP_THEME_STORAGE_KEY);
    if (raw && isAppThemeId(raw)) return raw;
  } catch {
    /* private mode */
  }
  return "light";
}

export function createAppTheme(id: AppThemeId): Theme {
  switch (id) {
    case "dark":
      return createTheme({
        cssVariables: true,
        palette: {
          mode: "dark",
          primary: { main: "#90caf9" },
          secondary: { main: "#b39ddb" },
          background: { default: "#121212", paper: "#1e1e1e" },
          divider: "rgba(255,255,255,0.12)",
        },
        shape: sharedShape,
        typography: sharedTypography,
      });
    case "ocean":
      return createTheme({
        cssVariables: true,
        palette: {
          mode: "light",
          primary: { main: "#00838f" },
          secondary: { main: "#00695c" },
          background: { default: "#eceff1", paper: "#ffffff" },
        },
        shape: sharedShape,
        typography: sharedTypography,
      });
    case "sepia":
      return createTheme({
        cssVariables: true,
        palette: {
          mode: "light",
          primary: { main: "#5d4037" },
          secondary: { main: "#6d4c41" },
          background: { default: "#ebe4d6", paper: "#faf6ef" },
          text: { primary: "#3e2723", secondary: "#5d4037" },
        },
        shape: sharedShape,
        typography: sharedTypography,
      });
    case "contrast":
      return createTheme({
        cssVariables: true,
        palette: {
          mode: "light",
          primary: { main: "#000000" },
          secondary: { main: "#424242" },
          background: { default: "#ffffff", paper: "#ffffff" },
          text: { primary: "#000000", secondary: "#212121" },
          divider: "#000000",
        },
        shape: sharedShape,
        typography: sharedTypography,
        components: {
          MuiOutlinedInput: {
            styleOverrides: {
              root: {
                "& .MuiOutlinedInput-notchedOutline": { borderWidth: 2 },
              },
            },
          },
        },
      });
    case "light":
    default:
      return createTheme({
        cssVariables: true,
        palette: {
          mode: "light",
          primary: { main: "#1565c0" },
          secondary: { main: "#5c6bc0" },
          background: { default: "#f5f5f5", paper: "#ffffff" },
        },
        shape: sharedShape,
        typography: sharedTypography,
      });
  }
}
