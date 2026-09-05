const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { execSync } = require('child_process');
const ExcelJS = require('exceljs');
const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = require('docx');
const pdfParse = require('pdf-parse');
const archiver = require('archiver');
const AdmZip = require('adm-zip');
const pptxgen = require('pptxgenjs');
const { EdgeTTS } = require('node-edge-tts');

// ffmpeg path from static package
let FFMPEG_BIN = 'ffmpeg';
try {
  const staticFfmpeg = require('ffmpeg-static');
  if (fs.existsSync(staticFfmpeg)) FFMPEG_BIN = staticFfmpeg;
} catch (_) {}

// Root Workspace Organization
const DRIVE_ROOT = path.join(__dirname, 'drive_workspace');
const FOLDERS = {
  kim:     path.join(DRIVE_ROOT, '01_TaiChinh_Kim'),
  cu:      path.join(DRIVE_ROOT, '02_NhaO_Cu'),
  khung:   path.join(DRIVE_ROOT, '03_KienTruc_Khung'),
  net:     path.join(DRIVE_ROOT, '04_DoHoa_Net'),
  tin:     path.join(DRIVE_ROOT, '05_DiemTin_Tin'),
  nioh:    path.join(DRIVE_ROOT, '06_TongHop_Nioh'),
  default: path.join(DRIVE_ROOT, '06_TongHop_Nioh'),
  zalo:    path.join(DRIVE_ROOT, '06_TongHop_Nioh')
};

function initDriveStructure() {
  if (!fs.existsSync(DRIVE_ROOT)) fs.mkdirSync(DRIVE_ROOT, { recursive: true });
  for (const f of Object.values(FOLDERS)) {
    if (!fs.existsSync(f)) fs.mkdirSync(f, { recursive: true });
  }
}
initDriveStructure();

// ─── 1. Download File ───────────────────────────────────────────────────────
function downloadFile(fileUrl, destPath) {
  return new Promise((resolve, reject) => {
    const proto = fileUrl.startsWith('https') ? https : http;
    const req = proto.get(fileUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return downloadFile(res.headers.location, destPath).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error('Download failed: HTTP ' + res.statusCode));
      }
      const fileStream = fs.createWriteStream(destPath);
      res.pipe(fileStream);
      fileStream.on('finish', () => { fileStream.close(); resolve(destPath); });
      fileStream.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(45000, () => { req.destroy(); reject(new Error('Download timeout')); });
  });
}

