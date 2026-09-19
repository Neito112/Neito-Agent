import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Package } from "lucide-react";

export function RequirementsList() {
  const requirements = [
    { name: "phidata", version: ">=2.0", desc: "Agent chính (Sếp)" },
    { name: "smolagents", version: ">=1.0", desc: "CodeAgent (Đệ tử)" },
    { name: "ultralytics", version: ">=8.0", desc: "YOLO model" },
    { name: "mss", version: ">=9.0", desc: "Screen capture" },
    { name: "mem0", version: ">=0.1", desc: "Long-term memory" },
    { name: "duckduckgo-search", version: ">=6.0", desc: "Web search" },
    { name: "openai", version: ">=1.0", desc: "OpenAI-compatible API" },
    { name: "python-dotenv", version: ">=1.0", desc: "Load .env config" },
  ];

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader>
        <CardTitle className="text-emerald-100 flex items-center gap-2">
          <Package className="w-4 h-4" /> requirements.txt
        </CardTitle>
        <CardDescription className="text-slate-400">
          Các thư viện cần cài đặt
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {requirements.map((req) => (
            <div key={req.name} className="flex items-center justify-between p-2 bg-slate-950 rounded-lg border border-slate-800">
              <div>
                <div className="text-sm font-mono text-emerald-300">{req.name}</div>
                <div className="text-xs text-slate-500">{req.desc}</div>
              </div>
              <span className="text-xs font-mono text-slate-400">{req.version}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}