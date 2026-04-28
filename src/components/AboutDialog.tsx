import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Link, Typography } from "@mui/material";
import { getBundledLicenseSpdx, GPL_V3_TERMS_URL } from "../core/appMeta";

export type AboutDialogProps = {
  open: boolean;
  onClose: () => void;
  appName: string;
  version: string;
};

export default function AboutDialog({ open, onClose, appName, version }: AboutDialogProps) {
  return (
    <Dialog
      id="about-dialog"
      open={open}
      onClose={onClose}
      aria-labelledby="about-dialog-title"
      aria-describedby="about-dialog-description"
      slotProps={{ backdrop: { id: "about-dialog-backdrop" } }}
    >
      <DialogTitle id="about-dialog-title">About {appName}</DialogTitle>
      <DialogContent id="about-dialog-content">
        <Typography id="about-dialog-version" variant="body1" sx={{ fontWeight: 600, mb: 1 }}>
          Version {version}
        </Typography>
        <Typography id="about-dialog-description" variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Desktop translator editor with LLM backends. Source updates as you type; translations run after a short
          debounce.
        </Typography>
        <Typography id="about-dialog-license" variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Licensed under the{" "}
          <Link id="about-dialog-license-link" href={GPL_V3_TERMS_URL} target="_blank" rel="noopener noreferrer">
            GNU General Public License v3.0 only
          </Link>{" "}
          (SPDX <code id="about-dialog-license-spdx">{getBundledLicenseSpdx()}</code>). The full legal text is in the{" "}
          <Typography component="span" variant="body2" sx={{ fontStyle: "italic" }}>
            LICENSE
          </Typography>{" "}
          file in the source tree and release archives.
        </Typography>
        <Typography id="about-dialog-copyright" variant="caption" color="text.secondary" component="p" sx={{ m: 0 }}>
          © {new Date().getFullYear()} Biplab Sarkar
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button id="about-dialog-close" variant="contained" onClick={onClose}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
