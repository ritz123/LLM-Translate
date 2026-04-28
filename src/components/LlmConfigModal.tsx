import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  GeminiModelOption,
  LlmUserSettingsPayload,
  OllamaModelOption,
  SetLlmUserSettingsBody,
  TranslatorDebugInfo,
  TranslatorDebugLlmPingResult,
} from "../translator-desktop";

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
    let cancelled = false;
    void (async () => {
      try {
        const [p, info] = await Promise.all([
          window.translatorDesktop.getLlmUserSettings(),
          window.translatorDesktop.getDebugInfo(),
        ]);
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
    setListModelsErr(null);
    setListModelsBusy(true);
    try {
      const { models } = await window.translatorDesktop.listGeminiModels({
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
    setOllamaListErr(null);
    setOllamaListBusy(true);
    try {
      const { models } = await window.translatorDesktop.listOllamaModels({
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

  const ollamaModelSelectSize = useMemo(() => {
    if (!ollamaModelsListed || ollamaModelsListed.length === 0) return 1;
    return Math.min(14, Math.max(3, ollamaModelSelectOptions.length));
  }, [ollamaModelsListed, ollamaModelSelectOptions.length]);

  const saveGemini = useCallback(async () => {
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
      const ui = await window.translatorDesktop.setLlmUserSettings(body);
      setPayload(ui);
      setGeminiKeyDraft("");
      setDebugInfo(await window.translatorDesktop.getDebugInfo());
    } catch (e) {
      setGeminiFormErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaveGeminiBusy(false);
    }
  }, [geminiApiBaseDraft, geminiKeyDraft, geminiModelSelect, llmProvider]);

  const saveOllama = useCallback(async () => {
    setSaveOllamaBusy(true);
    setGeminiFormErr(null);
    try {
      const ui = await window.translatorDesktop.setLlmUserSettings({
        llmProvider: llmProvider === "auto" ? "" : llmProvider,
        ollamaBaseUrl: ollamaBaseDraft,
        ollamaModel: ollamaModelDraft,
      });
      setPayload(ui);
      setDebugInfo(await window.translatorDesktop.getDebugInfo());
    } catch (e) {
      setGeminiFormErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaveOllamaBusy(false);
    }
  }, [llmProvider, ollamaBaseDraft, ollamaModelDraft]);

  const clearGeminiKey = useCallback(async () => {
    setSaveGeminiBusy(true);
    setGeminiFormErr(null);
    try {
      const ui = await window.translatorDesktop.setLlmUserSettings({
        clearGeminiApiKey: true,
        geminiModel: geminiModelSelect,
        llmProvider: llmProvider === "auto" ? "" : llmProvider,
      });
      setPayload(ui);
      setDebugInfo(await window.translatorDesktop.getDebugInfo());
    } catch (e) {
      setGeminiFormErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaveGeminiBusy(false);
    }
  }, [geminiModelSelect, llmProvider]);

  const saveProviderOnly = useCallback(async () => {
    setGeminiFormErr(null);
    try {
      const ui = await window.translatorDesktop.setLlmUserSettings({
        llmProvider: llmProvider === "auto" ? "" : llmProvider,
      });
      setPayload(ui);
      setDebugInfo(await window.translatorDesktop.getDebugInfo());
    } catch (e) {
      setGeminiFormErr(e instanceof Error ? e.message : String(e));
    }
  }, [llmProvider]);

  const runPing = useCallback(async () => {
    setPingBusy(true);
    setPingResult(null);
    try {
      const out = await window.translatorDesktop.debugLlmPing();
      setPingResult(out);
      setDebugInfo(out.info);
    } catch (e) {
      let info: TranslatorDebugInfo;
      try {
        info = await window.translatorDesktop.getDebugInfo();
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
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="config-modal-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id="config-modal-title">Configuration</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="modal-body">
          <p className="modal-lead">
            Choose <strong>LLM_PROVIDER</strong> and provider credentials. Settings are stored on this device (not in
            a project <code>.env</code> file).
          </p>

          <div className="config-section">
            <label className="config-label" htmlFor="cfg-llm-provider">
              LLM provider
            </label>
            <select
              id="cfg-llm-provider"
              value={llmProvider}
              onChange={(e) => setLlmProvider(e.target.value)}
              className="config-select-wide"
            >
              {PROVIDERS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <button type="button" className="btn-secondary" onClick={() => void saveProviderOnly()}>
              Save provider choice
            </button>
          </div>

          {debugInfo && (
            <p className="config-status">
              Active model: <code>{debugInfo.modelVersion}</code> · Effective provider:{" "}
              <code>{debugInfo.llmProvider}</code>
            </p>
          )}

          <div className="config-section">
            <h3 className="config-subhead">Gemini</h3>
            <div className="config-field">
              <label htmlFor="cfg-gemini-key">API key</label>
              <input
                id="cfg-gemini-key"
                type="password"
                autoComplete="off"
                placeholder={payload?.geminiApiKeySaved ? "New key replaces saved key" : "Paste API key"}
                value={geminiKeyDraft}
                onChange={(e) => setGeminiKeyDraft(e.target.value)}
              />
            </div>
            {payload?.geminiApiKeySaved && <p className="config-hint">A key is already saved on this machine.</p>}
            <div className="config-field">
              <label htmlFor="cfg-gemini-base">API base URL</label>
              <input
                id="cfg-gemini-base"
                type="url"
                autoComplete="off"
                placeholder="https://generativelanguage.googleapis.com/v1beta"
                value={geminiApiBaseDraft}
                onChange={(e) => setGeminiApiBaseDraft(e.target.value)}
              />
            </div>
            <div className="config-field config-field-row">
              <label htmlFor="cfg-gemini-model">Model</label>
              <select
                id="cfg-gemini-model"
                value={geminiModelSelect}
                onChange={(e) => setGeminiModelSelect(e.target.value)}
              >
                {modelSelectOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <button type="button" disabled={listModelsBusy} onClick={() => void refreshGeminiModels()}>
                {listModelsBusy ? "Loading…" : "List models"}
              </button>
            </div>
            {listModelsErr && (
              <p className="config-error" role="alert">
                {listModelsErr}
              </p>
            )}
            <div className="config-actions">
              <button type="button" disabled={saveGeminiBusy} onClick={() => void saveGemini()}>
                {saveGeminiBusy ? "Saving…" : "Save Gemini settings"}
              </button>
              <button
                type="button"
                disabled={saveGeminiBusy || !payload?.geminiApiKeySaved}
                onClick={() => void clearGeminiKey()}
              >
                Clear saved key
              </button>
            </div>
          </div>

          <div className="config-section">
            <h3 className="config-subhead">Ollama</h3>
            <div className="config-field">
              <label htmlFor="cfg-ollama-url">Base URL</label>
              <input
                id="cfg-ollama-url"
                type="url"
                autoComplete="off"
                placeholder="http://127.0.0.1:11434"
                value={ollamaBaseDraft}
                onChange={(e) => setOllamaBaseDraft(e.target.value)}
              />
            </div>
            <div className="config-field">
              <label htmlFor="cfg-ollama-model">Model</label>
              <div className="config-ollama-model-row">
                <select
                  id="cfg-ollama-model"
                  className="config-ollama-model-select"
                  size={ollamaModelSelectSize}
                  aria-label="Ollama model"
                  value={ollamaModelDraft.trim() || ollamaModelSelectOptions[0]!.value}
                  onChange={(e) => setOllamaModelDraft(e.target.value)}
                >
                  {ollamaModelSelectOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <button type="button" disabled={ollamaListBusy} onClick={() => void refreshOllamaModels()}>
                  {ollamaListBusy ? "Loading…" : "List models"}
                </button>
              </div>
              {ollamaModelsListed !== null && ollamaModelsListed.length > 0 && (
                <p className="config-hint" role="status">
                  {ollamaModelsListed.length} model{ollamaModelsListed.length === 1 ? "" : "s"} on this server — select
                  one, then <strong>Save Ollama settings</strong>.
                </p>
              )}
            </div>
            {ollamaListErr && (
              <p className="config-error" role="alert">
                {ollamaListErr}
              </p>
            )}
            <div className="config-actions">
              <button type="button" disabled={saveOllamaBusy} onClick={() => void saveOllama()}>
                {saveOllamaBusy ? "Saving…" : "Save Ollama settings"}
              </button>
            </div>
          </div>

          <div className="config-section">
            <button type="button" disabled={pingBusy} onClick={() => void runPing()}>
              {pingBusy ? "Testing…" : "Test translation"}
            </button>
            {pingResult && (
              <pre className="config-ping-out" role="status">
                {pingResult.ok
                  ? `OK — ${pingResult.response.cacheHit ? "cache" : "live"}, ${pingResult.response.latencyMs} ms, model ${pingResult.response.modelVersion}\n${pingResult.response.translation}`
                  : `Failed: ${pingResult.error}`}
              </pre>
            )}
          </div>

          {geminiFormErr && (
            <p className="config-error" role="alert">
              {geminiFormErr}
            </p>
          )}
        </div>
        <div className="modal-footer">
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
