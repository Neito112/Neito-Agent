import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Activity, Cpu, Eye, Bot, Code2 } from "lucide-react";

interface SystemStatusProps {
  isRunning: boolean;
  visionEnabled: boolean;
}

export function SystemStatus({ isRunning, visionEnabled }: SystemStatusProps) {
  const components = [
    { name: "UI Pet", icon: Bot, status: isRunning, color: "text-teal-400" },
    { name: "Vision (YOLO)", icon: Eye, status: isRunning && visionEnabled, color: "text-blue-400" },
    { name: "Sếp (phidata)", icon: Cpu, status: isRunning, color: "text-emerald-400" },
    { name: "Đệ tử (smolagents)", icon: Code2, status: isRunning, color: "text-teal-400" },
  ];

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader>
        <CardTitle className="text-emerald-100 flex items-center gap-2">
          <Activity className="w-4 h-4" /> Trạng thái hệ thống
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {components.map((comp) => (
            <div key={comp.name} className="flex items-center justify-between p-2 bg-slate-950 rounded-lg border border-slate-800">
              <div className="flex items-center gap-2">
                <comp.icon className={`w-4 h-4 ${comp.color}`} />
                <span className="text-sm text-slate-300">{comp.name}</span>
              </div>
              <Badge className={comp.status ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-500/20 text-slate-400"}>
                {comp.status ? "ACTIVE" : "STOPPED"}
              </Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}