// ─── 2. Parse & Read Incoming Files (TOÀN BỘ CÁC THỂ LOẠI TỆP) ───────────────
async function parseIncomingFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const stat = fs.statSync(filePath);
  const fileSizeMb = stat.size / (1024 * 1024);

  // A. Hình ảnh (Image) -> Multimodal Base64
  if (['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tiff'].includes(ext)) {
    const b64 = fs.readFileSync(filePath).toString('base64');
    const mimeMap = {
      '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
      '.webp': 'image/webp', '.gif': 'image/gif', '.bmp': 'image/bmp', '.tiff': 'image/tiff'
    };
    return {
      type: 'image',
      base64: b64,
      mimeType: mimeMap[ext] || 'image/png',
      summary: 'Hình ảnh: ' + path.basename(filePath)
    };
  }

  // B. Âm thanh (Audio: MP3, WAV, OGG, M4A, FLAC, AAC) -> Multimodal Voice AI
  if (['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac', '.opus'].includes(ext)) {
    const mimeMap = {
      '.mp3': 'audio/mp3', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
      '.m4a': 'audio/mp4', '.flac': 'audio/flac', '.aac': 'audio/aac', '.opus': 'audio/ogg'
    };
    if (fileSizeMb <= 18) {
      const b64 = fs.readFileSync(filePath).toString('base64');
      return {
        type: 'audio',
        base64: b64,
        mimeType: mimeMap[ext] || 'audio/mp3',
        summary: 'Tệp âm thanh/giọng nói: ' + path.basename(filePath) + ' (' + fileSizeMb.toFixed(2) + ' MB) - Đã nạp vào Multimodal AI để nghe và giải mã'
      };
    } else {
      // File quá lớn -> nén hoặc cắt bằng ffmpeg
      try {
        const compressedPath = filePath.replace(ext, '_compressed.mp3');
        execSync(`"${FFMPEG_BIN}" -y -i "${filePath}" -ar 16000 -ac 1 -b:a 32k "${compressedPath}"`, { timeout: 30000 });
        const b64 = fs.readFileSync(compressedPath).toString('base64');
        return {
          type: 'audio',
          base64: b64,
          mimeType: 'audio/mp3',
          summary: 'Tệp âm thanh nén: ' + path.basename(filePath) + ' - Đã nén và nạp vào Multimodal AI'
        };
      } catch (err) {
        return { type: 'audio', summary: 'Tệp âm thanh dung lượng lớn: ' + path.basename(filePath) + ' (' + fileSizeMb.toFixed(2) + ' MB)' };
      }
    }
  }

  // C. Video (MP4, MOV, WEBM, MKV, AVI) -> Multimodal Vision & Audio AI
  if (['.mp4', '.mov', '.webm', '.mkv', '.avi'].includes(ext)) {
    const mimeMap = {
      '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm',
      '.mkv': 'video/mp4', '.avi': 'video/mp4'
    };
    if (fileSizeMb <= 15) {
      const b64 = fs.readFileSync(filePath).toString('base64');
      return {
        type: 'video',
        base64: b64,
        mimeType: mimeMap[ext] || 'video/mp4',
        summary: 'Tệp video: ' + path.basename(filePath) + ' (' + fileSizeMb.toFixed(2) + ' MB) - Đã nạp vào Multimodal AI xem khung hình và nghe âm thanh'
      };
    } else {
      // Tách audio từ video bằng ffmpeg để AI phân tích nội dung nói
      try {
        const extractedAudio = filePath.replace(ext, '_audio.mp3');
        execSync(`"${FFMPEG_BIN}" -y -i "${filePath}" -vn -ar 16000 -ac 1 -b:a 48k "${extractedAudio}"`, { timeout: 30000 });
        const b64 = fs.readFileSync(extractedAudio).toString('base64');
        return {
          type: 'audio',
          base64: b64,
          mimeType: 'audio/mp3',
          summary: 'Trích xuất âm thanh từ Video lớn: ' + path.basename(filePath) + ' (' + fileSizeMb.toFixed(2) + ' MB) - Đã nạp âm thanh vào AI'
        };
      } catch (err) {
        return { type: 'video', summary: 'Tệp video: ' + path.basename(filePath) + ' (' + fileSizeMb.toFixed(2) + ' MB)' };
      }
    }
  }

  // D. PDF Document (Support both PDFParse class and legacy function)
  if (ext === '.pdf') {
    try {
      const pdfModule = require('pdf-parse');
      let extractedText = '';
      let pageCount = 1;

      if (pdfModule.PDFParse) {
        const parser = new pdfModule.PDFParse(new Uint8Array(fs.readFileSync(filePath)));
        const res = await parser.getText();
        extractedText = res.text || '';
        pageCount = res.total || (res.pages && res.pages.length) || 1;
      } else if (typeof pdfModule === 'function') {
        const data = await pdfModule(fs.readFileSync(filePath));
        extractedText = data.text || '';
        pageCount = data.numpages || 1;
      }

      return {
        type: 'pdf',
        text: extractedText.substring(0, 18000),
        pages: pageCount,
        summary: 'PDF: ' + path.basename(filePath) + ' (' + pageCount + ' trang)'
      };
    } catch (e) {
      return { type: 'pdf', error: e.message, summary: 'Lỗi đọc PDF: ' + e.message };
    }
  }

  // E. Excel / CSV Spreadsheet
  if (['.xlsx', '.xls', '.csv'].includes(ext)) {
    try {
      const workbook = new ExcelJS.Workbook();
      if (ext === '.csv') await workbook.csv.readFile(filePath);
      else await workbook.xlsx.readFile(filePath);
      let tableText = '';
      workbook.eachSheet((ws) => {
        tableText += '\n[Sheet: ' + ws.name + ']\n';
        ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
          if (rowNumber <= 150) {
            tableText += row.values.filter(v => v !== undefined && v !== null).join(' | ') + '\n';
          }
        });
      });
      return {
        type: 'excel',
        text: tableText.substring(0, 18000),
        summary: 'Excel/CSV: ' + path.basename(filePath)
      };
    } catch (e) {
      return { type: 'excel', error: e.message, summary: 'Lỗi đọc Excel: ' + e.message };
    }
  }

  // F. Word Document (.docx)
  if (ext === '.docx') {
    try {
      const mammoth = require('mammoth');
      const result = await mammoth.extractRawText({ path: filePath });
      return {
        type: 'docx',
        text: result.value.substring(0, 18000),
        summary: 'Word (.docx): ' + path.basename(filePath)
      };
    } catch (e) {
      return { type: 'docx', error: e.message, summary: 'Lỗi đọc Word: ' + e.message };
    }
  }

  // G. PowerPoint Presentation (.pptx) -> Trích xuất toàn bộ slides
  if (ext === '.pptx') {
    try {
      const zip = new AdmZip(filePath);
      const zipEntries = zip.getEntries();
      let slideText = '';
      let slideCount = 0;

      // Sắp xếp các slide theo thứ tự slide1, slide2, ...
      const slideEntries = zipEntries
        .filter(e => e.entryName.startsWith('ppt/slides/slide') && e.entryName.endsWith('.xml'))
        .sort((a, b) => {
          const numA = parseInt(a.entryName.replace(/\D/g, '')) || 0;
          const numB = parseInt(b.entryName.replace(/\D/g, '')) || 0;
          return numA - numB;
        });

      slideCount = slideEntries.length;
      for (const entry of slideEntries) {
        const xml = entry.getData().toString('utf8');
        // Bóc tách text trong thẻ <a:t>
        const matches = xml.match(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g) || [];
        const texts = matches.map(m => m.replace(/<[^>]+>/g, '').trim()).filter(Boolean);
        if (texts.length > 0) {
          slideText += `\n[Slide ${path.basename(entry.entryName, '.xml')}]:\n${texts.join(' ')}\n`;
        }
      }

      return {
        type: 'pptx',
        text: slideText.substring(0, 18000),
        slides: slideCount,
        summary: `PowerPoint: ${path.basename(filePath)} (${slideCount} slides)`
      };
    } catch (e) {
      return { type: 'pptx', error: e.message, summary: 'Lỗi đọc PowerPoint: ' + e.message };
    }
  }

  // H. Tệp nén (ZIP Archive) -> Khám phá cấu trúc & đọc tệp con
  if (ext === '.zip') {
    try {
      const zip = new AdmZip(filePath);
      const entries = zip.getEntries();
      const fileList = entries.map(e => (e.isDirectory ? '[Thư mục] ' : '[Tệp] ') + e.entryName + ' (' + (e.header.size / 1024).toFixed(1) + ' KB)');
      
      // Trích xuất nội dung các file text/code quan trọng bên trong nếu có
      let sampleContent = '';
      for (const e of entries.slice(0, 5)) {
        if (!e.isDirectory && /\.(txt|md|json|js|py|html|csv)$/i.test(e.entryName) && e.header.size < 50000) {
          sampleContent += `\n--- Nội dung tệp [${e.entryName}] ---\n${e.getData().toString('utf8').substring(0, 2000)}\n`;
        }
      }

      return {
        type: 'archive',
        text: `Danh sách ${entries.length} tệp bên trong ZIP:\n${fileList.slice(0, 50).join('\n')}\n${sampleContent}`,
        count: entries.length,
        summary: `Tệp nén ZIP: ${path.basename(filePath)} (${entries.length} mục)`
      };
    } catch (e) {
      return { type: 'archive', error: e.message, summary: 'Lỗi đọc ZIP: ' + e.message };
    }
  }

  // I. Jupyter Notebook (.ipynb)
  if (ext === '.ipynb') {
    try {
      const nb = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      let nbText = `[Jupyter Notebook: ${path.basename(filePath)}]\n`;
      if (nb.cells) {
        nb.cells.forEach((cell, idx) => {
          const ctype = cell.cell_type;
          const src = Array.isArray(cell.source) ? cell.source.join('') : cell.source || '';
          nbText += `\n[Cell ${idx + 1} - ${ctype.toUpperCase()}]:\n${src}\n`;
        });
      }
      return {
        type: 'notebook',
        text: nbText.substring(0, 18000),
        summary: `Jupyter Notebook: ${path.basename(filePath)} (${nb.cells?.length || 0} cells)`
      };
    } catch (e) {
      return { type: 'notebook', error: e.message, summary: 'Lỗi đọc Notebook: ' + e.message };
    }
  }

  // --- CHUYÊN BIỆT: CÁC PHẦN MỀM ĐỒ HỌA, CAD & 3D (Corel, SketchUp, 3ds Max, AutoCAD, Illustrator) ---
  
  // 1. CorelDRAW (.cdr) -> Bóc tách ZIP Container lấy High-Res Thumbnail PNG & Metadata XML
  if (ext === '.cdr') {
    try {
      const zip = new AdmZip(filePath);
      const entries = zip.getEntries();
      let thumbnailEntry = entries.find(e => e.entryName.toLowerCase().includes('thumbnail.png') || e.entryName.toLowerCase().includes('preview.png'));
      let metaEntry = entries.find(e => e.entryName.toLowerCase().includes('metadata.xml') || e.entryName.toLowerCase().includes('metadata'));

      let b64 = null;
      if (thumbnailEntry) {
        b64 = thumbnailEntry.getData().toString('base64');
      }

      let metaText = '';
      if (metaEntry) {
        metaText = metaEntry.getData().toString('utf8').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      }

      return {
        type: b64 ? 'image' : 'vector_design',
        base64: b64,
        mimeType: 'image/png',
        text: `Bản vẽ CorelDRAW: ${path.basename(filePath)}\nMetadata: ${metaText.substring(0, 1000)}`,
        summary: `Bản vẽ CorelDRAW (.cdr): ${path.basename(filePath)} - Đã trích xuất ảnh Preview trực tiếp từ container để AI phân tích`
      };
    } catch (e) {
      // Fallback binary scan
    }
  }

  // 2. SketchUp (.skp), 3ds Max (.max), AutoCAD (.dwg), Adobe Illustrator (.ai) -> Trích xuất Embedded Thumbnail & Header
  if (['.skp', '.max', '.dwg', '.ai', '.psd', '.rvt'].includes(ext)) {
    try {
      const fileBuf = fs.readFileSync(filePath);
      let previewImage = null;

      // Quét tìm PNG Header nhúng
      const pngHeader = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
      const pngEnd = Buffer.from([0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82]);
      const pngIdx = fileBuf.indexOf(pngHeader);
      if (pngIdx !== -1) {
        const endIdx = fileBuf.indexOf(pngEnd, pngIdx);
        if (endIdx !== -1 && (endIdx - pngIdx) < 8 * 1024 * 1024) {
          previewImage = {
            data: fileBuf.slice(pngIdx, endIdx + 8).toString('base64'),
            mimeType: 'image/png'
          };
        }
      }

      // Nếu không có PNG, quét JPEG Header nhúng
      if (!previewImage) {
        const jpgHeader = Buffer.from([0xFF, 0xD8, 0xFF]);
        const jpgEnd = Buffer.from([0xFF, 0xD9]);
        const jpgIdx = fileBuf.indexOf(jpgHeader);
        if (jpgIdx !== -1) {
          const endIdx = fileBuf.indexOf(jpgEnd, jpgIdx);
          if (endIdx !== -1 && (endIdx - jpgIdx) < 8 * 1024 * 1024) {
            previewImage = {
              data: fileBuf.slice(jpgIdx, endIdx + 2).toString('base64'),
              mimeType: 'image/jpeg'
            };
          }
        }
      }

      // Header metadata info
      const headerStr = fileBuf.slice(0, 120).toString('utf8').replace(/[^\x20-\x7E]/g, '.');

      const appNames = {
        '.skp': 'Trimble SketchUp 3D Model',
        '.max': 'Autodesk 3ds Max Scene',
        '.dwg': 'AutoCAD Drawing Database',
        '.ai': 'Adobe Illustrator Vector',
        '.psd': 'Adobe Photoshop Layered Image',
        '.rvt': 'Autodesk Revit BIM Project'
      };

      if (previewImage) {
        return {
          type: 'image',
          base64: previewImage.data,
          mimeType: previewImage.mimeType,
          text: `[Tệp ${appNames[ext] || ext.toUpperCase()}: ${path.basename(filePath)}]\nHeader Signature: ${headerStr}\nĐã trích xuất thành công phối cảnh / bản vẽ Thumbnail nhúng gốc đưa vào AI quan sát trực quan!`,
          summary: `Tệp ${appNames[ext] || ext}: ${path.basename(filePath)} - Đã trích xuất phối cảnh Thumbnail nhúng gốc vào Vision AI`
        };
      } else {
        return {
          type: 'proprietary_cad',
          text: `[Tệp ${appNames[ext] || ext.toUpperCase()}: ${path.basename(filePath)}]\nDung lượng: ${(stat.size/1024/1024).toFixed(2)} MB\nHeader: ${headerStr}`,
          summary: `Tệp kỹ thuật ${appNames[ext] || ext}: ${path.basename(filePath)} (${(stat.size/1024/1024).toFixed(2)} MB)`
        };
      }
    } catch (cadErr) {
      // Tiếp tục xuống fallback
    }
  }

  // 3. AutoCAD DXF (.dxf) -> Đọc Vector Data ASCII thuần
  if (ext === '.dxf') {
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const layers = (raw.match(/8\r?\n([^\r\n]+)/g) || []).slice(0, 20).map(l => l.replace(/8\r?\n/, '').trim());
      const uniqueLayers = [...new Set(layers)];
      return {
        type: 'cad_dxf',
        text: `Bản vẽ AutoCAD DXF: ${path.basename(filePath)}\nCác Layer nhận diện được: ${uniqueLayers.join(', ')}\nDữ liệu mẫu:\n${raw.substring(0, 2500)}`,
        summary: `Bản vẽ AutoCAD DXF: ${path.basename(filePath)} (${uniqueLayers.length} layers)`
      };
    } catch (e) {
      return { type: 'cad_dxf', summary: `AutoCAD DXF: ${path.basename(filePath)}` };
    }
  }

  // J. 3D Models (.obj, .stl, .gltf) -> Kiến trúc sư Khung
  if (['.obj', '.stl', '.gltf'].includes(ext)) {
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const vCount = (raw.match(/^v\s+/gm) || []).length;
      const fCount = (raw.match(/^f\s+/gm) || []).length;
      return {
        type: '3d_model',
        text: `Mô hình 3D: ${path.basename(filePath)}\nSố đỉnh (Vertices): ${vCount}\nSố mặt (Faces): ${fCount}\nMẫu dữ liệu đầu file:\n${raw.substring(0, 1500)}`,
        summary: `Mô hình 3D [${ext}]: ${path.basename(filePath)} (${vCount} vertices, ${fCount} faces)`
      };
    } catch (e) {
      return { type: '3d_model', summary: `Mô hình 3D: ${path.basename(filePath)} (${(stat.size/1024).toFixed(1)} KB)` };
    }
  }

  // K. SQLite Database (.db, .sqlite, .sqlite3)
  if (['.db', '.sqlite', '.sqlite3'].includes(ext)) {
    try {
      const header = fs.readFileSync(filePath, { start: 0, end: 100 }).toString('utf8');
      return {
        type: 'database',
        text: `Cơ sở dữ liệu SQLite: ${path.basename(filePath)} (${(stat.size/1024).toFixed(1)} KB)\nHeader kiểm tra: ${header.substring(0, 40)}...`,
        summary: `Database SQLite: ${path.basename(filePath)}`
      };
    } catch (e) {
      return { type: 'database', summary: `Database: ${path.basename(filePath)}` };
    }
  }

  // L. Văn bản, Code, Config (30+ định dạng)
  const textExts = ['.txt', '.md', '.json', '.js', '.ts', '.py', '.cs', '.java',
    '.log', '.xml', '.html', '.css', '.yaml', '.yml', '.env', '.svg',
    '.sh', '.bat', '.ini', '.toml', '.sql', '.r', '.go', '.cpp',
    '.c', '.h', '.php', '.rb', '.rs', '.kt', '.swift', '.rtf'];
  if (textExts.includes(ext)) {
    try {
      const txt = fs.readFileSync(filePath, 'utf8');
      return {
        type: 'text',
        text: txt.substring(0, 18000),
        summary: `Tệp văn bản/code [${ext}]: ${path.basename(filePath)}`
      };
    } catch (e) {
      return { type: 'text', error: e.message, summary: 'Lỗi đọc tệp: ' + e.message };
    }
  }

  // M. Tệp nhị phân khác
  return {
    type: 'binary',
    summary: `Tệp nhị phân [${ext}]: ${path.basename(filePath)} (${(stat.size/1024).toFixed(1)} KB)`
  };
}

