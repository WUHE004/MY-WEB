"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Database,
  ArrowRight,
  Download,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageWrapper } from "@/components/page-wrapper";

const TABLE_OPTIONS = [
  { value: "products", label: "商品管理", icon: "📦", columns: ["name:商品名", "sku:SKU", "category:分类", "price:价格", "stock:库存", "status:状态", "platform:平台"] },
  { value: "accounts", label: "账号运营", icon: "👤", columns: ["name:账号名", "platform:平台", "handle:账号ID", "followers:粉丝数", "posts:内容数", "engagement:互动率", "status:状态", "growth:增长率"] },
  { value: "links", label: "推广链接", icon: "🔗", columns: ["name:链接名", "url:链接地址", "short_url:短链接", "platform:平台", "clicks:点击数", "conversions:转化数", "status:状态"] },
  { value: "monthly_revenue", label: "月度营收", icon: "💰", columns: ["month:月份", "revenue:营收", "cost:成本"] },
  { value: "transactions", label: "交易记录", icon: "📋", columns: ["type:类型", "amount:金额", "description:描述", "date:日期", "platform:平台"] },
];

export default function DataImportPage() {
  const [selectedTable, setSelectedTable] = useState("products");
  const [csvContent, setCsvContent] = useState("");
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvPreview, setCsvPreview] = useState<string[][]>([]);
  const [columnMap, setColumnMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ importedCount: number; skipCount: number; total: number } | null>(null);
  const [error, setError] = useState("");

  const tableDef = TABLE_OPTIONS.find((t) => t.value === selectedTable)!;

  const parseCSV = (text: string) => {
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

    return {
      headers: parseLine(lines[0]),
      rows: lines.slice(1).map(parseLine),
    };
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setResult(null);
    setError("");
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setCsvContent(text);
      const { headers, rows } = parseCSV(text);
      setCsvHeaders(headers);
      setCsvPreview(rows.slice(0, 5));

      const autoMap: Record<string, string> = {};
      for (const col of tableDef.columns) {
        const [dbName, label] = col.split(":");
        if (headers.includes(label)) autoMap[dbName] = label;
        else if (headers.includes(dbName)) autoMap[dbName] = dbName;
        else {
          const match = headers.find((h) => h.toLowerCase().includes(dbName.toLowerCase()));
          if (match) autoMap[dbName] = match;
        }
      }
      setColumnMap(autoMap);
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table: selectedTable, csvContent, columnMap }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setResult(data);
      }
    } catch {
      setError("导入请求失败，请检查网络");
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadTemplate = () => {
    const headers = tableDef.columns.map((c) => c.split(":")[1]).join(",");
    const sample = tableDef.columns.map((c) => {
      const name = c.split(":")[0];
      if (name === "price" || name === "cost" || name === "revenue") return "0";
      if (name === "stock" || name === "followers" || name === "posts" || name === "clicks" || name === "conversions" || name === "amount") return "0";
      if (name === "engagement" || name === "growth") return "0";
      return "示例";
    }).join(",");
    const content = headers + "\n" + sample;
    const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedTable}_模板.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <PageWrapper>
      <div className="mb-6 lg:mb-8">
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-gray-900 mb-2">
          <span className="highlight-green">数据导入</span>
        </h1>
        <p className="text-sm lg:text-lg text-gray-600 font-medium">
          从 WPS 多维表格导出 CSV，导入到本地数据库
        </p>
      </div>

      {/* 操作步骤 */}
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
              <span>映射导入</span>
            </div>
            <ArrowRight className="h-4 w-4 lg:h-5 lg:w-5 hidden sm:block text-gray-400" />
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 lg:h-8 lg:w-8 items-center justify-center rounded-full bg-[#4CD964] text-white font-extrabold text-xs lg:text-sm shrink-0">4</span>
              <span>数据展示</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 选择目标表 */}
      <div className="mb-4 lg:mb-6">
        <h2 className="text-base lg:text-lg font-extrabold mb-3 lg:mb-4">选择导入目标</h2>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 lg:gap-3">
          {TABLE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { setSelectedTable(opt.value); setCsvContent(""); setCsvHeaders([]); setCsvPreview([]); setResult(null); setError(""); }}
              className={`flex flex-col items-center gap-1.5 lg:gap-2 p-2.5 lg:p-4 rounded-lg lg:rounded-xl border-[3px] font-bold text-[10px] lg:text-sm transition-all ${
                selectedTable === opt.value
                  ? "border-gray-900 bg-[#4A90E2] text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
                  : "border-gray-200 bg-white text-gray-700 hover:border-gray-400"
              }`}
            >
              <span className="text-lg lg:text-2xl">{opt.icon}</span>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
        {/* 上传区 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base lg:text-xl">
              <Upload className="h-4 w-4 lg:h-5 lg:w-5" />
              上传 CSV 文件
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex items-center gap-3">
              <label className="flex-1 cursor-pointer">
                <div className="flex flex-col items-center justify-center gap-2 lg:gap-3 rounded-lg lg:rounded-xl border-[3px] border-dashed border-gray-400 p-6 lg:p-8 hover:border-gray-900 transition-colors">
                  <FileSpreadsheet className="h-8 w-8 lg:h-10 lg:w-10 text-gray-400" />
                  <span className="font-bold text-gray-600 text-xs lg:text-sm">点击上传 CSV 文件</span>
                  <span className="text-[10px] lg:text-xs text-gray-400">支持从 WPS / Excel 导出的 CSV 格式</span>
                </div>
                <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
              </label>
            </div>
            <Button variant="ghost" onClick={handleDownloadTemplate} className="w-full border-2 border-gray-300 text-xs lg:text-sm py-1.5 lg:py-2">
              <Download className="h-3.5 w-3.5 lg:h-4 lg:w-4 mr-2" />
              下载 CSV 模板
            </Button>

            {csvHeaders.length > 0 && (
              <div className="mt-4 p-3 rounded-lg bg-green-50 border-2 border-green-200">
                <p className="text-xs lg:text-sm font-bold text-green-700">
                  检测到 {csvHeaders.length} 列，{csvPreview.length} 行预览数据
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 列映射 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base lg:text-xl">
              <Database className="h-4 w-4 lg:h-5 lg:w-5" />
              字段映射
            </CardTitle>
          </CardHeader>
          <CardContent>
            {csvHeaders.length === 0 ? (
              <p className="text-xs lg:text-sm text-gray-400 font-bold">请先上传 CSV 文件</p>
            ) : (
              <div className="space-y-2 lg:space-y-3">
                {tableDef.columns.map((col) => {
                  const [dbName, label] = col.split(":");
                  return (
                    <div key={dbName} className="flex items-center gap-2 lg:gap-3">
                      <span className="w-16 lg:w-24 text-[10px] lg:text-sm font-bold text-gray-700 shrink-0">{label}</span>
                      <ArrowRight className="h-3 w-3 lg:h-4 lg:w-4 text-gray-400 shrink-0" />
                      <select
                        value={columnMap[dbName] || ""}
                        onChange={(e) => setColumnMap({ ...columnMap, [dbName]: e.target.value })}
                        className="flex-1 rounded-lg border-[3px] border-gray-300 px-2.5 lg:px-3 py-1.5 lg:py-2 text-xs lg:text-sm font-bold focus:border-gray-900 focus:outline-none"
                      >
                        <option value="">不映射</option>
                        {csvHeaders.map((h) => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                      {columnMap[dbName] && (
                        <CheckCircle2 className="h-3 w-3 lg:h-4 lg:w-4 text-green-500 shrink-0" />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 预览表格 */}
      {csvPreview.length > 0 && (
        <Card className="mt-4 lg:mt-6">
          <CardHeader>
            <CardTitle className="text-base lg:text-xl">数据预览（前 5 行）</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-[10px] lg:text-sm">
                <thead>
                  <tr>
                    {csvHeaders.map((h) => (
                      <th key={h} className="border-2 border-gray-200 px-2 lg:px-3 py-1.5 lg:py-2 text-left font-extrabold bg-gray-100 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {csvPreview.map((row, i) => (
                    <tr key={i}>
                      {row.map((cell, j) => (
                        <td key={j} className="border-2 border-gray-200 px-2 lg:px-3 py-1 whitespace-nowrap">{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 导入按钮 */}
      {csvContent && (
        <div className="mt-4 lg:mt-6 flex flex-col sm:flex-row items-start sm:items-center gap-3 lg:gap-4">
          <Button
            variant="primary"
            onClick={handleImport}
            disabled={loading}
            className="px-6 lg:px-8 py-3 lg:py-4 text-base lg:text-lg"
          >
            {loading ? "导入中..." : "开始导入"}
          </Button>
          {result && (
            <Badge variant="green" className="text-xs lg:text-sm">
              导入 {result.importedCount} 条，跳过 {result.skipCount} 条
            </Badge>
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