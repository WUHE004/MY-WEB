"use client";

import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Download,
  Trash2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageWrapper } from "@/components/page-wrapper";

const FIELD_LABELS: Record<string, string> = {
  sale_id: "售卖编号",
  manufacturer: "厂家名称",
  photo: "照片",
  name: "衣服名称",
  total_stock: "入库总数",
  sold_qty: "售出数量",
  remaining_stock: "剩余库存",
  shelf_no: "货架号",
  size_80: "80码",
  size_90: "90码",
  size_95: "95码",
  size_100: "100码",
  size_105: "105码",
  size_110: "110码",
  size_120: "120码",
  size_130: "130码",
  size_140: "140码",
  size_150: "150码",
  size_160: "160码",
  size_170: "170码",
  size_180: "180码",
  stock_warning: "库存预警",
  cost_price: "进价",
  sell_price: "售价",
  profit: "利润",
  return_qty: "退货数量",
  return_rate: "退货率",
  inventory_value: "库存价值",
  last_order_time: "最新下单时间",
  status: "状态",
};

const ALL_FIELDS = Object.keys(FIELD_LABELS);
const SIZE_FIELDS = ["size_80","size_90","size_95","size_100","size_105","size_110","size_120","size_130","size_140","size_150","size_160","size_170","size_180"];

function convertEncoding(arrayBuffer: ArrayBuffer): string {
  const uint8 = new Uint8Array(arrayBuffer);

  const hasUtf8BOM = uint8[0] === 0xEF && uint8[1] === 0xBB && uint8[2] === 0xBF;
  const sliceStart = hasUtf8BOM ? 3 : 0;

  const hasChineseUtf8 = (text: string) => /[\u4e00-\u9fa5]/.test(text);

  const tryDecode = (encoding: string) => {
    try {
      const decoder = new TextDecoder(encoding);
      const decoded = decoder.decode(uint8.slice(sliceStart));
      if (hasChineseUtf8(decoded)) return decoded;
    } catch {}
    return null;
  };

  const utf8Text = new TextDecoder("utf-8").decode(uint8.slice(sliceStart));
  if (hasChineseUtf8(utf8Text)) return utf8Text;

  const gbkText = tryDecode("gbk");
  if (gbkText) return gbkText;

  const gb2312Text = tryDecode("gb2312");
  if (gb2312Text) return gb2312Text;

  const gb18030Text = tryDecode("gb18030");
  if (gb18030Text) return gb18030Text;

  return utf8Text;
}

function parseCSV(text: string) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length === 0) return { headers: [] as string[], rows: [] as string[][] };

  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else { current += ch; }
    }
    result.push(current.trim());
    return result;
  };

  return { headers: parseLine(lines[0]), rows: lines.slice(1).map(parseLine) };
}

