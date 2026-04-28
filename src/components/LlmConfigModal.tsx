import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AutoAwesomeOutlined from "@mui/icons-material/AutoAwesomeOutlined";
import Close from "@mui/icons-material/Close";
import DeleteOutlined from "@mui/icons-material/DeleteOutlined";
import Done from "@mui/icons-material/Done";
import FormatListBulleted from "@mui/icons-material/FormatListBulleted";
import Memory from "@mui/icons-material/Memory";
import PlayCircleOutlined from "@mui/icons-material/PlayCircleOutlined";
import SaveOutlined from "@mui/icons-material/SaveOutlined";
import SettingsOutlined from "@mui/icons-material/SettingsOutlined";
import type {
  GeminiModelOption,
  LlmUserSettingsPayload,
  OllamaModelOption,
  SetLlmUserSettingsBody,
  TranslatorDebugInfo,
  TranslatorDebugLlmPingResult,
} from "../translator-desktop";
import { selectMenuProps } from "../ui/selectMenuProps";

const PROVIDERS = [
  { value: "auto", label: "Automatic (try Gemini, then OpenAI, then Ollama)" },
  { value: "gemini", label: "Gemini" },
  { value: "ollama", label: "Ollama (local)" },
  { value: "openai", label: "OpenAI" },
  { value: "mock", label: "Mock (offline demo)" },
] as const;

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function LlmConfigModal({ open, onClose }: Props) {
  const [payload, setPayload] = useState<LlmUserSettingsPayload | null>(null);
  const [llmProvider, setLlmProvider] = useState("auto");
  const [geminiKeyDraft, setGeminiKeyDraft] = useState("");
  const [geminiModelSelect, setGeminiModelSelect] = useState("gemini-2.0-flash");
  const [geminiApiBaseDraft, setGeminiApiBaseDraft] = useState("");
  const [geminiModelsListed, setGeminiModelsListed] = useState<GeminiModelOption[] | null>(null);
  const [listModelsErr, setListModelsErr] = useState<string | null>(null);
  const [listModelsBusy, setListModelsBusy] = useState(false);
  const [saveGeminiBusy, setSaveGeminiBusy] = useState(false);
  const [geminiFormErr, setGeminiFormErr] = useState<string | null>(null);
  const [ollamaBaseDraft, setOllamaBaseDraft] = useState("");
  const [ollamaModelDraft, setOllamaModelDraft] = useState("");
  const [ollamaModelsListed, setOllamaModelsListed] = useState<OllamaModelOption[] | null>(null);
  const [ollamaListErr, setOllamaListErr] = useState<string | null>(null);
  const [ollamaListBusy, setOllamaListBusy] = useState(false);
  const [saveOllamaBusy, setSaveOllamaBusy] = useState(false);
  const [debugInfo, setDebugInfo] = useState<TranslatorDebugInfo | null>(null);
  const [pingResult, setPingResult] = useState<TranslatorDebugLlmPingResult | null>(null);
  const [pingBusy, setPingBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setGeminiKeyDraft("");
      setGeminiFormErr(null);
      setListModelsErr(null);
      setOllamaListErr(null);
      setPingResult(null);
      return;
    }
    const api = window.translatorDesktop;
    if (!api) {
      setGeminiFormErr("Desktop API unavailable (open this app in Electron).");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const [p, info] = await Promise.all([api.getLlmUserSettings(), api.getDebugInfo()]);
        if (cancelled) return;
        setPayload(p);
        setLlmProvider(p.llmProvider.trim() ? p.llmProvider.trim().toLowerCase() : "auto");
        setGeminiModelSelect(p.geminiModel);
        setGeminiApiBaseDraft(p.geminiApiBase);
        setOllamaBaseDraft(p.ollamaBaseUrl);
        setOllamaModelDraft(p.ollamaModel);
        setDebugInfo(info);
      } catch (e) {
        if (!cancelled) {
          console.error("[config] load settings failed", e);
          setGeminiFormErr(e instanceof Error ? e.message : String(e));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const modelSelectOptions = useMemo(() => {
    const cur = geminiModelSelect;
    if (geminiModelsListed && geminiModelsListed.length > 0) {
      const opts = geminiModelsListed.map((m) => ({ value: m.id, label: m.displayName }));
      if (!opts.some((o) => o.value === cur)) {
        return [{ value: cur, label: `${cur} (current)` }, ...opts];
      }
      return opts;
    }
    const fb = payload?.fallbackGeminiModelIds;
    if (fb && fb.length > 0) {
      const opts = fb.map((id) => ({ value: id, label: id }));
      if (!opts.some((o) => o.value === cur)) {
        return [{ value: cur, label: `${cur} (current)` }, ...opts];
      }
      return opts;
    }
    return [{ value: cur, label: cur }];
  }, [geminiModelSelect, geminiModelsListed, payload?.fallbackGeminiModelIds]);

  const refreshGeminiModels = useCallback(async () => {
    const api = window.translatorDesktop;
    if (!api) return;
    setListModelsErr(null);
    setListModelsBusy(true);
    try {
      const { models } = await api.listGeminiModels({
        ...(geminiKeyDraft.trim() ? { apiKey: geminiKeyDraft.trim() } : {}),
        ...(geminiApiBaseDraft.trim() ? { apiBase: geminiApiBaseDraft.trim() } : {}),
      });
      setGeminiModelsListed(models);
    } catch (e) {
      setListModelsErr(e instanceof Error ? e.message : String(e));
      setGeminiModelsListed(null);
    } finally {
      setListModelsBusy(false);
    }
  }, [geminiKeyDraft, geminiApiBaseDraft]);

  const refreshOllamaModels = useCallback(async () => {
    const api = window.translatorDesktop;
    if (!api) return;
    setOllamaListErr(null);
    setOllamaListBusy(true);
    try {
      const { models } = await api.listOllamaModels({
        ...(ollamaBaseDraft.trim() ? { baseUrl: ollamaBaseDraft.trim() } : {}),
      });
      setOllamaModelsListed(models);
    } catch (e) {
      setOllamaListErr(e instanceof Error ? e.message : String(e));
      setOllamaModelsListed(null);
    } finally {
      setOllamaListBusy(false);
    }
  }, [ollamaBaseDraft]);

  const ollamaModelSelectOptions = useMemo(() => {
    const cur = ollamaModelDraft.trim() || "llama3.2";
    if (ollamaModelsListed !== null && ollamaModelsListed.length > 0) {
      const opts = ollamaModelsListed.map((m) => ({ value: m.id, label: m.displayName || m.id }));
      if (!opts.some((o) => o.value === cur)) {
        return [{ value: cur, label: `${cur} (current — not in server list)` }, ...opts];
      }
      return opts;
    }
    if (ollamaModelsListed !== null && ollamaModelsListed.length === 0) {
      return [{ value: cur, label: `${cur} — server returned no models (try ollama pull)` }];
    }
    return [{ value: cur, label: `${cur} — click "List models" to load all models from this server` }];
  }, [ollamaModelDraft, ollamaModelsListed]);

  const saveGemini = useCallback(async () => {
    const api = window.translatorDesktop;
    if (!api) return;
    setSaveGeminiBusy(true);
    setGeminiFormErr(null);
    try {
      const body: SetLlmUserSettingsBody = {
        llmProvider: llmProvider === "auto" ? "" : llmProvider,
        geminiModel: geminiModelSelect,
        geminiApiBase: geminiApiBaseDraft,
      };
      if (geminiKeyDraft.trim().length > 0) {
        body.geminiApiKey = geminiKeyDraft.trim();
      }
      const ui = await api.setLlmUserSettings(body);
      setPayload(ui);
      setGeminiKeyDraft("");
      setDebugInfo(await api.getDebugInfo());
    } catch (e) {
      setGeminiFormErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaveGeminiBusy(false);
    }
  }, [geminiApiBaseDraft, geminiKeyDraft, geminiModelSelect, llmProvider]);

  const saveOllama = useCallback(async () => {
    const api = window.translatorDesktop;
    if (!api) return;
    setSaveOllamaBusy(true);
    setGeminiFormErr(null);
    try {
      const ui = await api.setLlmUserSettings({
        llmProvider: llmProvider === "auto" ? "" : llmProvider,
        ollamaBaseUrl: ollamaBaseDraft,
        ollamaModel: ollamaModelDraft,
      });
      setPayload(ui);
      setDebugInfo(await api.getDebugInfo());
    } catch (e) {
      setGeminiFormErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaveOllamaBusy(false);
    }
  }, [llmProvider, ollamaBaseDraft, ollamaModelDraft]);

  const clearGeminiKey = useCallback(async () => {
    const api = window.translatorDesktop;
    if (!api) return;
    setSaveGeminiBusy(true);
    setGeminiFormErr(null);
    try {
      const ui = await api.setLlmUserSettings({
        clearGeminiApiKey: true,
        geminiModel: geminiModelSelect,
        llmProvider: llmProvider === "auto" ? "" : llmProvider,
      });
      setPayload(ui);
      setDebugInfo(await api.getDebugInfo());
    } catch (e) {
      setGeminiFormErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaveGeminiBusy(false);
    }
  }, [geminiModelSelect, llmProvider]);

  const saveProviderOnly = useCallback(async () => {
    const api = window.translatorDesktop;
    if (!api) return;
    setGeminiFormErr(null);
    try {
      const ui = await api.setLlmUserSettings({
        llmProvider: llmProvider === "auto" ? "" : llmProvider,
      });
      setPayload(ui);
      setDebugInfo(await api.getDebugInfo());
    } catch (e) {
      setGeminiFormErr(e instanceof Error ? e.message : String(e));
    }
  }, [llmProvider]);

  const runPing = useCallback(async () => {
    const api = window.translatorDesktop;
    if (!api) return;
    setPingBusy(true);
    setPingResult(null);
    try {
      const out = await api.debugLlmPing();
      setPingResult(out);
      setDebugInfo(out.info);
    } catch (e) {
      let info: TranslatorDebugInfo;
      try {
        info = await api.getDebugInfo();
      } catch {
        info = {} as TranslatorDebugInfo;
      }
      setPingResult({
        ok: false,
        info,
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setPingBusy(false);
    }
  }, []);

  if (!open) return null;

  return (
    <Dialog
      id="llm-config-dialog"
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      scroll="paper"
      aria-labelledby="llm-config-dialog-title"
    >
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", pr: 1, gap: 1 }}>
        <Box component="span" sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
          <SettingsOutlined color="primary" sx={{ fontSize: "1.35rem", flexShrink: 0 }} aria-hidden />
          <Typography id="llm-config-dialog-title" component="span" variant="h6" sx={{ fontSize: "1.1rem", fontWeight: 600 }}>
            Configuration
          </Typography>
        </Box>
        <IconButton id="llm-config-close-header" aria-label="Close configuration" onClick={onClose} size="small" edge="end">
          <Close fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Typography id="llm-config-lead" variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Choose <strong>LLM_PROVIDER</strong> and provider credentials. Settings are stored on this device (not in a project{" "}
          <code>.env</code> file).
        </Typography>

        <Stack id="llm-config-provider-section" spacing={1.5} sx={{ mb: 2 }}>
          <FormControl id="llm-config-provider-form" fullWidth size="small">
            <InputLabel id="llm-config-provider-label">LLM provider</InputLabel>
            <Select
              labelId="llm-config-provider-label"
              id="cfg-llm-provider"
              label="LLM provider"
              value={llmProvider}
              onChange={(e) => setLlmProvider(e.target.value)}
              MenuProps={selectMenuProps(360)}
            >
              {PROVIDERS.map((o) => (
                <MenuItem id={`llm-config-provider-option-${o.value}`} key={o.value} value={o.value}>
                  {o.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button
            id="llm-config-save-provider"
            variant="outlined"
            size="small"
            startIcon={<SaveOutlined fontSize="small" />}
            onClick={() => void saveProviderOnly()}
          >
            Save provider choice
          </Button>
        </Stack>

        {debugInfo && (
          <Typography id="llm-config-status" variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Active model: <code>{debugInfo.modelVersion}</code> · Effective provider: <code>{debugInfo.llmProvider}</code>
          </Typography>
        )}

        <Box id="llm-config-gemini-section" sx={{ mb: 2 }}>
          <Typography id="llm-config-gemini-heading" variant="subtitle1" sx={{ mb: 1, fontWeight: 600, display: "flex", alignItems: "center", gap: 0.75 }}>
            <AutoAwesomeOutlined color="primary" fontSize="small" aria-hidden />
            Gemini
          </Typography>
          <Stack spacing={1.5}>
            <TextField
              id="cfg-gemini-key"
              label="API key"
              type="password"
              autoComplete="off"
              fullWidth
              size="small"
              placeholder={payload?.geminiApiKeySaved ? "New key replaces saved key" : "Paste API key"}
              value={geminiKeyDraft}
              onChange={(e) => setGeminiKeyDraft(e.target.value)}
            />
            {payload?.geminiApiKeySaved && (
              <Typography id="llm-config-gemini-key-hint" variant="caption" color="text.secondary">
                A key is already saved on this machine.
              </Typography>
            )}
            <TextField
              id="cfg-gemini-base"
              label="API base URL"
              type="url"
              autoComplete="off"
              fullWidth
              size="small"
              placeholder="https://generativelanguage.googleapis.com/v1beta"
              value={geminiApiBaseDraft}
              onChange={(e) => setGeminiApiBaseDraft(e.target.value)}
            />
            <Box id="llm-config-gemini-model-row" sx={{ display: "flex", flexDirection: { xs: "column", sm: "row" }, gap: 1, alignItems: { sm: "center" } }}>
              <FormControl id="llm-config-gemini-model-form" fullWidth size="small">
                <InputLabel id="llm-config-gemini-model-label">Model</InputLabel>
                <Select
                  labelId="llm-config-gemini-model-label"
                  id="cfg-gemini-model"
                  label="Model"
                  value={geminiModelSelect}
                  onChange={(e) => setGeminiModelSelect(e.target.value)}
                  MenuProps={selectMenuProps(380)}
                >
                  {modelSelectOptions.map((o) => (
                    <MenuItem id={`llm-config-gemini-model-${o.value}`} key={o.value} value={o.value}>
                      {o.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Button
                id="llm-config-gemini-list-models"
                variant="outlined"
                disabled={listModelsBusy}
                startIcon={<FormatListBulleted fontSize="small" />}
                onClick={() => void refreshGeminiModels()}
              >
                {listModelsBusy ? "Loading…" : "List models"}
              </Button>
            </Box>
            {listModelsErr && (
              <Alert id="llm-config-gemini-list-error" severity="error" role="alert">
                {listModelsErr}
              </Alert>
            )}
            <Box id="llm-config-gemini-actions" sx={{ display: "flex", flexDirection: "row", flexWrap: "wrap", gap: 1 }}>
              <Button
                id="llm-config-save-gemini"
                variant="contained"
                disabled={saveGeminiBusy}
                startIcon={<SaveOutlined fontSize="small" />}
                onClick={() => void saveGemini()}
              >
                {saveGeminiBusy ? "Saving…" : "Save Gemini settings"}
              </Button>
              <Button
                id="llm-config-clear-gemini-key"
                variant="outlined"
                color="warning"
                disabled={saveGeminiBusy || !payload?.geminiApiKeySaved}
                startIcon={<DeleteOutlined fontSize="small" />}
                onClick={() => void clearGeminiKey()}
              >
                Clear saved key
              </Button>
            </Box>
          </Stack>
        </Box>

        <Box id="llm-config-ollama-section" sx={{ mb: 2 }}>
          <Typography id="llm-config-ollama-heading" variant="subtitle1" sx={{ mb: 1, fontWeight: 600, display: "flex", alignItems: "center", gap: 0.75 }}>
            <Memory color="primary" fontSize="small" aria-hidden />
            Ollama
          </Typography>
          <Stack spacing={1.5}>
            <TextField
              id="cfg-ollama-url"
              label="Base URL"
              type="url"
              autoComplete="off"
              fullWidth
              size="small"
              placeholder="http://127.0.0.1:11434"
              value={ollamaBaseDraft}
              onChange={(e) => setOllamaBaseDraft(e.target.value)}
            />
            <Box id="llm-config-ollama-model-row" sx={{ display: "flex", flexDirection: { xs: "column", sm: "row" }, gap: 1, alignItems: { sm: "flex-start" } }}>
              <FormControl id="llm-config-ollama-model-form" fullWidth size="small">
                <InputLabel id="llm-config-ollama-model-label">Model</InputLabel>
                <Select
                  labelId="llm-config-ollama-model-label"
                  id="cfg-ollama-model"
                  label="Model"
                  value={ollamaModelDraft.trim() || ollamaModelSelectOptions[0]!.value}
                  onChange={(e) => setOllamaModelDraft(e.target.value)}
                  MenuProps={selectMenuProps(400)}
                >
                  {ollamaModelSelectOptions.map((o) => (
                    <MenuItem id={`llm-config-ollama-model-${o.value}`} key={o.value} value={o.value}>
                      {o.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Button
                id="llm-config-ollama-list-models"
                variant="outlined"
                disabled={ollamaListBusy}
                startIcon={<FormatListBulleted fontSize="small" />}
                onClick={() => void refreshOllamaModels()}
              >
                {ollamaListBusy ? "Loading…" : "List models"}
              </Button>
            </Box>
            {ollamaModelsListed !== null && ollamaModelsListed.length > 0 && (
              <Typography id="llm-config-ollama-models-count" variant="caption" color="text.secondary" role="status">
                {ollamaModelsListed.length} model{ollamaModelsListed.length === 1 ? "" : "s"} on this server — select one, then{" "}
                <strong>Save Ollama settings</strong>.
              </Typography>
            )}
            {ollamaListErr && (
              <Alert id="llm-config-ollama-list-error" severity="error" role="alert">
                {ollamaListErr}
              </Alert>
            )}
            <Button
              id="llm-config-save-ollama"
              variant="contained"
              disabled={saveOllamaBusy}
              startIcon={<SaveOutlined fontSize="small" />}
              onClick={() => void saveOllama()}
            >
              {saveOllamaBusy ? "Saving…" : "Save Ollama settings"}
            </Button>
          </Stack>
        </Box>

        <Box id="llm-config-debug-section" sx={{ mb: 1 }}>
          <Button
            id="llm-config-test-translation"
            variant="outlined"
            disabled={pingBusy}
            startIcon={<PlayCircleOutlined fontSize="small" />}
            onClick={() => void runPing()}
          >
            {pingBusy ? "Testing…" : "Test translation"}
          </Button>
          {pingResult && (
            <Box
              id="llm-config-ping-output"
              component="pre"
              role="status"
              sx={{
                mt: 1,
                p: 1,
                bgcolor: "action.hover",
                borderRadius: 1,
                fontSize: "0.78rem",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                maxHeight: 160,
                overflow: "auto",
              }}
            >
              {pingResult.ok
                ? `OK — ${pingResult.response.cacheHit ? "cache" : "live"}, ${pingResult.response.latencyMs} ms, model ${pingResult.response.modelVersion}\n${pingResult.response.translation}`
                : `Failed: ${pingResult.error}`}
            </Box>
          )}
        </Box>

        {geminiFormErr && (
          <Alert id="llm-config-form-error" severity="error" role="alert" sx={{ mt: 1 }}>
            {geminiFormErr}
          </Alert>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button id="llm-config-footer-close" variant="contained" onClick={onClose} startIcon={<Done fontSize="small" />}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
