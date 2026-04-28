import { createTheme } from "@mui/material/styles";

/** Material Design 3–aligned light theme for the desktop shell. */
export const appTheme = createTheme({
  cssVariables: true,
  palette: {
    mode: "light",
    primary: { main: "#1565c0" },
    secondary: { main: "#5c6bc0" },
    background: { default: "#f5f5f5", paper: "#ffffff" },
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily: '"Roboto", "Segoe UI", system-ui, sans-serif',
  },
});
