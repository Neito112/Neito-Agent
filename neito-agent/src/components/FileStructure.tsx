import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Folder, FileCode, FileText, FileJson } from "lucide-react";

export function FileStructure() {
  const files = [
    { name: "requirements.txt", icon: FileText, desc: "Thư viện Python cần cài" },
    { name: "main.py", icon: FileCode, desc: "Khởi chạy đa tiến trình" },
    { name: "brain.py", icon: FileCode, desc: "Sếp + Đệ tử (phidata + smolagents)" },
    { name: "vision.py", icon: FileCode, desc: "Mắt thần (mss + YOLO)" },
    { name: "ui_pet/", icon: Folder, desc: "Giao diện desktop pet" },
    { name: "assets/current_pet/", icon: Folder, desc: "Thư mục drop & play" },
  ];

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader>
        <CardTitle className="text-emerald-100">Cấu trúc dự án</CardTitle>
        <CardDescription className="text-slate-400">
          Tổ chức file theo kiến trúc phân cấp
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {files.map((file) => (
            <div key={file.name} className="flex items-center gap-3 p-2 bg-slate-950 rounded-lg border border-slate-800 hover:border-emerald-500/50 transition-colors">
              <file.icon className="w-4 h-4 text-emerald-400" />
              <div>
                <div className="text-sm font-mono text-slate-300">{file.name}</div>
                <div className="text-xs text-slate-500">{file.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}