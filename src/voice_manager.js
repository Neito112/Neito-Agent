const ffmpegPath = require('ffmpeg-static');
process.env.FFMPEG_PATH = ffmpegPath;

const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  EndBehaviorType
} = require('@discordjs/voice');
const { EdgeTTS } = require('node-edge-tts');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { spawn } = require('child_process');
const { pipeline } = require('stream');
const prism = require('prism-media');

const GEMINI_KEY = "AIzaSyCBtopxSMXhJYAoI0D_ytzQCut_LB67VXc";

// Engine selection: 'vieneu' (Quân Hồng VieNeu AI), 'ms-nam' (Nam Minh), 'ms-nu' (Hoài My), 'google' (Google Standard)
let currentEngine = 'vieneu';
let customVoiceName = 'Quân Hồng';

let currentConnection = null;
let audioPlayer = null;
let currentTextChannel = null;
let isSpeaking = false;
let speechQueue = [];

function getVieNeuApiKey() {
  try {
    const keysPath = path.join(__dirname, 'api_keys.json');
    if (fs.existsSync(keysPath)) {
      const keys = JSON.parse(fs.readFileSync(keysPath, 'utf8'));
      return keys.vieneu || process.env.VIENEU_API_KEY || '';
    }
  } catch (_) {}
  return process.env.VIENEU_API_KEY || '';
}

function setCustomVoice(voiceCode) {
  if (voiceCode && voiceCode.trim()) {
    customVoiceName = voiceCode.trim();
    return customVoiceName;
  }
  return null;
}