// ─── 3. Create Excel Spreadsheet ────────────────────────────────────────────
async function createExcelSpreadsheet(agentKey, fileName, sheetTitle, columns, rows) {
  const targetDir = FOLDERS[agentKey] || FOLDERS.default;
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
  const cleanName = fileName.endsWith('.xlsx') ? fileName : fileName + '.xlsx';
  const filePath = path.join(targetDir, cleanName);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Neito AI Ecosystem';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(sheetTitle || 'Báo Cáo');
  sheet.columns = columns.map(col => ({
    header: col.header || col.name || col,
    key: col.key || col.id || (typeof col === 'string' ? col : String(col)),
    width: col.width || 24
  }));

  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
  sheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

  rows.forEach(r => sheet.addRow(r));
  await workbook.xlsx.writeFile(filePath);

  return {
    filePath,
    relativePath: path.relative(__dirname, filePath),
    fileName: cleanName,
    size: fs.statSync(filePath).size
  };
}

// ─── 4. Create Word Document (.docx) ────────────────────────────────────────
async function createWordDocument(agentKey, fileName, title, sections) {
  const targetDir = FOLDERS[agentKey] || FOLDERS.default;
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
  const cleanName = fileName.endsWith('.docx') ? fileName : fileName + '.docx';
  const filePath = path.join(targetDir, cleanName);

  const children = [
    new Paragraph({ text: title, heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER }),
    new Paragraph({ text: 'Khởi tạo lúc: ' + new Date().toLocaleString('vi-VN'), alignment: AlignmentType.CENTER }),
    new Paragraph({ text: '' })
  ];

  for (const s of (sections || [])) {
    if (s.heading) children.push(new Paragraph({ text: s.heading, heading: HeadingLevel.HEADING_1 }));
    if (s.body) children.push(new Paragraph({ children: [new TextRun(s.body)] }));
    if (s.bullets) s.bullets.forEach(b => children.push(new Paragraph({ text: '• ' + b })));
    children.push(new Paragraph({ text: '' }));
  }

  const doc = new Document({ sections: [{ children }] });
  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(filePath, buffer);

  return {
    filePath,
    relativePath: path.relative(__dirname, filePath),
    fileName: cleanName,
    size: buffer.length
  };
}

