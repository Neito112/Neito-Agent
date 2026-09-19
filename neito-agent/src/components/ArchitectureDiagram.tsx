import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Bot, Code2, Eye, Network, Database, Search } from "lucide-react";

export function ArchitectureDiagram() {
  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader>
        <CardTitle className="text-emerald-100">Kiến trúc Tổng thể</CardTitle>
        <CardDescription className="text-slate-400">
          Frontend + Backend giao tiếp qua UDP Localhost :4242
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Frontend */}
          <div className="p-4 bg-slate-950 rounded-lg border border-slate-800">
            <div className="text-sm font-semibold text-slate-300 mb-3">Frontend (UI Pet)</div>
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2 bg-slate-900 rounded border border-slate-700 text-xs text-slate-400">
                Cửa sổ trong suốt
              </div>
              <div className="p-2 bg-slate-900 rounded border border-slate-700 text-xs text-slate-400">
                Click-through
              </div>
              <div className="p-2 bg-slate-900 rounded border border-slate-700 text-xs text-slate-400">
                Drop & Play assets
              </div>
              <div className="p-2 bg-slate-900 rounded border border-slate-700 text-xs text-slate-400">
                Hiệu ứng thở
              </div>
            </div>
          </div>

          {/* UDP */}
          <div className="flex items-center gap-2 p-3 bg-emerald-500/10 rounded-lg border border-emerald-500/30">
            <Network className="w-4 h-4 text-emerald-400" />
            <span className="text-sm text-emerald-300 font-mono">UDP Localhost :4242</span>
          </div>

          {/* Backend */}
          <div className="p-4 bg-slate-950 rounded-lg border border-slate-800">
            <div className="text-sm font-semibold text-slate-300 mb-3">Backend Python</div>
            <div className="space-y-2">
              <div className="flex items-center gap-2 p-2 bg-emerald-500/10 rounded border border-emerald-500/30">
                <Bot className="w-4 h-4 text-emerald-400" />
                <div className="text-xs">
                  <div className="text-emerald-300 font-semibold">Sếp (phidata)</div>
                  <div className="text-slate-400">Chat + DuckDuckGo + Mem0</div>
                </div>
              </div>
              <div className="flex items-center gap-2 p-2 bg-teal-500/10 rounded border border-teal-500/30 ml-4">
                <Code2 className="w-4 h-4 text-teal-400" />
                <div className="text-xs">
                  <div className="text-teal-300 font-semibold">Đệ tử (smolagents)</div>
                  <div className="text-slate-400">CodeAgent - execute_python_task</div>
                </div>
              </div>
              <div className="flex items-center gap-2 p-2 bg-blue-500/10 rounded border border-blue-500/30">
                <Eye className="w-4 h-4 text-blue-400" />
                <div className="text-xs">
                  <div className="text-blue-300 font-semibold">Mắt thần (vision.py)</div>
                  <div className="text-slate-400">mss + ultralytics yolo11n</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}