// Phonetic Dictionary for Natural Vietnamese Pronunciation
function normalizeForVietnameseSpeech(raw) {
  if (!raw) return '';
  return raw
    .replace(/[*_~`#|>]/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\[.*?\]/g, '')
    .replace(/💡|🎙️|🔊|ℹ️|⚠️|❌|🟢|🔴|🤖|👤|🧠|👉|✨|🎮|📌|🛡️/g, '')
    .replace(/\bJARVIS\b/gi, 'Gia Vít')
    .replace(/\bJ\.A\.R\.V\.I\.S\b/gi, 'Gia Vít')
    .replace(/\bAI\b/gi, 'A I')
    .replace(/\bDiscord\b/gi, 'Đít Coóc')
    .replace(/\bStream\b/gi, 'xì trim')
    .replace(/\bLive\b/gi, 'lai')
    .replace(/\bBot\b/gi, 'bốt')
    .replace(/\bNode\b/gi, 'nốt')
    .replace(/\bNeito\b/gi, 'Nây Tô')
    .replace(/\bPuzzle\b/gi, 'câu đố')
    .replace(/\bQuest\b/gi, 'nhiệm vụ')
    .replace(/\bError\b/gi, 'lỗi')
    .replace(/\bOK\b/gi, 'ô kê')
    .replace(/\bOnline\b/gi, 'trực tuyến')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 450);
}

// 1. VieNeu Neural TTS (Giọng Quân Hồng AI đỉnh cao)
function generateVieNeuTTS(text, voiceName, outputPath) {
  return new Promise((resolve, reject) => {
    const apiKey = getVieNeuApiKey();
    const payload = JSON.stringify({
      input: text,
      voice: voiceName || "Quân Hồng"
    });

    const headers = {
      'Content-Type': 'application/json'
    };
    if (apiKey) {
      headers['Authorization'] = 'Bearer ' + apiKey;
    }

    const file = fs.createWriteStream(outputPath);
    const req = https.request({
      hostname: 'api.vieneu.io',
      path: '/api/v1/audio/speech',
      method: 'POST',
      headers: headers,
      timeout: 10000
    }, (res) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        res.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve(outputPath);
        });
      } else {
        let errBody = '';
        res.on('data', c => errBody += c);
        res.on('end', () => {
          try { file.close(); fs.unlinkSync(outputPath); } catch (_) {}
          reject(new Error(`VieNeu API status ${res.statusCode}: ${errBody}`));
        });
      }
    });

    req.on('error', (e) => {
      try { file.close(); fs.unlinkSync(outputPath); } catch (_) {}
      reject(e);
    });
    req.on('timeout', () => {
      req.destroy();
      try { file.close(); fs.unlinkSync(outputPath); } catch (_) {}
      reject(new Error('VieNeu Timeout'));
    });

    req.write(payload);
    req.end();
  });
}

// 2. Google Standard Vietnamese TTS
function generateGoogleTTS(text, outputPath) {
  return new Promise((resolve, reject) => {
    const encoded = encodeURIComponent(text);
    const url = 'https://translate.google.com/translate_tts?ie=UTF-8&q=' + encoded + '&tl=vi&client=tw-ob';
    const file = fs.createWriteStream(outputPath);
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      },
      timeout: 10000
    }, (res) => {
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve(outputPath);
      });
    }).on('error', (err) => {
      try { file.close(); fs.unlinkSync(outputPath); } catch (_) {}
      reject(err);
    });
  });
}

// 3. Microsoft Neural TTS (Nam Minh / Hoài My)
async function generateMicrosoftTTS(text, voiceName, outputPath) {
  const tts = new EdgeTTS({
    voice: voiceName,
    lang: 'vi-VN',
    pitch: '+0Hz',
    rate: '+0%'
  });
  await tts.ttsPromise(text, outputPath);
  return outputPath;
}

function getOrCreatePlayer() {
  if (!audioPlayer) {
    audioPlayer = createAudioPlayer();
    audioPlayer.on(AudioPlayerStatus.Idle, () => {
      isSpeaking = false;
      playNextInQueue();
    });
    audioPlayer.on('error', (err) => {
      console.error('[VoiceManager] Audio player error:', err.message);
      isSpeaking = false;
      playNextInQueue();
    });
  }
  return audioPlayer;
}

function playNextInQueue() {
  if (speechQueue.length === 0 || isSpeaking) return;
  isSpeaking = true;
  const nextItem = speechQueue.shift();
  try {
    const resource = createAudioResource(nextItem.filePath);
    audioPlayer.play(resource);
  } catch (err) {
    console.error('[VoiceManager] Error playing audio resource:', err.message);
    isSpeaking = false;
    playNextInQueue();
  }
}

// Convert text to speech with standard Vietnamese pronunciation
async function speak(text) {
  if (!currentConnection) return false;
  try {
    const cleanText = normalizeForVietnameseSpeech(text);
    if (!cleanText) return false;

    const tempAudio = path.join(process.env.TEMP, `jarvis_speech_${Date.now()}.mp3`);

    if (currentEngine === 'vieneu') {
      try {
        await generateVieNeuTTS(cleanText, customVoiceName || 'Quân Hồng', tempAudio);
      } catch (vnErr) {
        console.warn('[VoiceManager] VieNeu Quân Hồng error / no key, falling back to MS NamMinh:', vnErr.message);
        await generateMicrosoftTTS(cleanText, 'vi-VN-NamMinhNeural', tempAudio);
      }
    } else if (currentEngine === 'google') {
      try {
        await generateGoogleTTS(cleanText, tempAudio);
      } catch (gErr) {
        console.warn('[VoiceManager] Google TTS failed, fallback to MS NamMinh:', gErr.message);
        await generateMicrosoftTTS(cleanText, 'vi-VN-NamMinhNeural', tempAudio);
      }
    } else if (currentEngine === 'ms-nam') {
      await generateMicrosoftTTS(cleanText, 'vi-VN-NamMinhNeural', tempAudio);
    } else if (currentEngine === 'ms-nu') {
      await generateMicrosoftTTS(cleanText, 'vi-VN-HoaiMyNeural', tempAudio);
    } else if (currentEngine === 'custom') {
      await generateMicrosoftTTS(cleanText, customVoiceName, tempAudio);
    }

    getOrCreatePlayer();
    speechQueue.push({ filePath: tempAudio, text: cleanText });
    if (!isSpeaking) playNextInQueue();
    return true;
  } catch (err) {
    console.error('[VoiceManager] TTS speak error:', err.message);
    return false;
  }
}

// Convert raw PCM buffer to MP3
function convertPcmToMp3(pcmBuffer) {
  return new Promise((resolve, reject) => {
    const outputPath = path.join(process.env.TEMP, `user_voice_${Date.now()}.mp3`);
    const ffmpeg = spawn(ffmpegPath, [
      '-f', 's16le',
      '-ar', '48000',
      '-ac', '2',
      '-i', 'pipe:0',
      '-ar', '16000',
      '-ac', '1',
      '-b:a', '64k',
      '-y',
      outputPath
    ]);

    ffmpeg.stdin.write(pcmBuffer);
    ffmpeg.stdin.end();

    ffmpeg.on('close', (code) => {
      if (code === 0 && fs.existsSync(outputPath)) {
        resolve(outputPath);
      } else {
        reject(new Error(`ffmpeg exited with code ${code}`));
      }
    });

    ffmpeg.on('error', reject);
  });
}

// STT: Transcribe audio with Gemini 3.6 Flash
function transcribeAudioFile(audioFilePath) {
  return new Promise((resolve, reject) => {
    const base64Audio = fs.readFileSync(audioFilePath).toString('base64');
    const payload = JSON.stringify({
      contents: [{
        parts: [
          { inline_data: { mime_type: 'audio/mp3', data: base64Audio } },
          { text: 'Bạn là bộ chuyển giọng nói thành văn bản tiếng Việt. Hãy chép lại chính xác lời người nói. Nếu không có giọng nói con người rõ ràng hoặc chỉ là tiếng ồn/nhạc nền, trả về đúng từ: NO_SPEECH' }
        ]
      }]
    });

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${GEMINI_KEY}`;
    const req = https.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const transcript = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
          resolve(transcript);
        } catch (e) {
          reject(e);
        } finally {
          try { fs.unlinkSync(audioFilePath); } catch (_) {}
        }
      });
    });

    req.on('error', (e) => {
      try { fs.unlinkSync(audioFilePath); } catch (_) {}
      reject(e);
    });
    req.on('timeout', () => {
      req.destroy();
      try { fs.unlinkSync(audioFilePath); } catch (_) {}
      reject(new Error('STT Timeout'));
    });
    req.write(payload);
    req.end();
  });
}

