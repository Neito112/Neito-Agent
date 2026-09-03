const fs = require('fs');
const path = require('path');
const genshinProtocol = require('./protocols/genshin_protocol.js');
const lolProtocol = require('./protocols/lol_protocol.js');
const valorantProtocol = require('./protocols/valorant_protocol.js');
const factory = require('./protocols/dynamic_protocol_factory.js');

const PROTOCOLS = {
  genshin: {
    id: 'genshin',
    name: 'Genshin Impact Protocol (Bách Khoa Toàn Thư Teyvat)',
    aliases: ['genshin', 'genshin impact', 'gi', 'teyvat'],
    description: 'Bách khoa toàn thư Teyvat: 7 quốc gia, Băng Quốc, Nod-Rai, Khaenri\'ah, giải đố cơ quan, build đội hình.',
    module: genshinProtocol
  },
  lol: {
    id: 'lol',
    name: 'Liên Minh Huyền Thoại Protocol (LOL)',
    aliases: ['lol', 'lmht', 'lien minh', 'liên minh', 'league of legends'],
    description: 'Cố vấn chiến thuật LMHT: Macro/Micro, wave control, jungle tracking, lên đồ thích ứng và giao tranh.',
    module: lolProtocol
  },
  valorant: {
    id: 'valorant',
    name: 'Valorant Protocol (Van Di / Văn Di)',
    aliases: ['valorant', 'van di', 'văn di', 'vandi', 'valo'],
    description: 'Cố vấn chiến thuật FPS: Economy, lineup đặc vụ, map callout, timing Spike, retake site.',
    module: valorantProtocol
  },
  general: {
    id: 'general',
    name: 'General Assistant Protocol (Trợ Lý Đa Năng)',
    aliases: ['general', 'mac dinh', 'mặc định', 'default'],
    description: 'Chế độ trợ lý tổng hợp thông thường (lập trình, quản trị hệ thống, tra cứu đa năng).',
    module: null
  }
};

let activeProtocolId = 'genshin';

// Auto-load dynamically created protocols from protocols/ folder
function loadDynamicProtocols() {
  const dir = path.join(__dirname, 'protocols');
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  for (const f of files) {
    if (f.endsWith('_protocol.js') && !['genshin_protocol.js', 'lol_protocol.js', 'valorant_protocol.js'].includes(f)) {
      try {
        const mod = require(path.join(dir, f));
        if (mod && mod.id) {
          PROTOCOLS[mod.id] = {
            id: mod.id,
            name: mod.name || mod.id,
            aliases: mod.aliases || [mod.id],
            description: `Giao thức chuyên sâu cho ${mod.name}`,
            module: mod
          };
        }
      } catch (e) {
        console.warn(`[ProtocolManager] Failed to load ${f}:`, e.message);
      }
    }
  }
}

loadDynamicProtocols();

// Switch protocol and auto-fetch latest updates on init
async function setProtocol(protocolQuery) {
  if (!protocolQuery) return null;
  const q = protocolQuery.toLowerCase().trim();
  
  // Find by ID or alias
  let target = null;
  for (const [id, p] of Object.entries(PROTOCOLS)) {
    if (id === q || (p.aliases && p.aliases.some(a => a === q || q.includes(a)))) {
      target = p;
      break;
    }
  }

  if (target) {
    activeProtocolId = target.id;
    // Trigger auto-update for the protocol on init
    if (target.module && typeof target.module.fetchLatestUpdates === 'function') {
      target.module.fetchLatestUpdates().catch(console.error);
    }
    return target;
  }
  return null;
}

// Smart Voice Resolver: Detect voice switch requests
function resolveProtocolByVoice(voiceTranscript) {
  const lower = voiceTranscript.toLowerCase();
  if (lower.includes('đổi sang giao thức') || lower.includes('chuyển sang giao thức') || lower.includes('bật giao thức') || lower.includes('chuyển giao thức') || lower.includes('đổi giao thức')) {
    for (const [id, p] of Object.entries(PROTOCOLS)) {
      if (p.aliases && p.aliases.some(a => lower.includes(a))) {
        return setProtocol(id);
      }
    }
  }
  return null;
}

// Create a new protocol dynamically and switch to it
async function createAndActivateProtocol(appNameOrGame) {
  const result = await factory.createNewProtocol(appNameOrGame);
  if (result) {
    PROTOCOLS[result.id] = {
      id: result.id,
      name: result.name,
      aliases: [result.id, appNameOrGame.toLowerCase()],
      description: `Giao thức tự động tạo cho ${result.name}`,
      module: result.module
    };
    return await setProtocol(result.id);
  }
  return null;
}

function getActiveProtocol() {
  return PROTOCOLS[activeProtocolId];
}

function listProtocols() {
  return PROTOCOLS;
}

module.exports = {
  setProtocol,
  resolveProtocolByVoice,
  createAndActivateProtocol,
  getActiveProtocol,
  listProtocols,
  genshin: genshinProtocol,
  lol: lolProtocol,
  valorant: valorantProtocol
};