// ─── 5. Create PowerPoint Presentation (.pptx) ──────────────────────────────
async function createPowerPointPresentation(agentKey, fileName, presentationTitle, slides) {
  const targetDir = FOLDERS[agentKey] || FOLDERS.default;
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
  const cleanName = fileName.endsWith('.pptx') ? fileName : fileName + '.pptx';
  const filePath = path.join(targetDir, cleanName);

  const pres = new pptxgen();
  pres.title = presentationTitle;
  pres.company = 'Neito AI Ecosystem';

  // Slide 1: Bìa (Title Slide)
  const titleSlide = pres.addSlide();
  titleSlide.background = { color: '1F4E79' };
  titleSlide.addText(presentationTitle, {
    x: 1, y: 2, w: 8, h: 1.5,
    fontSize: 32, bold: true, color: 'FFFFFF', align: 'center'
  });
  titleSlide.addText('Hệ Thống Báo Cáo Tự Động Neito AI | ' + new Date().toLocaleDateString('vi-VN'), {
    x: 1, y: 3.8, w: 8, h: 0.8,
    fontSize: 14, color: 'D9D9D9', align: 'center'
  });

  // Các slide nội dung
  for (const s of (slides || [])) {
    const slide = pres.addSlide();
    if (s.title) {
      slide.addText(s.title, {
        x: 0.8, y: 0.5, w: 8.5, h: 0.8,
        fontSize: 22, bold: true, color: '1F4E79'
      });
    }
    if (s.content) {
      slide.addText(s.content, {
        x: 0.8, y: 1.5, w: 8.5, h: 2,
        fontSize: 14, color: '333333'
      });
    }
    if (s.bullets && s.bullets.length > 0) {
      const bulletItems = s.bullets.map(b => ({ text: b, options: { bullet: true, fontSize: 13, color: '444444' } }));
      slide.addText(bulletItems, { x: 0.8, y: 2.2, w: 8.5, h: 4 });
    }
  }

  await pres.writeFile({ fileName: filePath });
  return {
    filePath,
    relativePath: path.relative(__dirname, filePath),
    fileName: cleanName,
    size: fs.statSync(filePath).size
  };
}

