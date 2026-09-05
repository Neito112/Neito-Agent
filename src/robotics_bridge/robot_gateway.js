const http = require('http');
const deepGateway = require('../deep_reasoning_gateway.js');

// ─── EMBODIED AI & ROBOTICS GATEWAY (NI-OH PHYSICAL ASSISTANT) ───────────────
// Cổng giao tiếp thời gian thực kết nối Ni-Oh với các robot ngoài đời thực:
// - Vi điều khiển: ESP32, Arduino, Raspberry Pi 5
// - Nền tảng Robot: ROS 2 (Robot Operating System), Jetson Orin Nano
// - Chức năng: Thị giác không gian (Spatial Vision), điều khiển chuyển động (/cmd_vel),
//              điều khiển servo góc nhìn, phát âm thanh ra loa ngoài thực tế.

const ROBOT_PORT = process.env.ROBOT_PORT || 8910;
let connectedRobots = new Map();

const ROBOT_SYSTEM_PROMPT = `Bạn là Ni-Oh - Bộ Não Trí Tuệ Nhân Tạo Nhập Thể (Embodied AI & Robot Commander).
Nhiệm vụ của bạn là phân tích dữ liệu cảm biến (camera, khoảng cách siêu âm, pin) từ robot ngoài đời thực và đưa ra quyết định hành động chuẩn xác.
Các lệnh điều khiển hợp lệ bạn có thể sinh ra dưới dạng JSON:
- move: { "action": "move", "direction": "forward" | "backward", "speed": 0.1 -> 1.0, "duration": seconds }
- turn: { "action": "turn", "angle": -180 -> 180 }
- pan_tilt: { "action": "pan_tilt", "pan": 0-180, "tilt": 0-180 }
- speak: { "action": "speak", "text": "Câu nói phát qua loa của robot" }`;

// HTTP REST / Webhook fallback cho robot gửi telemetry
const robotServer = http.createServer((req, res) => {
  // 1. Nhận Telemetry từ Robot (POST /api/robot/telemetry)
  if (req.method === 'POST' && req.url === '/api/robot/telemetry') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      try {
        const telemetry = JSON.parse(body);
        const robotId = telemetry.id || 'robot_default';
        connectedRobots.set(robotId, {
          lastSeen: Date.now(),
          battery: telemetry.battery,
          distance_front: telemetry.distance_front,
          sensors: telemetry.sensors
        });

        // Nếu robot gửi ảnh camera để xin chỉ đạo di chuyển
        let replyAction = { action: "idle", status: "monitoring" };
        if (telemetry.query || telemetry.image) {
          const prompt = `[Dữ liệu cảm biến]: Pin: ${telemetry.battery}%, Vật cản trước mặt: ${telemetry.distance_front}cm.\n[Yêu cầu]: ${telemetry.query || 'Phân tích môi trường và quyết định di chuyển an toàn.'}`;
          const aiDecision = await deepGateway.reasonDeep(ROBOT_SYSTEM_PROMPT, prompt);
          replyAction = { action: "dispatch", decision: aiDecision };
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, timestamp: Date.now(), command: replyAction }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 2. Kiểm tra trạng thái đội ngũ Robot (GET /api/robot/status)
  if (req.method === 'GET' && req.url === '/api/robot/status') {
    const list = Array.from(connectedRobots.entries()).map(([id, data]) => ({
      id,
      ...data,
      isOnline: (Date.now() - data.lastSeen) < 15000
    }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ activeRobots: list }));
  }

  res.writeHead(404);
  res.end('Robot Gateway Endpoint Not Found');
});

function startRobotGateway(port = ROBOT_PORT) {
  robotServer.listen(port, () => {
    console.log(`\n🤖 [RoboticsBridge] Cổng kết nối Robot Vật Lý (Embodied AI) đang mở tại: http://localhost:${port}/`);
    console.log(`👉 Sẵn sàng tiếp nhận kết nối từ ESP32, Raspberry Pi, Jetson hoặc ROS 2 nodes!`);
  });
  return robotServer;
}

if (require.main === module) {
  startRobotGateway();
}

module.exports = { startRobotGateway };
