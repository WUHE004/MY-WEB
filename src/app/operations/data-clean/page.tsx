"use client";

import { useState, useRef, useMemo, useCallback, useEffect } from "react";
import * as XLSX from "xlsx";
import {
  ArrowLeft,
  RefreshCw,
  Filter,
  FilterX,
  Download,
  Upload,
  FolderOpen,
  FileSpreadsheet,
  Loader2,
  AlertTriangle,
  X,
  PenLine,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageWrapper } from "@/components/page-wrapper";

// 有效尺码（有且仅有）
const SIZES = new Set(["80", "90", "95", "100", "105", "110", "120", "130", "140", "150", "160", "170", "180"]);
// 支持的表格扩展名
const SUPPORTED_EXTS = [".xlsx", ".xls", ".csv", ".cvs"];
// 数据来源: dy=抖店 pdd=拼多多(按表头自动识别)
type SourceType = "dy" | "pdd";
// 原始表展示列(按来源切换, 均归一化为5列)
const DY_ORIG_HEADERS = ["选购商品", "商品数量", "商品金额", "支付完成时间", "快递信息"];
const PDD_ORIG_HEADERS = ["商品规格", "商品数量", "商品总价", "支付时间", "面单号(自动)"];
const MIXED_ORIG_HEADERS = ["商品/规格", "数量", "金额", "时间", "快递/面单"];
// 清洗结果列
const CLEAN_HEADERS = ["尺码", "售卖数量", "售价", "售卖编号", "下单时间", "面单号"];
// 抖店原始表各数据列的表头名 -> 默认下标
const DEFAULT_COLMAP: Record<string, number> = {
  选购商品: 0,
  商品数量: 1,
  商品金额: 2,
  支付完成时间: 3,
  快递信息: 4,
};
// 拼多多原始表各数据列的表头名 -> 默认下标
// (A商品 B商品数量 C支付时间 D商品规格 E商家编码-规格维度 F商家编码-商品维度 G商品总价)
const PDD_COLMAP: Record<string, number> = {
  商品规格: 3,
  商品数量: 1,
  支付时间: 2,
  "商家编码-规格维度": 4,
  "商家编码-商品维度": 5,
  商品总价: 6,
};

interface OrigRow {
  file: string;
  vals: string[];
}
// [尺码, 售卖数量, 售价, 售卖编号, 下单时间, 面单号]
type CleanRow = [string, string, string, string, string, string];
interface FailedFile {
  name: string;
  err: string;
}

// ---------------- 提取逻辑 ----------------

/** 提取尺码: 取最后一个'/'后(无'/'则最后一个'-'后)的片段, 截断到第一个括号,
 * 返回其中第一个属于有效尺码的数字; 无则返回空 */
function extractSize(text: string): string {
  let seg = String(text ?? "");
  if (seg.includes("/")) {
    seg = seg.split("/").pop() || "";
  } else if (seg.includes("-")) {
    seg = seg.split("-").pop() || "";
  }
  for (const ch of ["（", "("]) {
    const idx = seg.indexOf(ch);
    if (idx !== -1) seg = seg.slice(0, idx);
  }
  for (const num of seg.match(/\d+/g) || []) {
    if (SIZES.has(num)) return num;
  }
  return "";
}

/** 提取售卖编号: 优先 大写字母+1~3位数字(如 A895/F69/K2); 否则 3位纯数字(如 288).
 * 优先取最后一个'-'之后的匹配, 否则取全文第一个匹配.
 * 直播表格常见"范围标题+实际编号"格式(如 "K6-K23...现-K6泉日记洗衣机清洁剂" 或 "F1-F32...-F2/130"),
 * 实际编号位于最后一个'-'之后, 依赖尾部优先规则提取 */
function extractCode(text: string): string {
  const t = String(text ?? "");
  const patLetter = /(?<![A-Z0-9])[A-Z]\d{1,3}(?!\d)/g;
  let m = t.match(patLetter);
  if (m && m.length) {
    const tail = t.includes("-") ? t.split("-").pop() || "" : "";
    const mt = tail.match(patLetter);
    if (mt && mt.length) return mt[mt.length - 1];
    return m[0];
  }
  const patDigit = /(?<!\d)\d{3}(?!\d)/g;
  m = t.match(patDigit);
  if (m && m.length) {
    const tail = t.includes("-") ? t.split("-").pop() || "" : "";
    const mt = tail.match(patDigit);
    if (mt && mt.length) return mt[0];
    return m[0];
  }
  return "";
}