// ─── 6. Create PDF Document (.pdf) with Full Vietnamese Unicode Support ────
async function createPdfDocument(agentKey, fileName, title, content) {
  const { PDFDocument, rgb } = require('pdf-lib');
  const fontkit = require('@pdf-lib/fontkit');
  const targetDir = FOLDERS[agentKey] || FOLDERS.default;
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
  const cleanName = fileName.endsWith('.pdf') ? fileName : fileName + '.pdf';
  const filePath = path.join(targetDir, cleanName);

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  // Embed Windows Arial for complete Vietnamese UTF-8 glyphs
  const fontPath = 'C:\\Windows\\Fonts\\arial.ttf';
  const boldFontPath = 'C:\\Windows\\Fonts\\arialbd.ttf';
  let font, boldFont;
  if (fs.existsSync(fontPath)) {
    font = await pdfDoc.embedFont(fs.readFileSync(fontPath));
    boldFont = fs.existsSync(boldFontPath) ? await pdfDoc.embedFont(fs.readFileSync(boldFontPath)) : font;
  } else {
    const { StandardFonts } = require('pdf-lib');
    font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  }

  let page = pdfDoc.addPage([595, 842]); // A4
  const { width, height } = page.getSize();

  page.drawText(title || 'Tài Liệu Báo Cáo', {
    x: 50, y: height - 80,
    size: 20, font: boldFont, color: rgb(0.12, 0.31, 0.47)
  });
  page.drawText('Hệ Thống Neito AI Ecosystem | Thời gian: ' + new Date().toLocaleString('vi-VN'), {
    x: 50, y: height - 105,
    size: 9, font: font, color: rgb(0.5, 0.5, 0.5)
  });

  const bodyText = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
  const lines = bodyText.split('\n');
  let y = height - 140;

  for (const line of lines) {
    if (y < 50) {
      page = pdfDoc.addPage([595, 842]);
      y = height - 60;
    }
    page.drawText(line.substring(0, 110), { x: 50, y, size: 10, font: font, color: rgb(0.1, 0.1, 0.1) });
    y -= 16;
  }

  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync(filePath, pdfBytes);

  return {
    filePath,
    relativePath: path.relative(__dirname, filePath),
    fileName: cleanName,
    size: pdfBytes.length
  };
}

