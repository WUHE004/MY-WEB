"use client";

import { useState, useCallback, useEffect } from "react";
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
  // 入库清单字段（照片字段填入文件名，由文件夹匹配上传）
  inbound_sale_id: "售卖编号",
  inbound_manufacturer: "厂家名称",
  inbound_photo: "照片",
  inbound_name: "衣服名称",
  inbound_size_80: "80码",
  inbound_size_90: "90码",
  inbound_size_95: "95码",
  inbound_size_100: "100码",
  inbound_size_105: "105码",
  inbound_size_110: "110码",
  inbound_size_120: "120码",
  inbound_size_130: "130码",
  inbound_size_140: "140码",
  inbound_size_150: "150码",
  inbound_size_160: "160码",
  inbound_size_170: "170码",
  inbound_size_180: "180码",
  inbound_cost_price: "进价",
  inbound_shelf_no: "货架号",
  inbound_season: "季节",
  inbound_style_category: "款式分类",
  inbound_notes: "备注",
  inbound_inbound_date: "入库日期",
  // 售出清单字段（照片/名称/进价从入库表查找，登记人自动识别）
  sales_sale_id: "售卖编号",
  sales_size: "尺码",
  sales_quantity: "数量",
  sales_sell_price: "售价",
  sales_manufacturer: "厂家",
  sales_notes: "备注",
  sales_order_time: "下单时间",
  sales_tracking_number: "面单号",
  // 退货清单字段（登记人自动识别）
  returns_sale_id: "售卖编号",
  returns_size: "尺码",
  returns_quantity: "数量",
  returns_return_price: "退货价",
  returns_remarks: "备注",
};

const INBOUND_FIELDS = ["inbound_sale_id","inbound_manufacturer","inbound_photo","inbound_name","inbound_size_80","inbound_size_90","inbound_size_95","inbound_size_100","inbound_size_105","inbound_size_110","inbound_size_120","inbound_size_130","inbound_size_140","inbound_size_150","inbound_size_160","inbound_size_170","inbound_size_180","inbound_cost_price","inbound_shelf_no","inbound_season","inbound_style_category","inbound_notes","inbound_inbound_date"];
const INBOUND_SIZE_FIELDS = ["inbound_size_80","inbound_size_90","inbound_size_95","inbound_size_100","inbound_size_105","inbound_size_110","inbound_size_120","inbound_size_130","inbound_size_140","inbound_size_150","inbound_size_160","inbound_size_170","inbound_size_180"];

const SALES_FIELDS = ["sales_sale_id","sales_size","sales_quantity","sales_sell_price","sales_manufacturer","sales_notes","sales_order_time","sales_tracking_number"];

const RETURNS_FIELDS = ["returns_sale_id","returns_size","returns_quantity","returns_return_price","returns_remarks"];

const ALL_FIELDS_BY_TYPE: Record<string, string[]> = {
  inbound: INBOUND_FIELDS,
  sales: SALES_FIELDS,
  returns: RETURNS_FIELDS,
};

const SIZE_FIELDS_BY_TYPE: Record<string, string[]> = {
  inbound: INBOUND_SIZE_FIELDS,
  sales: [],
  returns: [],
};