// Join Voice Channel & Setup Listeners
function joinVoice(voiceChannel, textChannel, onVoicePromptCallback) {
  if (currentConnection) {
    try { currentConnection.destroy(); } catch (_) {}
  }

  currentTextChannel = textChannel;
  const player = getOrCreatePlayer();

  currentConnection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: voiceChannel.guild.id,
    adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    selfDeaf: false,
    selfMute: false
  });

  currentConnection.subscribe(player);

  currentConnection.on(VoiceConnectionStatus.Ready, () => {
    console.log(`[VoiceManager] Connected to voice channel: ${voiceChannel.name} (Engine: ${currentEngine} - Voice: ${customVoiceName})`);
    speak("Thưa Sếp Neito. Em là Gia Vít, đã sẵn sàng hỗ trợ sếp!");
  });

  const receiver = currentConnection.receiver;

  receiver.speaking.on('start', (userId) => {
    const opusStream = receiver.subscribe(userId, {
      end: {
        behavior: EndBehaviorType.AfterSilence,
        duration: 800
      }
    });

    const decoder = new prism.opus.Decoder({
      rate: 48000,
      channels: 2,
      frameSize: 960
    });

    const chunks = [];
    pipeline(opusStream, decoder, (err) => {
      if (err && err.code !== 'ERR_STREAM_PREMATURE_CLOSE') {
        // Stream closed
      }
    });

    decoder.on('data', (chunk) => chunks.push(chunk));
    decoder.on('end', async () => {
      const pcmBuffer = Buffer.concat(chunks);
      if (pcmBuffer.length < 15000) return;

      try {
        const mp3Path = await convertPcmToMp3(pcmBuffer);
        const transcript = await transcribeAudioFile(mp3Path);
        if (!transcript || transcript.includes('NO_SPEECH') || transcript.length < 3) return;
        
        console.log(`[VoiceManager] Heard speech: "${transcript}"`);

        const lower = transcript.toLowerCase();
        if (lower.includes('jarvis') || lower.includes('gia vít') || lower.includes('hệ thống') || lower.includes('ravis') || lower.includes('travis') || lower.includes('za vít') || lower.includes('da vít')) {
          console.log(`[VoiceManager] Wake-word MATCHED! Forwarding to handler...`);
          if (onVoicePromptCallback) {
            onVoicePromptCallback(transcript, currentTextChannel);
          }
        }
      } catch (err) {
        console.error('[VoiceManager] Audio processing error:', err.message);
      }
    });
  });

  return true;
}

function leaveVoice() {
  if (currentConnection) {
    try { currentConnection.destroy(); } catch (_) {}
    currentConnection = null;
    audioPlayer = null;
    console.log('[VoiceManager] Left voice channel.');
    return true;
  }
  return false;
}

// Parallel broadcast: Voice + Text Channel
async function broadcast(text, textChannel = null) {
  const targetChannel = textChannel || currentTextChannel;
  if (targetChannel && targetChannel.send) {
    targetChannel.send(text).catch(console.error);
  }
  if (currentConnection) {
    await speak(text);
  }
}

function setEngine(engineName) {
  if (['vieneu', 'google', 'ms-nam', 'ms-nu'].includes(engineName)) {
    currentEngine = engineName;
    if (engineName === 'vieneu') customVoiceName = 'Quân Hồng';
    return true;
  }
  return false;
}

module.exports = {
  setCustomVoice,
  getCustomVoice: () => customVoiceName,
  joinVoice,
  leaveVoice,
  speak,
  broadcast,
  setEngine,
  getEngine: () => currentEngine,
  isConnected: () => !!currentConnection,
  getTextChannel: () => currentTextChannel
};