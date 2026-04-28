const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("translatorDesktop", {
  getConfig: () => ipcRenderer.invoke("desktop:get-config"),
  getDebugInfo: () => ipcRenderer.invoke("desktop:debug-info"),
  debugLlmPing: () => ipcRenderer.invoke("desktop:debug-llm-ping"),
  getLlmUserSettings: () => ipcRenderer.invoke("desktop:get-llm-user-settings"),
  setLlmUserSettings: (body) => ipcRenderer.invoke("desktop:set-llm-user-settings", body),
  listGeminiModels: (body) => ipcRenderer.invoke("desktop:list-gemini-models", body ?? {}),
  listOllamaModels: (body) => ipcRenderer.invoke("desktop:list-ollama-models", body ?? {}),
  translate: (body) => ipcRenderer.invoke("desktop:translate", body),
  translateBatch: (requests) =>
    ipcRenderer.invoke("desktop:translate-batch", { requests }),
  importDocument: () => ipcRenderer.invoke("desktop:import-document"),
});
