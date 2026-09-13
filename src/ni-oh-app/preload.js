const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('niOhAPI', {
  // Config
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  onInitConfig: (cb) => ipcRenderer.on('init-config', (_, c) => cb(c)),
  onConfigUpdate: (cb) => ipcRenderer.on('config-update', (_, c) => cb(c)),
  onSwitchTab: (cb) => ipcRenderer.on('switch-tab', (_, t) => cb(t)),

  // Window controls (frameless)
  winMinimize: () => ipcRenderer.send('win-minimize'),
  winMaximize: () => ipcRenderer.send('win-maximize'),
  winClose: () => ipcRenderer.send('win-close'),

  // Overlay: báo vùng tương tác (click-through phần trong suốt)
  setClickable: (on) => ipcRenderer.send('overlay-clickable', !!on),
  overlayMetrics: (mt) => ipcRenderer.send('overlay-metrics', mt),
  onEmotion: (cb) => ipcRenderer.on('emotion', (_, mood, sec) => cb(mood, sec)),

  readAsset: (rel) => ipcRenderer.invoke('read-asset', rel),

  // Question answering
  askQuestion: (question) => ipcRenderer.invoke('ask-question', question),

  // Voice / TTS
  speak: (text) => ipcRenderer.invoke('speak', text),
  testVoice: () => ipcRenderer.invoke('test-voice'),
  onSay: (cb) => ipcRenderer.on('say', (_, t) => cb(t)),
  onTalkState: (cb) => ipcRenderer.on('talk-state', (_, on) => cb(on)),
  onPlayFile: (cb) => ipcRenderer.on('play-file', (_, m) => cb(m)),
  onThinking: (cb) => ipcRenderer.on('thinking', (_, sec) => cb(sec)),

  // Character
  getCharacters: () => ipcRenderer.invoke('get-characters'),
  selectCharacter: (name) => ipcRenderer.invoke('select-character', name),

  // Overlay — kéo thả bám con trỏ (main đọc cursor OS, chuẩn DPI)
  overlayDragStart: () => ipcRenderer.invoke('overlay-drag-start'),
  overlayDragMove: () => ipcRenderer.send('overlay-drag-move'),
  overlayDragEnd: () => ipcRenderer.send('overlay-drag-end'),
  moveOverlay: (pos) => ipcRenderer.send('move-overlay', pos),
  setOverlayPosition: (pos) => ipcRenderer.invoke('set-overlay-position', pos),
  getOverlayPosition: () => ipcRenderer.invoke('get-overlay-position'),
  toggleOverlay: () => ipcRenderer.invoke('toggle-overlay'),
  getOverlayState: () => ipcRenderer.invoke('get-overlay-state'),

  // Microphone (STT)
  setMicMode: (mode) => ipcRenderer.invoke('set-mic-mode', mode),
  getMicStatus: () => ipcRenderer.invoke('get-mic-status'),
  micTalk: (on) => ipcRenderer.send('mic-talk', on),
  micToggle: () => ipcRenderer.invoke('mic-toggle'),

  // Realtime scan toggle
  toggleRealtimeScan: () => ipcRenderer.invoke('toggle-realtime-scan'),

  // Voice training from sample
  trainVoiceFromSample: (filePath) => ipcRenderer.invoke('train-voice-from-sample', filePath),

  // Model lists
  getAgYModels: () => ipcRenderer.invoke('get-agy-models'),
  getAgyStatus: () => ipcRenderer.invoke('get-agy-status'),
  getOllamaModels: () => ipcRenderer.invoke('get-ollama-models'),

  // Train theo chủ đề (agy → kiến thức cho YOLO + trigger)
  trainTopic: (topic) => ipcRenderer.invoke('train-topic', topic),
  getVisionStatus: () => ipcRenderer.invoke('get-vision-status'),

  // Soul & Tools & Topics chi tiết & Assets
  getSoul: () => ipcRenderer.invoke('get-soul'),
  saveSoul: (text) => ipcRenderer.invoke('save-soul', text),
  getTools: () => ipcRenderer.invoke('get-tools'),
  getTopicDetail: (slug) => ipcRenderer.invoke('get-topic-detail', slug),
  deleteTopic: (slug) => ipcRenderer.invoke('delete-topic', slug),
  deleteEntry: (slug, cue) => ipcRenderer.invoke('delete-entry', slug, cue),
  addEntry: (slug, entry) => ipcRenderer.invoke('add-entry', slug, entry),
  addConcept: (slug, concept) => ipcRenderer.invoke('add-concept', slug, concept),
  deleteConcept: (slug, name) => ipcRenderer.invoke('delete-concept', slug, name),
  deleteSituation: (slug, id) => ipcRenderer.invoke('delete-situation', slug, id),
  openFolder: (which) => ipcRenderer.invoke('open-folder', which),
  saveCharacterAssets: (payload) => ipcRenderer.invoke('save-character-assets', payload),
  quickGenAsset: (payload) => ipcRenderer.invoke('quick-gen-asset', payload),

  learnerStatus: () => ipcRenderer.invoke('learner-status'),
  learnerAdd: (slug, url, note) => ipcRenderer.invoke('learner-add', { slug, url, note }),
  learnerOnce: () => ipcRenderer.invoke('learner-once'),
  conceptsRun: (slug, mode, image) => ipcRenderer.invoke('concepts-run', { slug, mode, image }),
  situationStatus: () => ipcRenderer.invoke('situation-status'),
  situationSetAnswer: (slug, id, answer, source) => ipcRenderer.invoke('situation-set-answer', { slug, id, answer, source }),

  // Kho mở rộng: skill / tool / mcp / plugin / admin
  extList: () => ipcRenderer.invoke('ext-list'),
  extAdmin: (on) => ipcRenderer.invoke('ext-admin', on),
  extOpenFolder: () => ipcRenderer.invoke('ext-open-folder'),
  extMcpAdd: (e) => ipcRenderer.invoke('ext-mcp-add', e),
  extMcpRemove: (n) => ipcRenderer.invoke('ext-mcp-remove', n),
  extMcpToggle: (n, on) => ipcRenderer.invoke('ext-mcp-toggle', n, on),
  extPluginAdd: (e) => ipcRenderer.invoke('ext-plugin-add', e),
  extPluginRemove: (n) => ipcRenderer.invoke('ext-plugin-remove', n),
  extPluginToggle: (n, on) => ipcRenderer.invoke('ext-plugin-toggle', n, on),
  extSyncAgy: () => ipcRenderer.invoke('ext-sync-agy'),
  extSkillSave: (p) => ipcRenderer.invoke('ext-skill-save', p),
  extSkillRemove: (id) => ipcRenderer.invoke('ext-skill-remove', id),
  extToolSave: (p) => ipcRenderer.invoke('ext-tool-save', p),
  extToolRemove: (id) => ipcRenderer.invoke('ext-tool-remove', id),
  extAsk: (q) => ipcRenderer.invoke('ext-ask', q),
  extPickZip: () => ipcRenderer.invoke('ext-pick-zip'),
  extRequest: (p) => ipcRenderer.invoke('ext-request', p),
  extHealth: () => ipcRenderer.invoke('ext-health'),
  extPluginInstall: (t) => ipcRenderer.invoke('ext-plugin-install', t),

  // Self-train cũ
  runSelfTrain: (opts) => ipcRenderer.invoke('run-self-train', opts),
  unlearnLastRule: () => ipcRenderer.invoke('unlearn-last-rule'),
});