// ─── 7. Create Audio Speech File (.mp3 via EdgeTTS) ─────────────────────────
async function createAudioSpeechFile(agentKey, fileName, text, voiceGender = 'male') {
  const targetDir = FOLDERS[agentKey] || FOLDERS.default;
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
  const cleanName = fileName.endsWith('.mp3') ? fileName : fileName + '.mp3';
  const filePath = path.join(targetDir, cleanName);

  const voice = voiceGender === 'female' ? 'vi-VN-HoaiMyNeural' : 'vi-VN-NamMinhNeural';
  const tts = new EdgeTTS({
    voice: voice,
    lang: 'vi-VN',
    pitch: '+0Hz',
    rate: '+0%'
  });

  await tts.ttsPromise(text, filePath);

  return {
    filePath,
    relativePath: path.relative(__dirname, filePath),
    fileName: cleanName,
    size: fs.statSync(filePath).size,
    voice: voice
  };
}

// ─── 8. Media Conversion / Tool (FFmpeg) ────────────────────────────────────
function convertOrProcessMedia(inputFile, outputFile, options = '') {
  return new Promise((resolve, reject) => {
    const cmd = `"${FFMPEG_BIN}" -y -i "${inputFile}" ${options} "${outputFile}"`;
    exec(cmd, { timeout: 60000 }, (err, stdout, stderr) => {
      if (err) return reject(new Error('FFmpeg error: ' + (stderr || err.message)));
      resolve({
        outputFile,
        size: fs.existsSync(outputFile) ? fs.statSync(outputFile).size : 0
      });
    });
  });
}

