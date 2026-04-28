import { Box } from "@mui/material";
import TranslationEditor from "./components/TranslationEditor";

export default function App() {
  return (
    <Box id="app-root" sx={{ minHeight: "100vh", bgcolor: "background.default", color: "text.primary" }}>
      <TranslationEditor />
    </Box>
  );
}
