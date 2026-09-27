/**
 * 全站统一的 CSV 解析器。
 * - 支持引号包裹字段(含逗号、换行、转义双引号 "")——修复旧 data-import 版本
 *   按行分割导致"引号内换行"解析错位的问题。
 * - parseCsv: 返回原始字段(不 trim), data-clean 使用。
 * - parseCsvTable: 首行为表头并 trim 每个字段, data-import 使用。
 */

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** 首行作为表头, 字段两端去空白 */
export function parseCsvTable(text: string): { headers: string[]; rows: string[][] } {
  const all = parseCsv(text.trim());
  if (all.length === 0) return { headers: [], rows: [] };
  const trimRow = (row: string[]) => row.map((v) => v.trim());
  return { headers: trimRow(all[0]), rows: all.slice(1).map(trimRow) };
}
