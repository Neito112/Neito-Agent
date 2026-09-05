const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const deepGateway = require('./deep_reasoning_gateway.js');

// ─── COMPUTATION & SHEET ENGINE (Tối Ưu Token Bằng Công Thức Bảng Tính) ─────
// Triết lý: AI không nên dùng token đắt đỏ để tính toán từng con số (dễ sai số lớn).
// Ni-Oh sẽ xây dựng CÔNG THỨC HÀM (Google Sheets / Excel Formula / JS Math Script)
// và nạp dữ liệu số vào để máy tính tự động tính toán chính xác 100% (0 TOKEN PHÍ PHẠM).

// Tạo một file bảng tính có công thức tự động tính toán phức tạp
async function createFormulaDrivenSheet(agentKey, fileName, sheetTitle, headers, rows, formulaColumns = {}) {
  const targetDir = path.join(__dirname, 'drive_workspace', agentKey === 'default' ? '06_TongHop_Nioh' : '01_TaiChinh_Kim');
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

  const cleanName = fileName.endsWith('.xlsx') ? fileName : fileName + '.xlsx';
  const filePath = path.join(targetDir, cleanName);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Ni-Oh Strategic Assistant';
  const sheet = workbook.addWorksheet(sheetTitle || 'Tính Toán Tự Động');

  // Thêm header
  sheet.addRow(headers);
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

  // Thêm các dòng dữ liệu và áp dụng công thức
  rows.forEach((rowValues, rowIndex) => {
    const rowNum = rowIndex + 2; // Dòng 1 là header
    const processedRow = rowValues.map((val, colIndex) => {
      const colLetter = String.fromCharCode(65 + colIndex);
      // Nếu cột này có định nghĩa công thức
      if (formulaColumns[colLetter]) {
        const formulaTemplate = formulaColumns[colLetter];
        return { formula: formulaTemplate.replace(/\{ROW\}/g, rowNum) };
      }
      return val;
    });
    sheet.addRow(processedRow);
  });

  // Tự động căn chỉnh độ rộng cột
  sheet.columns.forEach(col => {
    let maxLen = 15;
    col.eachCell({ includeEmpty: true }, cell => {
      const valStr = cell.value ? cell.value.toString() : '';
      if (valStr.length > maxLen) maxLen = Math.min(valStr.length + 3, 40);
    });
    col.width = maxLen;
  });

  await workbook.xlsx.writeFile(filePath);
  return {
    filePath,
    relativePath: path.relative(__dirname, filePath),
    fileName: cleanName,
    size: fs.statSync(filePath).size
  };
}

// Xây dựng giải thuật tính toán phức tạp bằng JavaScript thuần (Zero Token Cloud)
function executeLocalMathematicalScript(mathExpressionOrCode, dataScope = {}) {
  try {
    const fn = new Function('data', `
      with(data) {
        return (${mathExpressionOrCode});
      }
    `);
    const result = fn(dataScope);
    return { success: true, result };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// Nhờ Ni-Oh tạo công thức tối ưu cho bài toán học tập / công việc của Sếp
async function generateOptimizedFormula(problemDescription) {
  const sysPrompt = `Bạn là Ni-Oh - Chuyên Gia Tối Ưu Giải Thuật Bảng Tính & Toán Học. ` +
                    `Sếp đang có bài toán quy mô lớn. Để tiết kiệm token tuyệt đối, KHÔNG TÍNH TOÁN THỦ CÔNG. ` +
                    `Hãy xuất ra: ` +
                    `1. Công thức Google Sheets / Excel tối ưu nhất (dùng SUMPRODUCT, XLOOKUP, QUERY, INDEX/MATCH, ARRAYFORMULA...). ` +
                    `2. Giải thích ngắn gọn cách áp dụng trong 2 dòng.`;
  return await deepGateway.reasonDeep(sysPrompt, problemDescription);
}

module.exports = {
  createFormulaDrivenSheet,
  executeLocalMathematicalScript,
  generateOptimizedFormula
};
