const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("translatorDesktop", {
  getConfig: () => ipcRenderer.invoke("desktop:get-config"),
  translate: (body) => ipcRenderer.invoke("desktop:translate", body),
  translateBatch: (requests) =>
    ipcRenderer.invoke("desktop:translate-batch", { requests }),
});
