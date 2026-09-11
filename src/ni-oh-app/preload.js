const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('niOhAPI', {
  // Config
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  onInitConfig: (cb) => ipcRenderer.on('init-config', (_, c) => cb(c)),
  onConfigUpdate: (cb) => ipcRenderer.on('config-update', (_, c) => cb(c)),
  onSwitchTab: (cb) => ipcRenderer.on('switch-tab', (_, t) => cb(t)),

  // Question answering
  askQuestion: (question) => ipcRenderer.invoke('ask-question', question),

  // Voice / TTS
  speak: (text) => ipcRenderer.invoke('speak', text),

  // Character
  getCharacters: () => ipcRenderer.invoke('get-characters'),
  selectCharacter: (name) => ipcRenderer.invoke('select-character', name),

  // Overlay
  setOverlayPosition: (pos) => ipcRenderer.invoke('set-overlay-position', pos),
  getOverlayPosition: () => ipcRenderer.invoke('get-overlay-position'),
  toggleOverlay: () => ipcRenderer.invoke('toggle-overlay'),
  getOverlayState: () => ipcRenderer.invoke('get-overlay-state'),

  // Realtime scan toggle
  toggleRealtimeScan: () => ipcRenderer.invoke('toggle-realtime-scan'),

  // Voice training from sample
  trainVoiceFromSample: (filePath) => ipcRenderer.invoke('train-voice-from-sample', filePath),

  // Model lists
  getAgYModels: () => ipcRenderer.invoke('get-agy-models'),
  getOllamaModels: () => ipcRenderer.invoke('get-ollama-models'),

  // Self-train
  runSelfTrain: (opts) => ipcRenderer.invoke('run-self-train', opts),
  unlearnLastRule: () => ipcRenderer.invoke('unlearn-last-rule'),
});
