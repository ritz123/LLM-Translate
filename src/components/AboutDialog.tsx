import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from "@mui/material";

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
        <Typography variant="caption" color="text.secondary" component="p" sx={{ m: 0 }}>
          © {new Date().getFullYear()} Biplab Sarkar. All rights reserved.
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
