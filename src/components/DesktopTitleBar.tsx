import { Box, IconButton, Tooltip } from "@mui/material";
import Close from "@mui/icons-material/Close";
import CropSquare from "@mui/icons-material/CropSquare";
import Minimize from "@mui/icons-material/Minimize";

import { TOOLBAR_CONTROL_HEIGHT_PX } from "../ui/toolbarChrome";
export default function DesktopTitleBar() {
  const shell = window.translatorDesktop?.shell;
  if (!shell) return null;

  const btnSx = {
    borderRadius: 0,
    px: 0.5,
    "&:hover": { bgcolor: "action.selected" },
  } as const;

  return (
    <Box
      id="desktop-titlebar-controls"
      sx={{
        display: "inline-flex",
        alignItems: "stretch",
        WebkitAppRegion: "no-drag",
        border: 1,
        borderColor: "divider",
        borderRadius: 1,
        overflow: "hidden",
        bgcolor: "background.paper",
        boxShadow: 1,
        height: TOOLBAR_CONTROL_HEIGHT_PX,
        minHeight: TOOLBAR_CONTROL_HEIGHT_PX,
      }}
    >
      <Tooltip title="Minimize">
        <IconButton
          id="desktop-window-minimize"
          size="small"
          aria-label="Minimize window"
          onClick={() => void shell.minimizeWindow()}
          sx={{
            ...btnSx,
            width: TOOLBAR_CONTROL_HEIGHT_PX,
            height: TOOLBAR_CONTROL_HEIGHT_PX,
            minWidth: TOOLBAR_CONTROL_HEIGHT_PX,
          }}
        >
          <Minimize sx={{ fontSize: "1.125rem" }} />
        </IconButton>
      </Tooltip>
      <Box sx={{ width: "1px", alignSelf: "stretch", bgcolor: "divider", flexShrink: 0 }} aria-hidden />
      <Tooltip title="Maximize">
        <IconButton
          id="desktop-window-maximize-toggle"
          size="small"
          aria-label="Maximize or restore window"
          onClick={() => void shell.maximizeToggle()}
          sx={{
            ...btnSx,
            width: TOOLBAR_CONTROL_HEIGHT_PX,
            height: TOOLBAR_CONTROL_HEIGHT_PX,
            minWidth: TOOLBAR_CONTROL_HEIGHT_PX,
          }}
        >
          <CropSquare sx={{ fontSize: "1rem" }} />
        </IconButton>
      </Tooltip>
      <Box sx={{ width: "1px", alignSelf: "stretch", bgcolor: "divider", flexShrink: 0 }} aria-hidden />
      <Tooltip title="Close">
        <IconButton
          id="desktop-window-close"
          size="small"
          aria-label="Close window"
          color="error"
          onClick={() => void shell.closeWindow()}
          sx={{
            ...btnSx,
            width: TOOLBAR_CONTROL_HEIGHT_PX,
            height: TOOLBAR_CONTROL_HEIGHT_PX,
            minWidth: TOOLBAR_CONTROL_HEIGHT_PX,
            "&:hover": { bgcolor: "error.light", color: "error.contrastText" },
          }}
        >
          <Close sx={{ fontSize: "1.125rem" }} />
        </IconButton>
      </Tooltip>
    </Box>
  );
}