/** 提取拼多多商品规格中的尺码: 扫描全部数字, 返回第一个属于有效尺码的数字
 * (如 "桃色,9# 110"→110, "灰色,130"→130, "蓝色,23#"→无有效尺码返回空) */
function extractPddSize(spec: string): string {
  const t = String(spec ?? "");
  for (const num of t.match(/\d+/g) || []) {
    if (SIZES.has(num)) return num;
  }
  return "";
}

// ---------------- 文件读取 ----------------

function formatDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** 单元格转文本: 数字去掉多余 .0, 日期转为标准时间格式 */
function cellToText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return formatDate(v);
  if (typeof v === "number") {
    return Number.isInteger(v) ? String(v) : String(v);
  }
  return String(v).trim();
}

/** 简单 CSV 解析(支持引号转义) */
function parseCsv(text: string): string[][] {
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

/** 读取 CSV: utf-8 优先, 出现乱码回退 gbk */
async function readCsvFile(file: File): Promise<string[][]> {
  const buffer = await file.arrayBuffer();
  let text: string;
  const utf8 = new TextDecoder("utf-8").decode(buffer);
  if (utf8.includes("\uFFFD")) {
    try {
      text = new TextDecoder("gbk").decode(buffer);
    } catch {
      text = utf8;
    }
  } else {
    text = utf8;
  }
  // 去除 BOM
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return parseCsv(text);
}

/** 表头行识别并判断数据来源:
 * 含'商家编码'或'商品规格' → 拼多多; 含'选购商品'/'快递信息'/'支付完成时间' 或含'商品数量' → 抖店 */
function detectHeader(vals: string[]): SourceType | null {
  if (!vals || vals.length === 0) return null;
  const joined = vals.join("|");
  if (joined.includes("商家编码") || joined.includes("商品规格")) return "pdd";
  if (vals[0] === "选购商品" || joined.includes("快递信息") || joined.includes("支付完成时间")) return "dy";
  if (vals.slice(0, 8).some((v) => v && v.includes("商品数量"))) return "dy";
  return null;
}

/** 读取单个表格, 返回 (数据行列表, 列下标映射, 数据来源); 不含表头行 */
async function readSpreadsheet(file: File): Promise<{ rows: string[][]; colMap: Record<string, number>; source: SourceType } | null> {
  const dotIdx = file.name.lastIndexOf(".");
  const ext = dotIdx === -1 ? "" : file.name.slice(dotIdx).toLowerCase();
  const raw: string[][] = [];

  if (ext === ".xlsx" || ext === ".xls") {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: "array", cellDates: true });
    for (const name of wb.SheetNames) {
      const ws = wb.Sheets[name];
      const arr = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
      for (const row of arr) {
        const vals = row.map(cellToText);
        if (vals.some((v) => v !== "")) raw.push(vals);
      }
    }
  } else if (ext === ".csv" || ext === ".cvs") {
    const rows = await readCsvFile(file);
    for (const row of rows) {
      const vals = row.map((v) => v.trim());
      if (vals.some((v) => v !== "")) raw.push(vals);
    }
  } else {
    return null;
  }

  let colMap: Record<string, number> | null = null;
  let source: SourceType | null = null;
  const rows: string[][] = [];
  for (const vals of raw) {
    if (!source) {
      const st = detectHeader(vals);
      if (st) {
        source = st;
        const map: Record<string, number> = { ...(st === "pdd" ? PDD_COLMAP : DEFAULT_COLMAP) };
        vals.forEach((v, i) => {
          for (const key of Object.keys(map)) {
            if (v.includes(key)) map[key] = i;
          }
        });
        colMap = map;
        continue;
      }
    }
    rows.push(vals);
  }
  // 无表头时按抖店默认列处理
  if (!source || !colMap) {
    source = "dy";
    colMap = { ...DEFAULT_COLMAP };
  }
  return { rows, colMap, source };
}

function cellAt(vals: string[], idx: number): string {
  return (idx < vals.length ? vals[idx] : "").trim();
}

