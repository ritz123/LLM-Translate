import type { SxProps, Theme } from "@mui/material/styles";

/** Shared height for AppBar buttons, selects, and window-control strip. */
export const TOOLBAR_CONTROL_HEIGHT_PX = 36;

/** Square toolbar icon buttons (match window controls and Select height). */
export const toolbarIconButtonSx: SxProps<Theme> = {
  width: TOOLBAR_CONTROL_HEIGHT_PX,
  minWidth: TOOLBAR_CONTROL_HEIGHT_PX,
  height: TOOLBAR_CONTROL_HEIGHT_PX,
  maxHeight: TOOLBAR_CONTROL_HEIGHT_PX,
  p: 0,
  borderRadius: 1,
  boxSizing: "border-box",
};