function convertEncoding(arrayBuffer: ArrayBuffer): string {
  const uint8 = new Uint8Array(arrayBuffer);

  // UTF-8 BOM 检测
  const hasUtf8BOM = uint8[0] === 0xEF && uint8[1] === 0xBB && uint8[2] === 0xBF;
  const sliceStart = hasUtf8BOM ? 3 : 0;

  // 如果有 BOM，直接使用 UTF-8
  if (hasUtf8BOM) {
    return new TextDecoder("utf-8").decode(uint8.slice(sliceStart));
  }

  // 统计中文字符数量
  const countChinese = (text: string) => {
    let count = 0;
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      // 中文字符范围：CJK统一汉字 + 扩展A + 兼容汉字
      if ((code >= 0x4E00 && code <= 0x9FFF) ||
          (code >= 0x3400 && code <= 0x4DBF) ||
          (code >= 0xF900 && code <= 0xFAFF)) {
        count++;
      }
    }
    return count;
  };

  // 检测常见乱码特征（GBK 被 UTF-8 解码后的典型乱码模式）
  const hasGarbled = (text: string) => {
    // 典型 GBK 被 UTF-8 解码后的乱码模式：连续的重音字符或特定乱码组合
    const garbledPatterns = /[锟斤拷]{2,}|[À-ÿ]{3,}|銆/;
    return garbledPatterns.test(text);
  };

  // 尝试 UTF-8 解码
  const utf8Text = new TextDecoder("utf-8").decode(uint8.slice(sliceStart));

  // 尝试 GBK 解码
  let gbkText = "";
  try {
    gbkText = new TextDecoder("gbk").decode(uint8.slice(sliceStart));
  } catch {
    // GBK 解码失败，返回 UTF-8
    return utf8Text;
  }

  const utf8ChineseCount = countChinese(utf8Text);
  const gbkChineseCount = countChinese(gbkText);

  // 如果 UTF-8 结果有明显乱码特征，优先用 GBK
  if (hasGarbled(utf8Text) && gbkChineseCount > 0) {
    return gbkText;
  }

  // 如果 GBK 的中文字符明显更多，使用 GBK
  if (gbkChineseCount > utf8ChineseCount) {
    return gbkText;
  }

  // 默认使用 UTF-8
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
  const [importType, setImportType] = useState<"inbound" | "sales" | "returns">("inbound");
  const [csvContent, setCsvContent] = useState("");
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvPreview, setCsvPreview] = useState<string[][]>([]);
  const [allRows, setAllRows] = useState<string[][]>([]);
  const [columnMap, setColumnMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; total: number; actualCount: number; errors?: string[] } | null>(null);
  const [error, setError] = useState("");
  const [showAllFields, setShowAllFields] = useState(false);
  const [photoFolderName, setPhotoFolderName] = useState("");
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [photoFilter, setPhotoFilter] = useState<Record<string, string>>({});

  // 补充照片导入（独立功能，不依赖CSV导入）
  const [supplementFiles, setSupplementFiles] = useState<File[]>([]);
  const [supplementFolderName, setSupplementFolderName] = useState("");
  const [supplementUploading, setSupplementUploading] = useState(false);
  const [supplementProgress, setSupplementProgress] = useState<{
    processed: number; total: number; current: string;
    matched: number; uploaded: number; updated: number;
    errors: string[];
  } | null>(null);
  const [supplementDone, setSupplementDone] = useState(false);

  // 持久化补录进度到 localStorage，切换标签页不丢失
  useEffect(() => {
    if (supplementProgress) {
      try {
        localStorage.setItem("supplement_progress", JSON.stringify({
          progress: supplementProgress,
          uploading: supplementUploading,
          done: supplementDone,
          folderName: supplementFolderName,
          fileCount: supplementFiles.length,
        }));
      } catch { /* ignore */ }
    }
  }, [supplementProgress, supplementUploading, supplementDone, supplementFolderName, supplementFiles.length]);

  // 恢复上次的补录进度
  useEffect(() => {
    try {
      const saved = localStorage.getItem("supplement_progress");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.progress && !parsed.done) {
          setSupplementProgress(parsed.progress);
          setSupplementDone(parsed.done || false);
          if (parsed.folderName) setSupplementFolderName(parsed.folderName);
        }
      }
    } catch { /* ignore */ }
  }, []);

  const clearSupplementProgress = () => {
    setSupplementProgress(null);
    setSupplementDone(false);
    try { localStorage.removeItem("supplement_progress"); } catch { /* ignore */ }
  };

  const ALL_FIELDS = ALL_FIELDS_BY_TYPE[importType];
  const SIZE_FIELDS = SIZE_FIELDS_BY_TYPE[importType];

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
      setAllRows(rows);

      const fields = ALL_FIELDS_BY_TYPE[importType];
      const autoMap: Record<string, string> = {};
      for (const field of fields) {
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
  }, [importType]);

  const handleImport = async () => {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const registrant = typeof window !== "undefined" ? localStorage.getItem("member_name") || "" : "";
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csvContent, columnMap, importType, registrant, photoFilter }),
      });
      const data = await res.json();
      if (data.error) setError(data.error);
      else {
        setResult(data);
        // 售出/退货导入成功后，自动触发汇总同步
        if (data.success && (data.importType === "sales" || data.importType === "returns")) {
          fetch("/api/sync-summary", { method: "POST" }).catch(() => {});
        }
      }
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
    setAllRows([]);
    setColumnMap({});
    setResult(null);
    setError("");
    setPhotoFolderName("");
    setPhotoFiles([]);
  };

  const handlePhotoFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      setPhotoFilter({});
      setPhotoFolderName(files[0].webkitRelativePath?.split("/")[0] || "照片文件夹");
      setPhotoFiles(files);
    }
  };

  // 计算CSV中匹配的照片文件（按照片字段的文件名匹配）
  const getMatchingPhotos = () => {
    if (allRows.length === 0 || photoFiles.length === 0) return [];
    // 找到照片字段在CSV中的列索引
    const photoMapKey = importType + "_photo";
    const photoCsvCol = columnMap[photoMapKey];
    const photoIdx = photoCsvCol ? csvHeaders.indexOf(photoCsvCol) : -1;
    if (photoIdx < 0) return [];
    // 从CSV中提取所有照片文件名
    const photoNameSet = new Set<string>();
    for (const row of allRows) {
      const photoName = (row[photoIdx] || "").trim();
      if (photoName) {
        // 提取文件名（去掉路径和扩展名，用于匹配）
        const baseName = photoName.replace(/^.*[\\/]/, "").replace(/\.[^.]+$/, "").trim().toUpperCase();
        if (baseName) photoNameSet.add(baseName);
      }
    }
    // 筛选匹配的照片文件（按文件名去扩展名匹配）
    return photoFiles.filter((f) => {
      const name = f.name.replace(/\.[^.]+$/, "").trim().toUpperCase();
      return photoNameSet.has(name);
    });
  };

  const matchingPhotos = getMatchingPhotos();

  const handleUploadPhotos = async () => {
    if (matchingPhotos.length === 0) return;
    setUploadingPhotos(true);
    try {
      const formData = new FormData();
      matchingPhotos.forEach((f) => formData.append("photos", f));
      const res = await fetch("/api/import/photos", { method: "POST", body: formData });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setPhotoFilter(data.photoMap || {});
        setResult({ success: true, total: 0, actualCount: data.count || 0 });
        // 显示上传错误详情
        if (data.errors && data.errors.length > 0) {
          setError(`部分照片上传失败:\n${data.errors.join("\n")}`);
        }
      }
    } catch {
      setError("照片上传失败");
    } finally {
      setUploadingPhotos(false);
    }
  };

  // 补充照片导入：选择文件夹
  const handleSupplementFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      setSupplementFiles(files);
      setSupplementFolderName(files[0].webkitRelativePath?.split("/")[0] || "照片文件夹");
      clearSupplementProgress();
    }
  };

  // 客户端压缩图片（Canvas），避免超过Vercel请求体限制
  const compressImageClient = (file: File): Promise<File> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const MAX_WIDTH = 800;
        let { width, height } = img;
        if (width > MAX_WIDTH) {
          height = Math.round((height * MAX_WIDTH) / width);
          width = MAX_WIDTH;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject(new Error("Canvas not supported")); return; }
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          if (!blob) { reject(new Error("toBlob failed")); return; }
          const compressed = new File([blob], file.name.replace(/\.[^.]+$/, ".webp"), { type: "image/webp" });
          resolve(compressed);
        }, "image/webp", 0.75);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("图片加载失败")); };
      img.src = url;
    });
  };

  // 补充照片导入：先客户端压缩，再分批发送（自动跳过已存在的照片）
  const handleSupplementUpload = async () => {
    if (supplementFiles.length === 0) return;
    setSupplementUploading(true);
    setSupplementDone(false);
    setSupplementProgress({ processed: 0, total: supplementFiles.length, current: "检查已上传照片...", matched: 0, uploaded: 0, updated: 0, errors: [] });

    const BATCH_SIZE = 1;
    let totalMatched = 0;
    let totalUploaded = 0;
    let totalUpdated = 0;
    const allErrors: string[] = [];

    try {
      // 1. 获取 Supabase 中已存在的照片文件名
      let existingNames = new Set<string>();
      try {
        const checkRes = await fetch("/api/import/supplement-photos");
        const checkData = await checkRes.json();
        if (checkData.existingNames) {
          existingNames = new Set(checkData.existingNames.map((n: string) => n.toUpperCase()));
        }
      } catch { /* 忽略检查失败 */ }

      // 2. 过滤掉已存在的照片
      const filesToUpload = supplementFiles.filter((f) => {
        const baseName = f.name.replace(/\.[^.]+$/, "").trim().toUpperCase();
        return !existingNames.has(baseName);
      });
      const skipped = supplementFiles.length - filesToUpload.length;

      if (filesToUpload.length === 0) {
        setSupplementProgress({
          processed: supplementFiles.length, total: supplementFiles.length,
          current: "", matched: 0, uploaded: 0, updated: 0,
          errors: skipped > 0 ? [`已跳过 ${skipped} 张已存在的照片，无需上传`] : [],
        });
        setSupplementDone(true);
        setSupplementUploading(false);
        return;
      }

      setSupplementProgress({
        processed: 0, total: filesToUpload.length,
        current: skipped > 0 ? `已跳过 ${skipped} 张，待上传 ${filesToUpload.length} 张...` : `开始上传 ${filesToUpload.length} 张...`,
        matched: 0, uploaded: 0, updated: 0,
        errors: skipped > 0 ? [`已跳过 ${skipped} 张已存在的照片`] : [],
      });

      for (let i = 0; i < filesToUpload.length; i += BATCH_SIZE) {
        const batch = filesToUpload.slice(i, i + BATCH_SIZE);

        // 客户端压缩
        setSupplementProgress((prev) => prev ? {
          ...prev,
          current: `压缩第 ${i + 1} 张: ${batch[0].name}...`,
        } : null);

        let compressedFiles: File[];
        try {
          compressedFiles = await Promise.all(batch.map((f) => compressImageClient(f)));
        } catch (compressErr) {
          allErrors.push(`${batch[0].name}: 压缩失败 - ${compressErr instanceof Error ? compressErr.message : String(compressErr)}`);
          setSupplementProgress({
            processed: Math.min(i + BATCH_SIZE, filesToUpload.length),
            total: filesToUpload.length,
            current: "",
            matched: totalMatched,
            uploaded: totalUploaded,
            updated: totalUpdated,
            errors: [...allErrors],
          });
          continue;
        }

        setSupplementProgress((prev) => prev ? {
          ...prev,
          current: `上传第 ${i + 1} 张: ${batch[0].name}...`,
        } : null);

        const formData = new FormData();
        compressedFiles.forEach((f) => formData.append("photos", f));

        const res = await fetch("/api/import/supplement-photos", {
          method: "POST",
          body: formData,
        });

        const data = await res.json();

        if (data.error) {
          allErrors.push(`批次 ${Math.floor(i / BATCH_SIZE) + 1}: ${data.error}`);
        } else {
          totalMatched += data.matched || 0;
          totalUploaded += data.uploaded || 0;
          totalUpdated += data.updated || 0;
          if (data.errors) allErrors.push(...data.errors);
        }

        setSupplementProgress({
          processed: Math.min(i + BATCH_SIZE, filesToUpload.length),
          total: filesToUpload.length,
          current: "",
          matched: totalMatched,
          uploaded: totalUploaded,
          updated: totalUpdated,
          errors: [...allErrors],
        });
      }

      setSupplementProgress({
        processed: filesToUpload.length,
        total: filesToUpload.length,
        current: "",
        matched: totalMatched,
        uploaded: totalUploaded,
        updated: totalUpdated,
        errors: allErrors,
      });
      setSupplementDone(true);
    } catch (err) {
      setSupplementProgress((prev) => prev ? {
        ...prev,
        current: "",
        errors: [...prev.errors, `请求失败: ${err instanceof Error ? err.message : String(err)}`],
      } : null);
    } finally {
      setSupplementUploading(false);
    }
  };

  const handleDownloadTemplate = () => {
    const fields = ALL_FIELDS_BY_TYPE[importType];
    const headers = fields.map((f) => FIELD_LABELS[f]).join(",");
    const sample = fields.map((f) => {
      if (f.includes("size_") || f.includes("quantity") || f.includes("total_stock")) return "0";
      if (f.includes("price") || f.includes("profit") || f.includes("rate") || f.includes("value")) return "0";
      return "";
    }).join(",");
    const typeLabels: Record<string, string> = { inbound: "入库模板", sales: "售出模板", returns: "退货模板" };
    const content = headers + "\n" + sample;
    const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${typeLabels[importType] || "导入模板"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const visibleFields = showAllFields ? ALL_FIELDS : ALL_FIELDS.filter((f) => {
    const mapped = columnMap[f];
    if (mapped && csvHeaders.includes(mapped)) return true;
    return !SIZE_FIELDS.includes(f) || (columnMap["inbound_name"] && csvHeaders.includes(columnMap["inbound_name"]));
  });

  const matchedCount = ALL_FIELDS.filter((f) => columnMap[f] && csvHeaders.includes(columnMap[f])).length;

  return (
    <PageWrapper>
      <div className="mb-6 lg:mb-8">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-gray-900">
            <span className="highlight-green">数据导入</span>
          </h1>
          <select
            value={importType}
            onChange={(e) => {
              setImportType(e.target.value as "inbound" | "sales" | "returns");
              setColumnMap({});
              setResult(null);
              setError("");
              setPhotoFolderName("");
              setPhotoFiles([]);
              setPhotoFilter({});
              setCsvContent("");
              setCsvHeaders([]);
              setCsvPreview([]);
              setAllRows([]);
            }}
            className="text-sm sm:text-base px-3 py-1.5 rounded-lg border-[2px] border-gray-900 font-extrabold bg-white text-gray-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:bg-gray-50 transition-all"
          >
            <option value="inbound">入库清单导入</option>
            <option value="sales">售出清单导入</option>
            <option value="returns">退货清单导入</option>
          </select>
        </div>
        <p className="text-sm lg:text-lg text-gray-600 font-medium mt-2">
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
                  ✅ 检测到 {csvHeaders.length} 列，{allRows.length} 行数据
                </p>
                <p className="text-[10px] lg:text-xs text-green-600 mt-1">
                  已自动匹配 {matchedCount}/{ALL_FIELDS.length} 个字段
                </p>
              </div>
            )}

            {/* 入库模式：照片文件夹选择 */}
            {importType === "inbound" && csvHeaders.length > 0 && (
              <div className="mt-4 p-4 rounded-lg border-[3px] border-dashed border-[#4A90E2] bg-blue-50">
                <p className="text-xs lg:text-sm font-extrabold text-[#4A90E2] mb-3">📷 照片文件夹导入</p>
                <p className="text-[10px] text-gray-500 mb-2">选择本地 photo 文件夹（如 D:\MY WORK\dianbigntest\inventory-hub\photo），自动匹配 CSV 照片字段中的文件名</p>
                <div className="flex flex-col gap-2">
                  <label className="block cursor-pointer">
                    <div className="flex items-center gap-2 px-4 py-2 rounded-lg border-[2px] border-gray-900 bg-white font-bold text-xs shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:bg-gray-50 transition-all">
                      <Upload className="h-3.5 w-3.5" />
                      <span>{photoFolderName || "选择本地照片文件夹"}</span>
                    </div>
                    <input
                      type="file"
                      {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
                      multiple
                      accept="image/*"
                      onChange={handlePhotoFolderSelect}
                      className="hidden"
                    />
                  </label>
                  {photoFiles.length > 0 && (
                    <>
                      <p className="text-[10px] text-gray-500">
                        文件夹共 {photoFiles.length} 张照片，其中 {matchingPhotos.length} 张与 CSV 照片字段文件名匹配
                      </p>
                      <Button
                        onClick={handleUploadPhotos}
                        disabled={uploadingPhotos || matchingPhotos.length === 0}
                        variant="primary"
                        className="px-4 py-2 text-xs"
                      >
                        {uploadingPhotos ? "压缩上传中..." : `压缩并上传 ${matchingPhotos.length} 张匹配照片`}
                      </Button>
                    </>
                  )}
                  {photoFilter && Object.keys(photoFilter).length > 0 && (
                    <p className="text-[10px] text-green-600 font-bold">
                      ✅ 已上传 {Object.keys(photoFilter).length} 张照片
                    </p>
                  )}
                </div>
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
                {showAllFields && SIZE_FIELDS.length > 0 && (
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
            {loading ? "导入中..." : `开始导入 (${allRows.length} 条)`}
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
            <Badge variant="pink" className="text-xs lg:text-sm whitespace-pre-wrap text-left max-w-full">
              <AlertCircle className="h-3 w-3 mr-1 inline" />
              {error}
            </Badge>
          )}
        </div>
      )}

      {/* 补充照片导入（独立功能，可随时使用） */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base lg:text-xl text-[#4A90E2]">
            📷 补充照片导入
          </CardTitle>
          <p className="text-[10px] lg:text-xs text-gray-500">
            选择本地 photo 文件夹，自动匹配入库清单表中照片字段的文件名，压缩上传并替换为图片链接
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <label className="block cursor-pointer">
                <div className="flex items-center gap-2 px-4 py-2 rounded-lg border-[2px] border-gray-900 bg-white font-bold text-xs shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:bg-gray-50 transition-all">
                  <Upload className="h-3.5 w-3.5" />
                  <span>{supplementFolderName || "选择本地照片文件夹"}</span>
                </div>
                <input
                  type="file"
                  {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
                  multiple
                  accept="image/*"
                  onChange={handleSupplementFolderSelect}
                  className="hidden"
                />
              </label>
              {supplementFiles.length > 0 && (
                <Button
                  onClick={handleSupplementUpload}
                  disabled={supplementUploading}
                  variant="primary"
                  className="px-4 py-2 text-xs"
                >
                  {supplementUploading ? "处理中..." : `开始补充导入 (${supplementFiles.length} 张)`}
                </Button>
              )}
            </div>

            {/* 进度显示 */}
            {supplementProgress && (
              <div className="p-3 rounded-lg border-2 border-gray-200 bg-gray-50">
                {/* 进度条 */}
                <div className="w-full bg-gray-200 rounded-full h-3 mb-2 overflow-hidden">
                  <div
                    className="bg-[#4A90E2] h-3 rounded-full transition-all duration-500"
                    style={{ width: `${supplementProgress.total > 0 ? (supplementProgress.processed / supplementProgress.total * 100) : 0}%` }}
                  />
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] lg:text-xs">
                  {supplementUploading ? (
                    <>
                      <span className="text-[#4A90E2] font-bold">
                        进度: {supplementProgress.processed}/{supplementProgress.total}
                      </span>
                      {supplementProgress.current && (
                        <span className="text-gray-500">{supplementProgress.current}</span>
                      )}
                    </>
                  ) : (
                    <>
                      <span className="text-gray-600">
                        处理: {supplementProgress.processed}/{supplementProgress.total}
                      </span>
                      {supplementDone && (
                        <>
                          <span className="text-green-600 font-bold">
                            匹配: {supplementProgress.matched}
                          </span>
                          <span className="text-green-600 font-bold">
                            上传: {supplementProgress.uploaded}
                          </span>
                          <span className="text-green-600 font-bold">
                            更新: {supplementProgress.updated}
                          </span>
                        </>
                      )}
                    </>
                  )}
                </div>

                {supplementDone && (
                  <p className="text-xs font-bold text-green-600 mt-2">
                    ✅ 完成！共处理 {supplementProgress.processed} 张，匹配 {supplementProgress.matched} 张，上传 {supplementProgress.uploaded} 张，更新 {supplementProgress.updated} 条记录
                  </p>
                )}

                {/* 错误列表 */}
                {supplementProgress.errors.length > 0 && (
                  <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded">
                    <p className="text-[10px] font-bold text-yellow-800 mb-1">⚠️ 错误：</p>
                    <ul className="text-[10px] text-yellow-700 list-disc list-inside max-h-[100px] overflow-y-auto">
                      {supplementProgress.errors.slice(0, 10).map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                      {supplementProgress.errors.length > 10 && (
                        <li>... 还有 {supplementProgress.errors.length - 10} 个错误</li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </PageWrapper>
  );
}
