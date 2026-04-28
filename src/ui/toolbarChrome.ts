import type { SxProps, Theme } from "@mui/material/styles";

/** Shared height for AppBar buttons, selects, and window-control strip. */
export const TOOLBAR_CONTROL_HEIGHT_PX = 36;

export const toolbarButtonSx: SxProps<Theme> = {
  height: TOOLBAR_CONTROL_HEIGHT_PX,
  minHeight: TOOLBAR_CONTROL_HEIGHT_PX,
  maxHeight: TOOLBAR_CONTROL_HEIGHT_PX,
  px: 2,
  py: 0,
  fontSize: "0.8125rem",
  fontWeight: 500,
  lineHeight: 1.25,
  textTransform: "none",
  borderRadius: 1,
  boxSizing: "border-box",
};
