const { exec } = require('child_process');
const protocolManager = require('./protocol_manager.js');

let lastDetectedApp = null;
let broadcastCallback = null;

const PROCESS_APP_MAP = {
  'leagueclient': 'lol',
  'leagueclientux': 'lol',
  'league of legends': 'lol',
  'valorant': 'valorant',
  'valorant-win64-shipping': 'valorant',
  'genshinimpact': 'genshin',
  'yuanshen': 'genshin',
  'cs2': 'cs2',
  'csgo': 'cs2',
  'b1-win64-shipping': 'Black Myth Wukong',
  'wukong': 'Black Myth Wukong',
  'blender': 'Blender 3D',
  'photoshop': 'Adobe Photoshop',
  'premiere': 'Adobe Premiere'
};

const IGNORED_PROCESSES = [
  'explorer', 'searchhost', 'systemsettings', 'node', 'cmd', 'powershell',
  'taskmgr', 'applicationframehost', 'shellexperiencehost', 'textinputhost',
  'antigravity', 'conhost', 'runtimebroker'
];

function setBroadcastCallback(cb) {
  broadcastCallback = cb;
}

function runPowerShell(cmd) {
  return new Promise((resolve) => {
    exec(cmd, { shell: 'powershell.exe', maxBuffer: 5 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ stdout: stdout || '', stderr: stderr || '', err });
    });
  });
}

// 1. Scan Local Windows Processes & Windows
async function scanLocalWindowsApps() {
  try {
    const res = await runPowerShell(`Get-Process | Where-Object { $_.MainWindowTitle -ne '' } | Select-Object Id, ProcessName, MainWindowTitle | ConvertTo-Json`);
    if (!res.stdout || !res.stdout.trim()) return null;

    let list = JSON.parse(res.stdout);
    if (!Array.isArray(list)) list = [list];

    for (const item of list) {
      const pName = (item.ProcessName || '').toLowerCase();
      const wTitle = (item.MainWindowTitle || '').trim();

      if (IGNORED_PROCESSES.includes(pName)) continue;
      if (!wTitle) continue;

      // Check against mapped processes
      if (PROCESS_APP_MAP[pName]) {
        return { name: PROCESS_APP_MAP[pName], title: wTitle, rawProcess: pName };
      }

      // Check if window title contains known game/app keywords
      const lowerTitle = wTitle.toLowerCase();
      for (const [k, v] of Object.entries(PROCESS_APP_MAP)) {
        if (lowerTitle.includes(k)) {
          return { name: v, title: wTitle, rawProcess: pName };
        }
      }
    }
  } catch (err) {
    // Ignore transient parse errors
  }
  return null;
}

// 2. Handle Detected Application / Game (Auto-activate or auto-create)
async function handleDetectedApp(appName, source = 'Windows Live') {
  if (!appName) return;
  if (appName === lastDetectedApp) return; // Already active / processed

  lastDetectedApp = appName;
  console.log(`[AppDetector] Detected active app/game from ${source}: "${appName}"`);

  // Check if protocol exists
  let targetProto = await protocolManager.setProtocol(appName);

  if (targetProto) {
    console.log(`[AppDetector] Auto-activated existing protocol: ${targetProto.name}`);
    if (broadcastCallback) {
      broadcastCallback({
        type: 'activated',
        appName,
        protocol: targetProto,
        source
      });
    }
    return targetProto;
  }

  // If no protocol exists for this app, dynamically create and activate!
  console.log(`[AppDetector] No existing protocol found for "${appName}". Auto-creating new AI Protocol...`);
  try {
    const newProto = await protocolManager.createAndActivateProtocol(appName);
    if (newProto) {
      console.log(`[AppDetector] Successfully auto-created & activated protocol: ${newProto.name}`);
      if (broadcastCallback) {
        broadcastCallback({
          type: 'created',
          appName,
          protocol: newProto,
          source
        });
      }
      return newProto;
    }
  } catch (err) {
    console.error(`[AppDetector] Failed to auto-create protocol for ${appName}:`, err.message);
  }
  return null;
}

// 3. Periodic Background Polling for Windows Live Apps
function startLiveAppWatcher(intervalMs = 12000) {
  console.log(`🟢 [AppDetector] Windows Live Process Watcher ACTIVE (Scan interval: ${intervalMs / 1000}s)`);
  setInterval(async () => {
    const app = await scanLocalWindowsApps();
    if (app && app.name) {
      await handleDetectedApp(app.name, `Process: ${app.title}`);
    }
  }, intervalMs);
}

// 4. Discord Presence / Stream Watcher Handler
async function handleDiscordPresence(oldPresence, newPresence) {
  if (!newPresence || !newPresence.activities) return;

  for (const act of newPresence.activities) {
    // ActivityType: 0 = Playing, 1 = Streaming, 2 = Listening, 3 = Watching, 5 = Competing
    if (act.name && act.name !== 'Custom Status') {
      await handleDetectedApp(act.name, 'Discord Go Live / Activity');
      break;
    }
  }
}

// 5. Smart Message Context Protocol Analyzer
function analyzeMessageProtocols(text) {
  const protocols = protocolManager.listProtocols();
  const matched = new Set();

  for (const [id, p] of Object.entries(protocols)) {
    if (id === 'general') continue;
    if (p.aliases && p.aliases.some(alias => protocolManager.matchAlias(text, alias))) {
      matched.add(id);
    }
  }

  const matchedList = Array.from(matched);

  if (matchedList.length === 1) {
    return { mode: 'single', protocolId: matchedList[0] };
  } else if (matchedList.length > 1) {
    return { mode: 'multiple', protocols: matchedList };
  }
  return { mode: 'none' };
}

module.exports = {
  startLiveAppWatcher,
  handleDiscordPresence,
  handleDetectedApp,
  analyzeMessageProtocols,
  setBroadcastCallback,
  scanLocalWindowsApps
};