/** 遍历 DataTransfer 中的文件与文件夹(支持拖入整个文件夹) */
async function scanDataTransfer(dt: DataTransfer): Promise<File[]> {
  const items = Array.from(dt.items || []);
  const entries = items
    .map((item) => (item.kind === "file" && item.webkitGetAsEntry ? item.webkitGetAsEntry() : null))
    .filter(Boolean) as FileSystemEntry[];

  // 不支持 entry API 时直接取 files
  if (entries.length === 0) {
    return Array.from(dt.files || []);
  }

  const files: File[] = [];
  async function walk(entry: FileSystemEntry): Promise<void> {
    if (entry.isFile) {
      const fileEntry = entry as FileSystemFileEntry;
      await new Promise<void>((resolve) => {
        fileEntry.file(
          (f) => {
            files.push(f);
            resolve();
          },
          () => resolve()
        );
      });
    } else if (entry.isDirectory) {
      const dirEntry = entry as FileSystemDirectoryEntry;
      const reader = dirEntry.createReader();
      const readBatch = (): Promise<void> =>
        new Promise((resolve) => {
          reader.readEntries(async (batch) => {
            if (batch.length === 0) {
              resolve();
              return;
            }
            for (const e of batch) await walk(e);
            await readBatch();
            resolve();
          }, () => resolve());
        });
      await readBatch();
    }
  }
  for (const e of entries) await walk(e);
  return files;
}

/** 过滤出支持的表格文件(跳过临时文件与本工具导出文件) */
function filterSupported(files: File[]): File[] {
  return files.filter((f) => {
    const name = f.name;
    const dotIdx = name.lastIndexOf(".");
    const ext = dotIdx === -1 ? "" : name.slice(dotIdx).toLowerCase();
    if (!SUPPORTED_EXTS.includes(ext)) return false;
    if (name.startsWith("~$") || name.startsWith("售出导入-")) return false;
    return true;
  });
}

// ---------------- 错误行判断 ----------------

/** 缺失 尺码/售价/编号/面单号 之一即为错误行 */
function isErrorRow(row: CleanRow): boolean {
  return !(row[0] && row[2] && row[3] && row[5]);
}

/** 清洗结果行背景色: 缺编号(红) > 缺尺码(黄) > 缺售价(橙) > 缺面单号(蓝) > 斑马纹
 * sizeFilled: 批量追加填入尺码的行, 保留黄色标记以提示原本缺尺码 */
function rowBg(row: CleanRow, idx: number, selected: boolean, sizeFilled?: Set<number>): string {
  if (selected) return "bg-[#3375e6] text-white";
  if (!row[3]) return "bg-[#f8d7da]";
  if (!row[0] || sizeFilled?.has(idx)) return "bg-[#fff3cd]";
  if (!row[2]) return "bg-[#ffd9c0]";
  if (!row[5]) return "bg-[#d9e7fd]";
  return idx % 2 === 1 ? "bg-gray-50" : "bg-white";
}

// 售出清单导入格式的表头（与 /data-import 售出模板一致）
const IMPORT_SALES_HEADERS = ["售卖编号", "尺码", "数量", "售价", "厂家", "备注", "下单时间", "面单号"];