export default function DataImportPage() {
  const [csvContent, setCsvContent] = useState("");
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvPreview, setCsvPreview] = useState<string[][]>([]);
  const [columnMap, setColumnMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; total: number; actualCount: number; errors?: string[] } | null>(null);
  const [error, setError] = useState("");
  const [showAllFields, setShowAllFields] = useState(false);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setResult(null);
    setError("");
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const arrayBuffer = ev.target?.result as ArrayBuffer;
      const text = convertEncoding(arrayBuffer);
      setCsvContent(text);
      const { headers, rows } = parseCSV(text);
      setCsvHeaders(headers);
      setCsvPreview(rows.slice(0, 5));

      const autoMap: Record<string, string> = {};
      for (const field of ALL_FIELDS) {
        const label = FIELD_LABELS[field];
        if (headers.includes(label)) autoMap[field] = label;
        else if (headers.includes(field)) autoMap[field] = field;
        else {
          const match = headers.find((h) => h.toLowerCase().includes(field.replace("_", "").toLowerCase()));
          if (match) autoMap[field] = match;
        }
      }
      setColumnMap(autoMap);
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const handleImport = async () => {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csvContent, columnMap }),
      });
      const data = await res.json();
      if (data.error) setError(data.error);
      else setResult(data);
    } catch {
      setError("导入请求失败，请检查网络");
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setCsvContent("");
    setCsvHeaders([]);
    setCsvPreview([]);
    setColumnMap({});
    setResult(null);
    setError("");
  };

  const handleDownloadTemplate = () => {
    const headers = ALL_FIELDS.map((f) => FIELD_LABELS[f]).join(",");
    const sample = ALL_FIELDS.map((f) => {
      if (f === "status") return "active";
      if (f.startsWith("size_") || f === "total_stock" || f === "sold_qty" || f === "remaining_stock" || f === "stock_warning" || f === "return_qty") return "0";
      if (f === "cost_price" || f === "sell_price" || f === "profit" || f === "return_rate" || f === "inventory_value") return "0";
      return "";
    }).join(",");
    const content = headers + "\n" + sample;
    const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "商品模板.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const visibleFields = showAllFields ? ALL_FIELDS : ALL_FIELDS.filter((f) => {
    const mapped = columnMap[f];
    if (mapped && csvHeaders.includes(mapped)) return true;
    return !SIZE_FIELDS.includes(f) || (columnMap["name"] && csvHeaders.includes(columnMap["name"]));
  });

  const matchedCount = ALL_FIELDS.filter((f) => columnMap[f] && csvHeaders.includes(columnMap[f])).length;

  return (
    <PageWrapper>
      <div className="mb-6 lg:mb-8">
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-gray-900 mb-2">
          <span className="highlight-green">数据导入</span>
        </h1>
        <p className="text-sm lg:text-lg text-gray-600 font-medium">
          从 WPS 多维表格导出 CSV，一键导入到网站数据库
        </p>
      </div>

      <Card className="mb-6 lg:mb-8">
        <CardContent className="p-4 lg:p-6">
          <div className="grid grid-cols-2 sm:flex sm:flex-row items-start sm:items-center gap-3 sm:gap-4 lg:gap-6 text-xs lg:text-sm font-bold text-gray-600">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 lg:h-8 lg:w-8 items-center justify-center rounded-full bg-[#4A90E2] text-white font-extrabold text-xs lg:text-sm shrink-0">1</span>
              <span>WPS导出CSV</span>
            </div>
            <ArrowRight className="h-4 w-4 lg:h-5 lg:w-5 hidden sm:block text-gray-400" />
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 lg:h-8 lg:w-8 items-center justify-center rounded-full bg-[#4A90E2] text-white font-extrabold text-xs lg:text-sm shrink-0">2</span>
              <span>上传CSV</span>
            </div>
            <ArrowRight className="h-4 w-4 lg:h-5 lg:w-5 hidden sm:block text-gray-400" />
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 lg:h-8 lg:w-8 items-center justify-center rounded-full bg-[#4A90E2] text-white font-extrabold text-xs lg:text-sm shrink-0">3</span>
              <span>自动映射</span>
            </div>
            <ArrowRight className="h-4 w-4 lg:h-5 lg:w-5 hidden sm:block text-gray-400" />
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 lg:h-8 lg:w-8 items-center justify-center rounded-full bg-[#4CD964] text-white font-extrabold text-xs lg:text-sm shrink-0">4</span>
              <span>数据展示</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base lg:text-xl">
              <Upload className="h-4 w-4 lg:h-5 lg:w-5" />
              上传 CSV 文件
            </CardTitle>
          </CardHeader>
          <CardContent>
            <label className="block cursor-pointer mb-4">
              <div className="flex flex-col items-center justify-center gap-2 lg:gap-3 rounded-lg lg:rounded-xl border-[3px] border-dashed border-gray-400 p-6 lg:p-8 hover:border-gray-900 transition-colors">
                <FileSpreadsheet className="h-8 w-8 lg:h-10 lg:w-10 text-gray-400" />
                <span className="font-bold text-gray-600 text-xs lg:text-sm">点击上传 CSV 文件</span>
                <span className="text-[10px] lg:text-xs text-gray-400">支持从 WPS / Excel 导出的 CSV 格式</span>
              </div>
              <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
            </label>

            <div className="flex gap-2 mb-4">
              <Button variant="ghost" onClick={handleDownloadTemplate} className="flex-1 border-2 border-gray-300 text-xs lg:text-sm py-1.5 lg:py-2">
                <Download className="h-3.5 w-3.5 lg:h-4 lg:w-4 mr-1.5" />
                下载模板
              </Button>
              {csvContent && (
                <Button variant="ghost" onClick={handleClear} className="border-2 border-gray-300 text-xs lg:text-sm py-1.5 lg:py-2 px-3">
                  <Trash2 className="h-3.5 w-3.5 lg:h-4 lg:w-4" />
                </Button>
              )}
            </div>

            {csvHeaders.length > 0 && (
              <div className="p-3 rounded-lg bg-green-50 border-2 border-green-200">
                <p className="text-xs lg:text-sm font-bold text-green-700">
                  ✅ 检测到 {csvHeaders.length} 列，{csvPreview.length} 行预览数据
                </p>
                <p className="text-[10px] lg:text-xs text-green-600 mt-1">
                  已自动匹配 {matchedCount}/{ALL_FIELDS.length} 个字段
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base lg:text-xl">
              <CheckCircle2 className="h-4 w-4 lg:h-5 lg:w-5" />
              字段映射
            </CardTitle>
          </CardHeader>
          <CardContent className="max-h-[500px] overflow-y-auto overflow-x-hidden">
            {csvHeaders.length === 0 ? (
              <p className="text-xs lg:text-sm text-gray-400 font-bold py-8 text-center">请先上传 CSV 文件</p>
            ) : (
              <div className="space-y-1.5 lg:space-y-2">
                {visibleFields.map((field) => (
                  <div key={field} className="flex items-center gap-1.5 lg:gap-2 py-1">
                    <span className="w-16 sm:w-20 lg:w-28 text-[10px] lg:text-xs font-bold text-gray-500 shrink-0 truncate" title={FIELD_LABELS[field]}>
                      {FIELD_LABELS[field]}
                    </span>
                    <ArrowRight className="h-2.5 w-2.5 lg:h-3 lg:w-3 text-gray-300 shrink-0" />
                    <select
                      value={columnMap[field] || ""}
                      onChange={(e) => setColumnMap({ ...columnMap, [field]: e.target.value })}
                      className="flex-1 min-w-[80px] rounded-lg border-[2px] border-gray-200 px-2 py-1.5 text-[10px] lg:text-xs font-bold focus:border-gray-900 focus:outline-none bg-white"
                    >
                      <option value="">不映射</option>
                      {csvHeaders.map((h, idx) => (
                        <option key={`${h}-${idx}`} value={h}>{h || `(空白列 ${idx + 1})`}</option>
                      ))}
                    </select>
                    {columnMap[field] && csvHeaders.includes(columnMap[field]) ? (
                      <CheckCircle2 className="h-3 w-3 lg:h-4 lg:w-4 text-green-500 shrink-0" />
                    ) : (
                      <div className="h-3 w-3 lg:h-4 lg:w-4 shrink-0" />
                    )}
                  </div>
                ))}

                {!showAllFields && SIZE_FIELDS.length > 0 && (
                  <button
                    onClick={() => setShowAllFields(true)}
                    className="w-full text-xs text-blue-600 font-bold hover:underline mt-2 py-1 border-t border-gray-200 pt-2"
                  >
                    展开所有尺码字段 ({SIZE_FIELDS.length} 个)
                  </button>
                )}
                {showAllFields && (
                  <button
                    onClick={() => setShowAllFields(false)}
                    className="w-full text-xs text-gray-500 font-bold hover:underline mt-1 py-1"
                  >
                    收起尺码字段
                  </button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {csvPreview.length > 0 && (
        <Card className="mt-4 lg:mt-6">
          <CardHeader>
            <CardTitle className="text-base lg:text-xl">数据预览（前 5 行）</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-[10px] lg:text-xs">
                <thead>
                  <tr>
                    {csvHeaders.map((h) => (
                      <th key={h} className="border-2 border-gray-200 px-2 py-1.5 text-left font-extrabold bg-gray-100 whitespace-nowrap max-w-[120px] truncate">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {csvPreview.map((row, i) => (
                    <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                      {row.map((cell, j) => (
                        <td key={j} className="border-2 border-gray-100 px-2 py-1 whitespace-nowrap max-w-[120px] truncate">{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {csvContent && (
        <div className="mt-4 lg:mt-6 flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <Button
            variant="primary"
            onClick={handleImport}
            disabled={loading}
            className="px-6 lg:px-8 py-3 text-base lg:text-lg"
          >
            {loading ? "导入中..." : `开始导入 (${csvPreview.length} 条)`}
          </Button>
          {result && (
            <div className="flex flex-col gap-2">
              <Badge variant={result.success ? "green" : "pink"} className="text-xs lg:text-sm">
                {result.success
                  ? `✅ 成功导入，数据库共 ${result.actualCount} 条记录`
                  : `❌ 导入失败`}
                {result.total > 0 && `（处理 ${result.total} 行）`}
              </Badge>
              {result.errors && result.errors.length > 0 && (
                <div className="p-2 bg-yellow-50 border-2 border-yellow-200 rounded-lg">
                  <p className="text-xs font-bold text-yellow-800 mb-1">⚠️ 部分错误：</p>
                  <ul className="text-[10px] text-yellow-700 list-disc list-inside">
                    {result.errors.slice(0, 5).map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                    {result.errors.length > 5 && <li>... 还有 {result.errors.length - 5} 个错误</li>}
                  </ul>
                </div>
              )}
            </div>
          )}
          {error && (
            <Badge variant="pink" className="text-xs lg:text-sm">
              <AlertCircle className="h-3 w-3 mr-1" />
              {error}
            </Badge>
          )}
        </div>
      )}
    </PageWrapper>
  );
}