// ─── 9. Create ZIP Archive ──────────────────────────────────────────────────
function createZipArchive(agentKey, fileName, filesToZip) {
  return new Promise((resolve, reject) => {
    const targetDir = FOLDERS[agentKey] || FOLDERS.default;
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
    const cleanName = fileName.endsWith('.zip') ? fileName : fileName + '.zip';
    const filePath = path.join(targetDir, cleanName);

    const output = fs.createWriteStream(filePath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', () => resolve({
      filePath,
      relativePath: path.relative(__dirname, filePath),
      fileName: cleanName,
      size: archive.pointer()
    }));
    archive.on('error', reject);
    archive.pipe(output);

    for (const f of (filesToZip || [])) {
      if (fs.existsSync(f)) archive.file(f, { name: path.basename(f) });
    }
    archive.finalize();
  });
}

// ─── 10. Write Text / Code File ─────────────────────────────────────────────
function createTextFile(agentKey, fileName, content, ext) {
  const targetDir = FOLDERS[agentKey] || FOLDERS.default;
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
  const useExt = ext || '.txt';
  const cleanName = fileName.includes('.') ? fileName : fileName + useExt;
  const filePath = path.join(targetDir, cleanName);
  fs.writeFileSync(filePath, content, 'utf8');
  return {
    filePath,
    relativePath: path.relative(__dirname, filePath),
    fileName: cleanName,
    size: fs.statSync(filePath).size
  };
}

// ─── 11. List Drive Workspace Files ────────────────────────────────────────
function listDriveFiles(agentKey) {
  const targetDir = FOLDERS[agentKey] || FOLDERS.default;
  if (!fs.existsSync(targetDir)) return [];
  return fs.readdirSync(targetDir).map(name => {
    const fp = path.join(targetDir, name);
    const stat = fs.statSync(fp);
    return { name, size: stat.size, modified: stat.mtime.toLocaleString('vi-VN') };
  });
}

module.exports = {
  DRIVE_ROOT,
  FOLDERS,
  FFMPEG_BIN,
  downloadFile,
  parseIncomingFile,
  createExcelSpreadsheet,
  createWordDocument,
  createPowerPointPresentation,
  createPdfDocument,
  createAudioSpeechFile,
  convertOrProcessMedia,
  createZipArchive,
  createTextFile,
  listDriveFiles
};