/** CSV 单元格转义: 含逗号/引号/换行时用引号包裹 */
function csvEscape(v: string | number): string {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * 将清洗结果转为售出清单导入格式的 CSV 文本
 * CleanRow = [尺码, 售卖数量, 售价, 售卖编号, 下单时间, 面单号]
 */
function buildImportCsv(cleanRows: CleanRow[]): string {
  const lines = [IMPORT_SALES_HEADERS.join(",")];
  for (const r of cleanRows) {
    const cols = [r[3], r[0], r[1], r[2], "", "", r[4], r[5]];
    lines.push(cols.map(csvEscape).join(","));
  }
  return lines.join("\n");
}

// ---------------- 页面 ----------------

export default function DataCleanPage() {
  const router = useRouter();
  const [origData, setOrigData] = useState<OrigRow[]>([]);
  const [cleanData, setCleanData] = useState<CleanRow[]>([]);
  const [sourceDisplay, setSourceDisplay] = useState("");
  const [okFiles, setOkFiles] = useState<string[]>([]);
  const [failedFiles, setFailedFiles] = useState<FailedFile[]>([]);
  const [filterOn, setFilterOn] = useState(false);
  // 本次数据来源: dy=抖店 pdd=拼多多 mixed=两者混合
  const [sourceMode, setSourceMode] = useState<"dy" | "pdd" | "mixed">("dy");
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [selectedIdx, setSelectedIdx] = useState<number>(-1);
  // 单元格编辑状态
  const [editing, setEditing] = useState<{ idx: number; col: number } | null>(null);
  const [editValue, setEditValue] = useState("");
  // 无尺码批量填入
  const [manualSize, setManualSize] = useState("");
  // 批量填入过尺码的行索引(保留黄色背景提示原本缺尺码)
  const [sizeFilled, setSizeFilled] = useState<Set<number>>(new Set());

  const sourceFilesRef = useRef<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const origScrollRef = useRef<HTMLDivElement>(null);
  const cleanScrollRef = useRef<HTMLDivElement>(null);
  const syncingRef = useRef(false);

  // 文件夹选择需要 webkitdirectory 属性(非标准)
  useEffect(() => {
    if (folderInputRef.current) {
      folderInputRef.current.setAttribute("webkitdirectory", "");
    }
  }, []);

  // ---------- 数据加载与清洗 ----------

  const processFiles = useCallback(async (files: File[]) => {
    const supported = filterSupported(files);
    if (supported.length === 0) {
      const others = files.filter((f) => !f.name.startsWith("~$"));
      setLoadError(
        others.length > 0 && filterSupported(others).length === 0
          ? `仅支持 xlsx / xls / csv 表格文件, 已忽略 ${others.length} 个不支持的文件`
          : "仅支持 xlsx / xls / csv 表格文件"
      );
      return;
    }
    setLoadError("");
    setLoading(true);
    sourceFilesRef.current = supported;

    const orig: OrigRow[] = [];
    const clean: CleanRow[] = [];
    const ok: string[] = [];
    const failed: FailedFile[] = [];
    const sources = new Set<SourceType>();
    // 拼多多无面单号, 统一为 多多+当天日期(如 多多20260902)
    const pad2 = (n: number) => String(n).padStart(2, "0");
    const now = new Date();
    const pddTracking = `多多${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}`;

    for (const file of supported) {
      try {
        const result = await readSpreadsheet(file);
        if (!result) continue;
        const { rows, colMap, source } = result;
        sources.add(source);
        for (const vals of rows) {
          if (source === "pdd") {
            // 拼多多: 尺码←商品规格, 数量←商品数量, 售价←商品总价,
            // 编号←商家编码(规格维度优先, 为空则商品维度), 下单时间←支付时间
            const spec = cellAt(vals, colMap["商品规格"]);
            const qty = cellAt(vals, colMap["商品数量"]);
            const price = cellAt(vals, colMap["商品总价"]);
            const payTime = cellAt(vals, colMap["支付时间"]);
            const codeE = cellAt(vals, colMap["商家编码-规格维度"]);
            const codeF = cellAt(vals, colMap["商家编码-商品维度"]);
            const code = codeE || codeF;
            orig.push({ file: file.name, vals: [spec, qty, price, payTime, pddTracking] });
            clean.push([extractPddSize(spec), qty, price, code, payTime, pddTracking]);
          } else {
            // 抖店: 原有逻辑
            const text = cellAt(vals, colMap["选购商品"]);
            const qty = cellAt(vals, colMap["商品数量"]);
            const price = cellAt(vals, colMap["商品金额"]);
            const payTime = cellAt(vals, colMap["支付完成时间"]);
            const exprInfo = cellAt(vals, colMap["快递信息"]);
            // 面单号 = 快递信息中第一个"-"之前的内容
            const tracking = exprInfo ? exprInfo.split("-", 1)[0].trim() : "";
            orig.push({ file: file.name, vals: [text, qty, price, payTime, exprInfo] });
            clean.push([extractSize(text), qty, price, extractCode(text), payTime, tracking]);
          }
        }
        ok.push(file.name);
      } catch (e) {
        failed.push({ name: file.name, err: e instanceof Error ? e.message : String(e) });
      }
    }

    setOrigData(orig);
    setCleanData(clean);
    setOkFiles(ok);
    setSourceMode(sources.has("pdd") && sources.has("dy") ? "mixed" : sources.has("pdd") ? "pdd" : "dy");
    setFailedFiles(failed);
    setFilterOn(false);
    setSelectedIdx(-1);
    setEditing(null);
    setSizeFilled(new Set());
    setSourceDisplay(supported.length === 1 ? supported[0].name : `已拖入 ${supported.length} 个表格文件`);
    setLoading(false);
  }, []);

  // 重新清洗(重置手动编辑)
  const reClean = useCallback(() => {
    if (sourceFilesRef.current.length === 0) return;
    processFiles(sourceFilesRef.current);
  }, [processFiles]);

  // 无尺码批量填入: 将所有缺尺码行填入手动输入的尺码, 保留黄色背景提示
  const applyManualSize = useCallback(() => {
    const val = manualSize.trim();
    if (!val) return;
    const filled = new Set<number>();
    setCleanData((prev) =>
      prev.map((row, i) => {
        if (!row[0]) {
          filled.add(i);
          const next = [...row];
          next[0] = val;
          return next as CleanRow;
        }
        return row;
      })
    );
    setSizeFilled((prev) => new Set([...prev, ...filled]));
  }, [manualSize]);

  // ---------- 拖拽 ----------

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const files = await scanDataTransfer(e.dataTransfer);
      processFiles(files);
    },
    [processFiles]
  );

  // ---------- 筛选 ----------

  const visibleIndices = useMemo(() => {
    if (filterOn) {
      return cleanData.map((_, i) => i).filter((i) => isErrorRow(cleanData[i]));
    }
    return cleanData.map((_, i) => i);
  }, [cleanData, filterOn]);

  const missStats = useMemo(
    () => ({
      size: cleanData.filter((r) => !r[0]).length,
      price: cleanData.filter((r) => !r[2]).length,
      code: cleanData.filter((r) => !r[3]).length,
      track: cleanData.filter((r) => !r[5]).length,
    }),
    [cleanData]
  );

  // ---------- 同步滚动 ----------

  const handleScroll = (source: "orig" | "clean") => (e: React.UIEvent<HTMLDivElement>) => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    const target = source === "orig" ? cleanScrollRef.current : origScrollRef.current;
    if (target) target.scrollTop = e.currentTarget.scrollTop;
    setTimeout(() => {
      syncingRef.current = false;
    }, 0);
  };

  // ---------- 单元格编辑 ----------

  const startEdit = (idx: number, col: number) => {
    setEditing({ idx, col });
    setEditValue(cleanData[idx][col]);
  };

  const saveEdit = () => {
    if (!editing) return;
    const { idx, col } = editing;
    setCleanData((prev) => {
      const next = [...prev];
      const row = [...next[idx]];
      row[col] = editValue.trim();
      next[idx] = row as CleanRow;
      return next;
    });
    setEditing(null);
  };

  // ---------- 导出 ----------

  const handleExport = () => {
    if (cleanData.length === 0) return;
    const today = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const dateStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

    // 生成售出清单导入格式的 CSV
    const csvText = buildImportCsv(cleanData);

    // 下载 CSV 留档（带 BOM 保证 Excel/WPS 打开中文不乱码）
    const blob = new Blob(["\uFEFF" + csvText], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `售出导入-${dateStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    // 通过 sessionStorage 传递给导入页，自动跳转并预填售出清单导入
    try {
      sessionStorage.setItem("cleaned_sales_csv", csvText);
    } catch { /* 存储失败时仍可手动上传刚下载的 CSV */ }
    router.push("/data-import");
  };

  // ---------- 状态栏文本 ----------

  const statusText = useMemo(() => {
    const n = cleanData.length;
    if (!n) {
      return sourceDisplay ? "未读取到数据, 可拖入表格文件或点击「选择文件」" : "就绪 · 将 xlsx / xls / csv 表格文件拖入页面, 或点击「选择文件」";
    }
    const text = `已识别【${sourceMode === "dy" ? "抖店" : sourceMode === "pdd" ? "拼多多" : "混合来源"}】· 已清洗 ${okFiles.length} 个文件, 共 ${n} 行 · 缺失: 尺码 ${missStats.size} / 售价 ${missStats.price} / 编号 ${missStats.code} / 面单号 ${missStats.track}`;
    if (filterOn) {
      return `【仅显示缺失数据 ${visibleIndices.length}/${n} 行, 点击「返回所有数据」恢复】${text}`;
    }
    return text;
  }, [cleanData.length, okFiles.length, missStats, filterOn, visibleIndices.length, sourceDisplay, sourceMode]);

  const hasData = cleanData.length > 0;

  return (
    <PageWrapper>
      {/* Header */}
      <div className="mb-4 lg:mb-6">
        <Link
          href="/links"
          className="inline-flex items-center gap-1.5 text-sm font-bold text-gray-600 hover:text-gray-900 mb-3"
        >
          <ArrowLeft className="h-4 w-4" />返回操作台
        </Link>
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-gray-900 mb-2">
          <span className="highlight-yellow">数据清洗</span>
        </h1>
        <p className="text-sm lg:text-lg text-gray-600 font-medium">
          售出数据清洗工具 · 从平台导出表格提取尺码/编号/面单号
        </p>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) setDragOver(false);
        }}
        onDrop={handleDrop}
        className="relative"
      >
        {/* 拖拽遮罩 */}
        {dragOver && (
          <div className="absolute inset-0 z-50 rounded-2xl border-[3px] border-dashed border-[#4A90E2] bg-[#4A90E2]/10 flex flex-col items-center justify-center gap-2 pointer-events-none">
            <Upload className="h-10 w-10 text-[#4A90E2]" />
            <p className="text-lg font-extrabold text-[#4A90E2]">松开鼠标即可清洗数据</p>
            <p className="text-xs font-medium text-[#4A90E2]/80">支持 xlsx / xls / csv 文件或整个文件夹</p>
          </div>
        )}

        {/* 工具栏 */}
        <div className="mb-3 p-3 rounded-xl border-[3px] border-gray-900 bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs lg:text-sm font-extrabold text-gray-700">数据来源:</span>
            <div className="h-9 flex-1 min-w-[140px] max-w-md flex items-center px-3 rounded-lg border-2 border-gray-300 bg-gray-50 text-xs font-medium text-gray-600 truncate">
              {sourceDisplay || "未选择文件"}
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="h-9 inline-flex items-center gap-1.5 px-3 rounded-lg border-[2px] border-gray-900 bg-white text-xs font-extrabold text-gray-700 hover:bg-gray-50 transition-all shadow-[2px_2px_0px_0px_rgba(0,0,0,0.3)]"
            >
              <Upload className="h-3.5 w-3.5" />选择文件
            </button>
            <button
              onClick={() => folderInputRef.current?.click()}
              className="h-9 inline-flex items-center gap-1.5 px-3 rounded-lg border-[2px] border-gray-900 bg-white text-xs font-extrabold text-gray-700 hover:bg-gray-50 transition-all shadow-[2px_2px_0px_0px_rgba(0,0,0,0.3)]"
            >
              <FolderOpen className="h-3.5 w-3.5" />选择文件夹
            </button>
            <button
              onClick={reClean}
              disabled={!hasData || loading}
              className="h-9 inline-flex items-center gap-1.5 px-3 rounded-lg border-[2px] border-gray-900 bg-white text-xs font-extrabold text-gray-700 hover:bg-gray-50 transition-all shadow-[2px_2px_0px_0px_rgba(0,0,0,0.3)] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />重新清洗
            </button>
            {/* 无尺码批量填入 */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs lg:text-sm font-extrabold text-gray-700 whitespace-nowrap">无尺码填:</span>
              <input
                value={manualSize}
                onChange={(e) => setManualSize(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") applyManualSize();
                }}
                disabled={!hasData || loading}
                placeholder="如 80"
                className="h-9 w-16 px-2 rounded-lg border-2 border-gray-300 bg-gray-50 text-xs font-bold text-gray-800 outline-none focus:border-[#4A90E2] focus:bg-white disabled:opacity-40"
              />
              <button
                onClick={applyManualSize}
                disabled={!hasData || loading || !manualSize.trim() || missStats.size === 0}
                title="将输入的尺码填入所有缺尺码的行(保留黄色标记)"
                className="h-9 inline-flex items-center gap-1.5 px-3 rounded-lg border-[2px] border-[#F59E0B] bg-[#FFC93C] text-xs font-extrabold text-gray-900 hover:bg-[#f5b800] transition-all shadow-[2px_2px_0px_0px_rgba(0,0,0,0.3)] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <PenLine className="h-3.5 w-3.5" />填入
              </button>
            </div>
            <button
              onClick={() => setFilterOn(!filterOn)}
              disabled={!hasData}
              className={`h-9 inline-flex items-center gap-1.5 px-3 rounded-lg border-[2px] font-extrabold transition-all shadow-[2px_2px_0px_0px_rgba(0,0,0,0.3)] disabled:opacity-40 disabled:cursor-not-allowed ${
                filterOn
                  ? "bg-[#d64545] text-white border-[#d64545]"
                  : "border-gray-900 bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              {filterOn ? <FilterX className="h-3.5 w-3.5" /> : <Filter className="h-3.5 w-3.5" />}
              {filterOn ? "返回所有数据" : "清洗错误"}
            </button>
            <button
              onClick={handleExport}
              disabled={!hasData || loading}
              title="转为售出清单导入格式，下载留档并自动跳转到导入页"
              className="h-9 inline-flex items-center gap-1.5 px-4 ml-auto rounded-lg border-[2px] border-[#4A90E2] bg-[#4A90E2] text-xs font-extrabold text-white hover:bg-[#3a7bc2] transition-all shadow-[2px_2px_0px_0px_rgba(0,0,0,0.3)] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download className="h-3.5 w-3.5" />导出并去导入
            </button>
          </div>

          {/* 状态栏 */}
          <div className="mt-2 pt-2 border-t-2 border-dashed border-gray-200 flex flex-wrap items-center gap-x-3 gap-y-1">
            {loading ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#4A90E2]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />正在读取并清洗数据...
              </span>
            ) : (
              <span className="text-xs font-medium text-gray-600">{statusText}</span>
            )}
            <span className="hidden lg:inline text-[10px] text-gray-400 font-medium">
              支持拖入 xlsx / xls / csv · 双击右侧单元格可补填
            </span>
          </div>
        </div>

        {/* 错误提示 */}
        {loadError && (
          <div className="mb-3 p-3 rounded-xl border-[3px] border-[#FF6B7A] bg-[#FF6B7A]/10 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-[#FF6B7A] shrink-0" />
            <p className="text-xs font-bold text-[#FF6B7A] flex-1">{loadError}</p>
            <button onClick={() => setLoadError("")} className="shrink-0">
              <X className="h-4 w-4 text-[#FF6B7A]" />
            </button>
          </div>
        )}
        {failedFiles.length > 0 && (
          <div className="mb-3 p-3 rounded-xl border-[3px] border-[#FFC93C] bg-[#FFC93C]/10">
            <p className="text-xs font-extrabold text-yellow-700 mb-1">以下 {failedFiles.length} 个文件读取失败:</p>
            {failedFiles.slice(0, 5).map((f, i) => (
              <p key={i} className="text-xs font-medium text-yellow-700 truncate">
                {f.name}: {f.err}
              </p>
            ))}
          </div>
        )}

        {/* 主体: 空状态 或 双表 */}
        {!hasData && !loading ? (
          <div
            className="rounded-2xl border-[3px] border-dashed border-gray-300 bg-white py-16 lg:py-24 flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-[#4A90E2] hover:bg-[#4A90E2]/5 transition-all"
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border-[3px] border-gray-900 bg-[#FFC93C] shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
              <FileSpreadsheet className="h-8 w-8 text-gray-900" />
            </div>
            <p className="text-lg font-extrabold text-gray-700">将 xlsx / xls / csv 表格文件拖入此处</p>
            <p className="text-sm font-medium text-gray-400">或点击此处选择文件, 支持拖入整个文件夹</p>
            <p className="text-xs font-medium text-gray-400 mt-2">双击清洗结果单元格可手动补填空值</p>
          </div>
        ) : (
          <div className="grid lg:grid-cols-2 gap-3 lg:gap-4">
            {/* ===== 左: 原始数据 ===== */}
            <div className="rounded-xl border-[3px] border-gray-900 bg-white overflow-hidden shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
              <div className="px-3 py-2 bg-gray-100 border-b-[3px] border-gray-900 flex items-center justify-between">
                <span className="text-xs lg:text-sm font-extrabold text-gray-900">原始数据 · {sourceMode === "dy" ? "抖店" : sourceMode === "pdd" ? "拼多多" : "混合来源"}</span>
                <span className="text-[10px] font-bold text-gray-500">{origData.length} 行</span>
              </div>
              <div ref={origScrollRef} onScroll={handleScroll("orig")} className="overflow-auto max-h-[62vh]">
                <table className="w-full text-xs border-collapse">
                  <thead className="sticky top-0 z-10">
                    <tr>
                      <th className="px-2 py-2 bg-[#cfd6e0] border-b-2 border-r-2 border-gray-400 text-gray-800 font-extrabold text-right w-12 min-w-[48px]">#</th>
                      {(sourceMode === "pdd" ? PDD_ORIG_HEADERS : sourceMode === "mixed" ? MIXED_ORIG_HEADERS : DY_ORIG_HEADERS).map((h, i) => (
                        <th
                          key={h}
                          className={`px-2 py-2 bg-[#e8eaee] border-b-2 border-gray-400 font-extrabold text-gray-800 whitespace-nowrap ${
                            i === 1 || i === 2 ? "text-right" : "text-left"
                          } ${i === 0 ? "min-w-[280px]" : i === 4 ? "min-w-[200px]" : i === 3 ? "min-w-[150px]" : "min-w-[70px]"}`}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleIndices.map((idx) => {
                      const o = origData[idx];
                      const selected = selectedIdx === idx;
                      return (
                        <tr
                          key={idx}
                          onClick={() => setSelectedIdx(idx)}
                          className={`cursor-pointer ${selected ? "bg-[#3375e6] text-white" : idx % 2 === 1 ? "bg-gray-50" : "bg-white"}`}
                        >
                          <td className={`px-2 py-1.5 text-right border-r border-gray-200 whitespace-nowrap ${selected ? "text-white/90" : "text-gray-500"} ${idx % 2 === 1 && !selected ? "bg-[#e0e5ed]" : ""}`}>
                            {idx + 1}
                          </td>
                          {[0, 1, 2, 3, 4].map((c) => (
                            <td
                              key={c}
                              className={`px-2 py-1.5 whitespace-nowrap ${c === 1 || c === 2 ? "text-right" : "text-left"} max-w-[380px] truncate`}
                            >
                              {cellAt(o.vals, c) || <span className={selected ? "text-white/40" : "text-gray-300"}>—</span>}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ===== 右: 清洗结果(可编辑) ===== */}
            <div className="rounded-xl border-[3px] border-gray-900 bg-white overflow-hidden shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
              <div className="px-3 py-2 bg-gray-100 border-b-[3px] border-gray-900 flex items-center justify-between">
                <span className="text-xs lg:text-sm font-extrabold text-gray-900">清洗结果</span>
                <span className="text-[10px] font-bold text-gray-500">双击单元格可编辑</span>
              </div>
              <div ref={cleanScrollRef} onScroll={handleScroll("clean")} className="overflow-auto max-h-[62vh]">
                <table className="w-full text-xs border-collapse">
                  <thead className="sticky top-0 z-10">
                    <tr>
                      {CLEAN_HEADERS.map((h, i) => (
                        <th
                          key={h}
                          className={`px-2 py-2 bg-[#e8eaee] border-b-2 border-gray-400 font-extrabold text-gray-800 whitespace-nowrap ${
                            i === 0 || i === 1 || i === 2 ? "text-right" : i === 3 ? "text-center" : "text-left"
                          } ${i === 0 ? "min-w-[60px] w-[70px]" : i === 1 ? "min-w-[70px] w-[80px]" : i === 2 ? "min-w-[60px] w-[70px]" : i === 3 ? "min-w-[80px] w-[95px]" : i === 4 ? "min-w-[150px]" : "min-w-[130px]"}`}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleIndices.map((idx) => {
                      const row = cleanData[idx];
                      const selected = selectedIdx === idx;
                      return (
                        <tr
                          key={idx}
                          onClick={() => setSelectedIdx(idx)}
                          className={`cursor-pointer ${rowBg(row, idx, selected, sizeFilled)}`}
                        >
                          {row.map((cell, col) => (
                            <td
                              key={col}
                              onDoubleClick={() => startEdit(idx, col)}
                              className={`px-2 py-1.5 whitespace-nowrap ${
                                col === 0 || col === 1 || col === 2 ? "text-right" : col === 3 ? "text-center" : "text-left"
                              }`}
                            >
                              {editing && editing.idx === idx && editing.col === col ? (
                                <input
                                  autoFocus
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  onBlur={saveEdit}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") saveEdit();
                                    if (e.key === "Escape") setEditing(null);
                                  }}
                                  className="w-full h-6 px-1 border-2 border-[#4A90E2] rounded text-xs outline-none text-gray-900 bg-white"
                                />
                              ) : (
                                cell || <span className={selected ? "text-white/40" : "text-gray-300"}>—</span>
                              )}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* 图例说明 */}
        {hasData && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] font-bold">
            <span className="px-2 py-1 rounded bg-[#f8d7da] text-gray-800 border border-gray-400">缺编号</span>
            <span className="px-2 py-1 rounded bg-[#fff3cd] text-gray-800 border border-gray-400">缺尺码</span>
            <span className="px-2 py-1 rounded bg-[#ffd9c0] text-gray-800 border border-gray-400">缺售价</span>
            <span className="px-2 py-1 rounded bg-[#d9e7fd] text-gray-800 border border-gray-400">缺面单号</span>
            <span className="px-2 py-1 rounded bg-[#3375e6] text-white border border-gray-900">选中行</span>
          </div>
        )}
      </div>

      {/* 隐藏文件选择器 */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".xlsx,.xls,.csv,.cvs"
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          if (files.length > 0) processFiles(files);
          e.target.value = "";
        }}
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          if (files.length > 0) processFiles(files);
          e.target.value = "";
        }}
      />
    </PageWrapper>
  );
}
