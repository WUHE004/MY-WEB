"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Camera,
  Image,
  Plus,
  Minus,
  Settings2,
  PlusCircle,
  X,
  GripVertical,
  Loader2,
  Upload,
  ChevronDown,
} from "lucide-react";
import Link from "next/link";
import { PageWrapper } from "@/components/page-wrapper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const DEFAULT_MANUFACTURERS = [
  "大炳家", "小礼物", "海燕家", "曾姐姐", "程祥家", "老刘家",
  "茶七厘家", "大咖家", "梓东家", "米可鑫家", "红姐家", "一鸣家",
  "小渔家", "奇布鲁家", "笨笨家", "小绵羊家", "婴时尚家", "啊正家",
  "钱多多家", "化磊家", "喜宝家", "收购家", "衣品汇家", "程哲家",
  "梨子家", "韩瑞家", "静静家", "衣鞋柜家", "晓晓家", "晓丽家",
  "甜妈家", "番薯家", "圆啊圆", "可乐家", "可可家", "凑凑",
  "童优格", "艾衣诺", "幸运儿", "丹丹家", "百变童年", "大妞童装",
  "阿勇", "丫丫家", "陈丽家",
];

const SIZE_OPTIONS = [80, 90, 95, 100, 105, 110, 120, 130, 140, 150, 160, 170, 180];

const SEASON_CATEGORIES = ["春季", "夏季", "秋季", "冬季", "四季通用"];

// 含尺码的款式分类
const DEFAULT_SIZE_STYLES = [
  "T恤", "裤子", "裙子", "外套", "卫衣", "套装", "连体衣", "羽绒服", "衬衫", "内衣", "其他",
];
// 不含尺码的款式分类
const DEFAULT_NO_SIZE_STYLES = ["母婴", "日用", "配饰"];

const DEFAULT_SHELF_DATA: Record<string, number[]> = {
  A: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  B: [1, 2],
  C: [1, 2, 3, 4, 5],
};

const DEFAULT_LAYERS = [1, 2, 3, 4, 5];

export default function InboundPage() {
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [saleId, setSaleId] = useState("");
  const [name, setName] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [sizes, setSizes] = useState<Record<number, number>>(
    Object.fromEntries(SIZE_OPTIONS.map((s) => [s, 0]))
  );
  const [standardSize, setStandardSize] = useState(0); // 无尺码分类的标码数量
  // 货架三级选择
  const [shelfLevel1, setShelfLevel1] = useState("");
  const [shelfLevel2, setShelfLevel2] = useState("");
  const [shelfLevel3, setShelfLevel3] = useState("");
  const [notes, setNotes] = useState("");
  const [season, setSeason] = useState("");
  const [style, setStyle] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // 厂家管理
  const [manufacturers, setManufacturers] = useState<string[]>(DEFAULT_MANUFACTURERS);
  const [showMfrDialog, setShowMfrDialog] = useState(false);
  const [newMfrName, setNewMfrName] = useState("");
  const [mfrSortMode, setMfrSortMode] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  // 厂家管理 - 草稿和变更追踪
  const [mfrDraft, setMfrDraft] = useState<string[]>([]);
  const [mfrHasChanges, setMfrHasChanges] = useState(false);

  // 款式管理
  const [sizeStyles, setSizeStyles] = useState<string[]>(DEFAULT_SIZE_STYLES);
  const [noSizeStyles, setNoSizeStyles] = useState<string[]>(DEFAULT_NO_SIZE_STYLES);
  const [showStyleDialog, setShowStyleDialog] = useState(false);
  const [newStyleName, setNewStyleName] = useState("");
  const [newStyleType, setNewStyleType] = useState<"size" | "nosize">("size");
  const [styleSortMode, setStyleSortMode] = useState(false);
  const [styleDragIndex, setStyleDragIndex] = useState<number | null>(null);
  const [styleDragType, setStyleDragType] = useState<"size" | "nosize" | null>(null);
  // 款式管理 - 草稿和变更追踪
  const [styleSizeDraft, setStyleSizeDraft] = useState<string[]>([]);
  const [styleNoSizeDraft, setStyleNoSizeDraft] = useState<string[]>([]);
  const [styleHasChanges, setStyleHasChanges] = useState(false);

  // 货架管理
  const [shelfData, setShelfData] = useState<Record<string, number[]>>(DEFAULT_SHELF_DATA);
  const [showShelfDialog, setShowShelfDialog] = useState(false);
  const [newShelfLevel1, setNewShelfLevel1] = useState("");
  const [newShelfLevel2Count, setNewShelfLevel2Count] = useState("5");
  // 货架管理 - 草稿和变更追踪
  const [shelfDraft, setShelfDraft] = useState<Record<string, number[]>>({});
  const [shelfHasChanges, setShelfHasChanges] = useState(false);
  // 货架管理 - 展开状态
  const [expandedShelfRow, setExpandedShelfRow] = useState<string | null>(null);
  const [expandedShelfNum, setExpandedShelfNum] = useState<string | null>(null);

  // 批量导入
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: number; fail: number; errors: string[] } | null>(null);
  // 列映射
  const [importMapping, setImportMapping] = useState<Record<string, string>>({
    sale_id: "售卖编号",
    name: "衣服名称",
    manufacturer: "厂家名称",
    cost_price: "进价",
    shelf_no: "货架号",
    style_category: "款式分类",
    season: "季节分类",
    notes: "备注",
    photo: "照片",
  });
  // 货架搬运
  const [shelfProducts, setShelfProducts] = useState<Record<string, { id: string; name: string; count: number }[]>>({});
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [transferFromShelf, setTransferFromShelf] = useState("");
  const [transferToShelf, setTransferToShelf] = useState("");
  const [transferring, setTransferring] = useState(false);
  // 设置加载状态
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

  // ===== 从数据库加载设置 =====
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const res = await fetch("/api/settings");
        if (res.ok) {
          const data = await res.json();
          if (data.size_styles && Array.isArray(data.size_styles)) {
            setSizeStyles(data.size_styles);
          }
          if (data.no_size_styles && Array.isArray(data.no_size_styles)) {
            setNoSizeStyles(data.no_size_styles);
          }
          if (data.shelf_data && typeof data.shelf_data === "object") {
            setShelfData(data.shelf_data as Record<string, number[]>);
          }
          if (data.manufacturers && Array.isArray(data.manufacturers)) {
            setManufacturers(data.manufacturers);
          }
        }
      } catch (err) {
        console.warn("加载设置失败，使用默认值", err);
      } finally {
        setSettingsLoaded(true);
      }
    };
    loadSettings();
  }, []);

  // ===== 保存设置到数据库 =====
  const saveSettings = async (key: string, value: unknown) => {
    try {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });
    } catch (err) {
      console.warn("保存设置失败", err);
    }
  };

  // ===== 下载 CSV 模板 =====
  const downloadTemplate = () => {
    const headers = [
      "售卖编号", "衣服名称", "厂家名称", "进价", "货架号",
      "款式分类", "季节分类", "备注", "照片",
      ...SIZE_OPTIONS.map((s) => `${s}码`),
    ];
    const sample = [
      "SP001", "示例T恤", "大炳家", "25", "A-1-1",
      "T恤", "夏季", "测试备注", "",
      ...SIZE_OPTIONS.map(() => "0"),
    ];
    const csv = [headers.join(","), sample.join(",")].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "入库导入模板.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  // ===== 查询货架上的商品 =====
  const checkShelfProducts = async (shelfNo: string) => {
    try {
      const res = await fetch(`/api/products?shelf_no=${encodeURIComponent(shelfNo)}`);
      if (res.ok) {
        const data = await res.json();
        return data.map((p: { id: string; name: string; total_stock: number }) => ({
          id: p.id,
          name: p.name,
          count: p.total_stock || 0,
        }));
      }
    } catch (err) {
      console.warn("查询货架商品失败", err);
    }
    return [];
  };

  // ===== 货架搬运 =====
  const handleTransferShelf = async () => {
    if (!transferFromShelf || !transferToShelf) return;
    setTransferring(true);
    try {
      const res = await fetch("/api/products/transfer-shelf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromShelf: transferFromShelf, toShelf: transferToShelf }),
      });
      if (res.ok) {
        const result = await res.json();
        alert(`成功搬运 ${result.count} 件商品从 ${transferFromShelf} 到 ${transferToShelf}`);
        setShowTransferDialog(false);
        // 刷新货架商品列表
        const products = await checkShelfProducts(transferFromShelf);
        setShelfProducts((prev) => ({ ...prev, [transferFromShelf]: products }));
      } else {
        const err = await res.json();
        alert("搬运失败: " + (err.error || "未知错误"));
      }
    } catch (err) {
      alert("网络错误");
    } finally {
      setTransferring(false);
    }
  };

  // 客户端图片压缩（Canvas → WebP，目标 ~200KB）
  const compressImage = useCallback(
    (file: File): Promise<{ blob: Blob; preview: string }> => {
      return new Promise((resolve, reject) => {
        const img = new window.Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const maxWidth = 800; // 缩略图足够用
          const scale = Math.min(1, maxWidth / img.width);
          canvas.width = img.width * scale;
          canvas.height = img.height * scale;
          const ctx = canvas.getContext("2d")!;
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(
            (blob) => {
              if (!blob) return reject(new Error("压缩失败"));
              const preview = canvas.toDataURL("image/jpeg", 0.7);
              resolve({ blob, preview });
            },
            "image/webp",
            0.7
          );
        };
        img.onerror = () => reject(new Error("图片加载失败"));
        img.src = URL.createObjectURL(file);
      });
    },
    []
  );

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPhotoUploading(true);
    try {
      // 第一步：前端压缩
      const { blob, preview } = await compressImage(file);
      setPhoto(preview); // 先显示本地预览

      // 第二步：上传到 Supabase Storage
      const formData = new FormData();
      formData.append("file", blob, file.name.replace(/\.[^.]+$/, ".webp"));
      formData.append("folder", "products");

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "上传失败");
      }

      const { url } = await res.json();
      setPhoto(url); // 替换为远程 URL
    } catch (err) {
      const msg = err instanceof Error ? err.message : "上传失败";
      alert("图片上传失败: " + msg);
      setPhoto(null);
    } finally {
      setPhotoUploading(false);
      // 重置 input 以便可以重新选择同一文件
      if (e.target) e.target.value = "";
    }
  };

  // 判断当前款式是否为无尺码分类
  const isNoSizeStyle = noSizeStyles.includes(style);

  // 所有款式（含尺码 + 不含尺码）
  const allStyles = [...sizeStyles, ...noSizeStyles];

  const handleStyleChange = (value: string) => {
    setStyle(value);
    // 切换到无尺码分类时，重置尺码选择
    if (noSizeStyles.includes(value)) {
      setSizes(Object.fromEntries(SIZE_OPTIONS.map((s) => [s, 0])));
    } else {
      setStandardSize(0);
    }
  };

  const updateSize = (size: number, delta: number) => {
    setSizes((prev) => ({
      ...prev,
      [size]: Math.max(0, (prev[size] || 0) + delta),
    }));
  };

  const setSizeValue = (size: number, value: string) => {
    const num = parseInt(value, 10);
    setSizes((prev) => ({
      ...prev,
      [size]: isNaN(num) ? 0 : Math.max(0, num),
    }));
  };

  const addManufacturer = () => {
    const trimmed = newMfrName.trim();
    if (trimmed && !mfrDraft.includes(trimmed)) {
      setMfrDraft((prev) => [...prev, trimmed]);
      setMfrHasChanges(true);
    }
    setNewMfrName("");
  };

  const removeManufacturer = (name: string) => {
    setMfrDraft((prev) => prev.filter((m) => m !== name));
    setMfrHasChanges(true);
    if (manufacturer === name) setManufacturer("");
  };

  const moveManufacturer = (fromIndex: number, toIndex: number) => {
    setMfrDraft((prev) => {
      const arr = [...prev];
      const [item] = arr.splice(fromIndex, 1);
      arr.splice(toIndex, 0, item);
      return arr;
    });
    setMfrHasChanges(true);
  };

  const saveManufacturers = async () => {
    await saveSettings("manufacturers", mfrDraft);
    setManufacturers(mfrDraft);
    setMfrHasChanges(false);
  };

  // ===== 款式管理 =====
  const addStyle = () => {
    const trimmed = newStyleName.trim();
    if (!trimmed) return;
    if (newStyleType === "size") {
      if (!styleSizeDraft.includes(trimmed)) {
        setStyleSizeDraft((prev) => [...prev, trimmed]);
        setStyleHasChanges(true);
      }
    } else {
      if (!styleNoSizeDraft.includes(trimmed)) {
        setStyleNoSizeDraft((prev) => [...prev, trimmed]);
        setStyleHasChanges(true);
      }
    }
    setNewStyleName("");
  };

  const removeStyle = (name: string, type: "size" | "nosize") => {
    if (type === "size") {
      setStyleSizeDraft((prev) => prev.filter((s) => s !== name));
      setStyleHasChanges(true);
    } else {
      setStyleNoSizeDraft((prev) => prev.filter((s) => s !== name));
      setStyleHasChanges(true);
    }
    if (style === name) setStyle("");
  };

  const moveStyle = (fromIndex: number, toIndex: number, type: "size" | "nosize") => {
    if (type === "size") {
      setStyleSizeDraft((prev) => {
        const arr = [...prev];
        const [item] = arr.splice(fromIndex, 1);
        arr.splice(toIndex, 0, item);
        return arr;
      });
      setStyleHasChanges(true);
    } else {
      setStyleNoSizeDraft((prev) => {
        const arr = [...prev];
        const [item] = arr.splice(fromIndex, 1);
        arr.splice(toIndex, 0, item);
        return arr;
      });
      setStyleHasChanges(true);
    }
  };

  const saveStyles = async () => {
    await saveSettings("size_styles", styleSizeDraft);
    await saveSettings("no_size_styles", styleNoSizeDraft);
    setSizeStyles(styleSizeDraft);
    setNoSizeStyles(styleNoSizeDraft);
    setStyleHasChanges(false);
  };

  // ===== 货架管理 =====
  const addShelfLevel1 = () => {
    const trimmed = newShelfLevel1.trim().toUpperCase();
    if (!trimmed || shelfDraft[trimmed]) return;
    const count = Math.max(1, parseInt(newShelfLevel2Count, 10) || 5);
    setShelfDraft((prev) => {
      const next = { ...prev, [trimmed]: Array.from({ length: count }, (_, i) => i + 1) };
      return next;
    });
    setShelfHasChanges(true);
    setNewShelfLevel1("");
    setNewShelfLevel2Count("5");
  };

  const removeShelfLevel1 = async (key: string) => {
    // 检查该排下所有货架是否有商品
    const positions = shelfDraft[key] || [];
    let hasProducts = false;
    for (const pos of positions) {
      for (const layer of DEFAULT_LAYERS) {
        const shelfNo = `${key}-${pos}-${layer}`;
        const products = await checkShelfProducts(shelfNo);
        if (products.length > 0) {
          hasProducts = true;
          setShelfProducts((prev) => ({ ...prev, [shelfNo]: products }));
        }
      }
    }
    if (hasProducts) {
      alert("该排列下有商品，请先将商品搬运到其他货架后再删除");
      return;
    }
    setShelfDraft((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setShelfHasChanges(true);
    if (shelfLevel1 === key) {
      setShelfLevel1("");
      setShelfLevel2("");
      setShelfLevel3("");
    }
  };

  const saveShelf = async () => {
    await saveSettings("shelf_data", shelfDraft);
    setShelfData(shelfDraft);
    setShelfHasChanges(false);
  };

  // 在排内添加货架号
  const addShelfNumToRow = (rowKey: string) => {
    setShelfDraft((prev) => {
      const row = prev[rowKey] || [];
      const maxNum = row.length > 0 ? Math.max(...row) : 0;
      return { ...prev, [rowKey]: [...row, maxNum + 1] };
    });
    setShelfHasChanges(true);
  };

  // 从排内删除货架号
  const removeShelfNumFromRow = async (rowKey: string, shelfNum: number) => {
    // 检查该货架号下所有层是否有商品
    let hasProducts = false;
    for (const layer of DEFAULT_LAYERS) {
      const shelfNo = `${rowKey}-${shelfNum}-${layer}`;
      const products = await checkShelfProducts(shelfNo);
      if (products.length > 0) {
        hasProducts = true;
        setShelfProducts((prev) => ({ ...prev, [shelfNo]: products }));
      }
    }
    if (hasProducts) {
      alert(`货架 ${rowKey}-${shelfNum} 下有商品，请先搬运后再删除`);
      return;
    }
    setShelfDraft((prev) => {
      const row = prev[rowKey] || [];
      const next = { ...prev, [rowKey]: row.filter((n) => n !== shelfNum) };
      if (next[rowKey].length === 0) delete next[rowKey];
      return next;
    });
    setShelfHasChanges(true);
  };

  // 搬运单个货架号
  const handleTransferShelfNum = async (rowKey: string, shelfNum: number) => {
    setTransferFromShelf(rowKey);
    // 收集该货架号下所有层的商品
    const allShelves: string[] = [];
    for (const layer of DEFAULT_LAYERS) {
      allShelves.push(`${rowKey}-${shelfNum}-${layer}`);
    }
    for (const sn of allShelves) {
      const products = await checkShelfProducts(sn);
      if (products.length > 0) {
        setShelfProducts((prev) => ({ ...prev, [sn]: products }));
      }
    }
    setShowTransferDialog(true);
  };

  const getShelfNo = (): string => {
    if (shelfLevel1 && shelfLevel2 && shelfLevel3) {
      return `${shelfLevel1}-${shelfLevel2}-${shelfLevel3}`;
    }
    return "";
  };

  // ===== 批量导入 =====
  const parseCSV = (text: string): string[][] => {
    return text.trim().split(/\r?\n/).map((line) => {
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
        } else {
          current += ch;
        }
      }
      result.push(current.trim());
      return result;
    });
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    try {
      const text = await file.text();
      const rows = parseCSV(text);
      if (rows.length < 2) {
        alert("CSV 文件为空或格式不正确");
        return;
      }
      const headers = rows[0];
      const dataRows = rows.slice(1);

      let success = 0;
      let fail = 0;
      const errors: string[] = [];

      for (let r = 0; r < dataRows.length; r++) {
        const row = dataRows[r];
        try {
          const record: Record<string, unknown> = {};
          headers.forEach((h, i) => { record[h.trim()] = row[i] || ""; });

          // 使用列映射获取字段值
          const getField = (field: string) => {
            const csvHeader = importMapping[field];
            if (csvHeader && record[csvHeader] !== undefined) return String(record[csvHeader]);
            // 回退到默认列名
            return String(record[field] || "");
          };

          const sid = getField("sale_id");
          const pname = getField("name");
          const mfr = getField("manufacturer");
          const cost = parseFloat(getField("cost_price"));
          const sn = getField("shelf_no");
          const st = getField("style_category");
          const seas = getField("season");
          const nts = getField("notes");
          const photoUrl = getField("photo");

          if (!sid || !mfr || isNaN(cost)) {
            errors.push(`第 ${r + 2} 行: 缺少必填字段`);
            fail++;
            continue;
          }

          const sizeMap: Record<number, number> = {};
          SIZE_OPTIONS.forEach((s) => { sizeMap[s] = parseInt(String(record[`${s}码`] || record[`size_${s}`] || "0"), 10) || 0; });
          const totalQty = Object.values(sizeMap).reduce((sum, v) => sum + v, 0);

          const product = {
            id: sid,
            sale_id: sid,
            manufacturer: mfr,
            photo: photoUrl,
            name: pname,
            total_stock: totalQty,
            sold_qty: 0,
            remaining_stock: totalQty,
            shelf_no: sn,
            size_80: sizeMap[80] || 0,
            size_90: sizeMap[90] || 0,
            size_95: sizeMap[95] || 0,
            size_100: sizeMap[100] || 0,
            size_105: sizeMap[105] || 0,
            size_110: sizeMap[110] || 0,
            size_120: sizeMap[120] || 0,
            size_130: sizeMap[130] || 0,
            size_140: sizeMap[140] || 0,
            size_150: sizeMap[150] || 0,
            size_160: sizeMap[160] || 0,
            size_170: sizeMap[170] || 0,
            size_180: sizeMap[180] || 0,
            stock_warning: 10,
            cost_price: cost,
            sell_price: 0,
            profit: 0,
            return_qty: 0,
            return_rate: 0,
            inventory_value: totalQty * cost,
            last_order_time: new Date().toISOString().split("T")[0],
            status: "active",
            notes: nts,
            season: seas,
            style_category: st,
          };

          const productRes = await fetch("/api/products", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(product),
          });
          if (!productRes.ok) throw new Error("商品入库失败");

          const inboundRecord = {
            sale_id: sid,
            photo: photoUrl,
            name: pname,
            manufacturer: mfr,
            size_80: sizeMap[80] || 0,
            size_90: sizeMap[90] || 0,
            size_95: sizeMap[95] || 0,
            size_100: sizeMap[100] || 0,
            size_105: sizeMap[105] || 0,
            size_110: sizeMap[110] || 0,
            size_120: sizeMap[120] || 0,
            size_130: sizeMap[130] || 0,
            size_140: sizeMap[140] || 0,
            size_150: sizeMap[150] || 0,
            size_160: sizeMap[160] || 0,
            size_170: sizeMap[170] || 0,
            size_180: sizeMap[180] || 0,
            shelf_no: sn,
            cost_price: cost,
            season: seas,
            style_category: st,
            notes: nts,
          };

          const inboundRes = await fetch("/api/inbound-records", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(inboundRecord),
          });
          if (!inboundRes.ok) throw new Error("入库记录写入失败");

          success++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : "未知错误";
          errors.push(`第 ${r + 2} 行: ${msg}`);
          fail++;
        }
      }
      setImportResult({ success, fail, errors: errors.slice(0, 10) });
    } catch (err) {
      alert("文件读取失败: " + (err instanceof Error ? err.message : "未知错误"));
    } finally {
      setImporting(false);
      if (e.target) e.target.value = "";
    }
  };

  const handleSubmit = async () => {
    if (!saleId.trim()) {
      alert("请输入售卖编号");
      return;
    }
    if (!manufacturer) {
      alert("请选择厂家名称");
      return;
    }
    if (!costPrice || isNaN(Number(costPrice))) {
      alert("请输入有效的进价");
      return;
    }

    setSubmitting(true);

    const totalQty = isNoSizeStyle
      ? standardSize
      : Object.values(sizes).reduce((sum, v) => sum + v, 0);

    const product = {
      id: saleId.trim(),
      sale_id: saleId.trim(),
      manufacturer,
      photo: photo || "",
      name: name.trim(),
      total_stock: totalQty,
      sold_qty: 0,
      remaining_stock: totalQty,
      shelf_no: getShelfNo(),
      size_80: sizes[80] || 0,
      size_90: sizes[90] || 0,
      size_95: sizes[95] || 0,
      size_100: sizes[100] || 0,
      size_105: sizes[105] || 0,
      size_110: sizes[110] || 0,
      size_120: sizes[120] || 0,
      size_130: sizes[130] || 0,
      size_140: sizes[140] || 0,
      size_150: sizes[150] || 0,
      size_160: sizes[160] || 0,
      size_170: sizes[170] || 0,
      size_180: sizes[180] || 0,
      stock_warning: 10,
      cost_price: Number(costPrice),
      sell_price: 0,
      profit: 0,
      return_qty: 0,
      return_rate: 0,
      inventory_value: totalQty * Number(costPrice),
      last_order_time: new Date().toISOString().split("T")[0],
      status: "active",
      notes: notes.trim(),
      season: season,
      style_category: style,
    };

    try {
      const productRes = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(product),
      });

      if (!productRes.ok) {
        const err = await productRes.json();
        alert("商品入库失败: " + (err.error || "未知错误"));
        return;
      }

      const inboundRecord = {
        sale_id: saleId.trim(),
        photo: photo || "",
        name: name.trim(),
        manufacturer,
        size_80: sizes[80] || 0,
        size_90: sizes[90] || 0,
        size_95: sizes[95] || 0,
        size_100: sizes[100] || 0,
        size_105: sizes[105] || 0,
        size_110: sizes[110] || 0,
        size_120: sizes[120] || 0,
        size_130: sizes[130] || 0,
        size_140: sizes[140] || 0,
        size_150: sizes[150] || 0,
        size_160: sizes[160] || 0,
        size_170: sizes[170] || 0,
        size_180: sizes[180] || 0,
        shelf_no: getShelfNo(),
        cost_price: Number(costPrice),
        season,
        style_category: style,
        notes: notes.trim(),
      };

      const inboundRes = await fetch("/api/inbound-records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(inboundRecord),
      });

      if (inboundRes.ok) {
        alert("入库登记成功！");
        setPhoto(null);
        setSaleId("");
        setName("");
        setManufacturer("");
        setCostPrice("");
        setSizes(Object.fromEntries(SIZE_OPTIONS.map((s) => [s, 0])));
        setStandardSize(0);
        setShelfLevel1("");
        setShelfLevel2("");
        setShelfLevel3("");
        setNotes("");
        setSeason("");
        setStyle("");
      } else {
        const err = await inboundRes.json();
        alert("入库记录写入失败: " + (err.error || "未知错误"));
      }
    } catch (err) {
      alert("网络错误，请重试");
    } finally {
      setSubmitting(false);
    }
  };

  const totalSizeCount = isNoSizeStyle
    ? standardSize
    : Object.values(sizes).reduce((sum, v) => sum + v, 0);

  return (
    <PageWrapper>
      {/* Header */}
      <div className="flex items-center gap-3 lg:gap-4 mb-6 lg:mb-8">
        <Link
          href="/links"
          className="flex h-10 w-10 items-center justify-center rounded-xl border-[3px] border-gray-900 bg-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-gray-900">
          <span className="highlight-yellow">入库登记</span>
        </h1>
        <Link
          href="/data-import"
          className="flex h-10 w-10 items-center justify-center rounded-xl border-[3px] border-gray-900 bg-[#7B61FF] shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
          title="批量导入"
        >
          <Upload className="h-5 w-5 text-white" />
        </Link>
      </div>

      <div className="max-w-2xl mx-auto">
        {/* Photo Upload */}
        <div className="mb-6">
          <label className="text-sm lg:text-base font-extrabold text-gray-900 mb-2 block">
            商品照片
          </label>
          <div className="flex gap-3">
            <div
              onClick={() => !photoUploading && fileInputRef.current?.click()}
              className="flex-1 h-[200px] rounded-xl border-[3px] border-dashed border-gray-400 bg-gray-50 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-gray-900 hover:bg-gray-100 transition-all relative overflow-hidden"
            >
              {photoUploading ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
                  <span className="text-xs font-bold text-gray-500">正在压缩并上传...</span>
                </div>
              ) : photo ? (
                <img src={photo} alt="Preview" className="w-full h-full object-cover rounded-lg" />
              ) : (
                <>
                  <Image className="h-8 w-8 text-gray-400" />
                  <span className="text-xs font-bold text-gray-400">点击上传照片</span>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoUpload}
                className="hidden"
              />
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => cameraInputRef.current?.click()}
                disabled={photoUploading}
                className="flex h-10 w-10 items-center justify-center rounded-xl border-[3px] border-gray-900 bg-[#4A90E2] shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[3px] active:translate-y-[3px] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                title="拍照"
              >
                <Camera className="h-5 w-5 text-white" />
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={photoUploading}
                className="flex h-10 w-10 items-center justify-center rounded-xl border-[3px] border-gray-900 bg-[#FFC93C] shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[3px] active:translate-y-[3px] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                title="从相册选择"
              >
                <Image className="h-5 w-5 text-gray-900" />
              </button>
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handlePhotoUpload}
                className="hidden"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 mb-6">
          {/* Sale ID */}
          <div>
            <label className="text-sm lg:text-base font-extrabold text-gray-900 mb-1 block">
              售卖编号 <span className="text-red-500">*</span>
            </label>
            <Input
              value={saleId}
              onChange={(e) => {
                const val = e.target.value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
                setSaleId(val);
              }}
              placeholder="例如: WUHE001"
              className="text-sm"
            />
          </div>

          {/* Name */}
          <div>
            <label className="text-sm lg:text-base font-extrabold text-gray-900 mb-1 block">
              衣服名称 <span className="text-xs font-normal text-gray-400">(非必填)</span>
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如: 夏季短袖T恤"
              className="text-sm"
            />
          </div>

          {/* Manufacturer */}
          <div>
            <label className="text-sm lg:text-base font-extrabold text-gray-900 mb-1 block">
              厂家名称 <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <select
                  value={manufacturer}
                  onChange={(e) => setManufacturer(e.target.value)}
                  className="neo-input w-full text-sm pr-8"
                >
                  <option value="">请选择厂家</option>
                  {manufacturers.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={() => { setMfrDraft([...manufacturers]); setMfrHasChanges(false); setShowMfrDialog(true); }}
                className="flex h-10 w-10 items-center justify-center rounded-xl border-[3px] border-gray-900 bg-gray-100 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[3px] active:translate-y-[3px] transition-all"
                title="管理厂家"
              >
                <Settings2 className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Cost Price */}
          <div>
            <label className="text-sm lg:text-base font-extrabold text-gray-900 mb-1 block">
              进价 <span className="text-red-500">*</span>
            </label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={costPrice}
              onChange={(e) => setCostPrice(e.target.value)}
              placeholder="例如: 29.9"
              className="text-sm"
            />
          </div>

          {/* Shelf No - 三级货架选择 */}
          <div>
            <label className="text-sm lg:text-base font-extrabold text-gray-900 mb-1 block">
              货架号
            </label>
            <div className="flex gap-2">
              <div className="flex-1 flex gap-1.5">
                <select
                  value={shelfLevel1}
                  onChange={(e) => { setShelfLevel1(e.target.value); setShelfLevel2(""); setShelfLevel3(""); }}
                  className="neo-input flex-1 text-sm"
                >
                  <option value="">一排</option>
                  {Object.keys(shelfData).map((k) => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>
                <select
                  value={shelfLevel2}
                  onChange={(e) => { setShelfLevel2(e.target.value); setShelfLevel3(""); }}
                  disabled={!shelfLevel1}
                  className="neo-input flex-1 text-sm disabled:opacity-40"
                >
                  <option value="">货架号</option>
                  {shelfLevel1 && (shelfData[shelfLevel1] || []).map((n) => (
                    <option key={n} value={String(n)}>{n}</option>
                  ))}
                </select>
                <select
                  value={shelfLevel3}
                  onChange={(e) => setShelfLevel3(e.target.value)}
                  disabled={!shelfLevel2}
                  className="neo-input flex-1 text-sm disabled:opacity-40"
                >
                  <option value="">层</option>
                  {DEFAULT_LAYERS.map((n) => (
                    <option key={n} value={String(n)}>{n}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={() => { setShelfDraft({...shelfData}); setShelfHasChanges(false); setShowShelfDialog(true); }}
                className="flex h-10 w-10 items-center justify-center rounded-xl border-[3px] border-gray-900 bg-gray-100 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[3px] active:translate-y-[3px] transition-all shrink-0"
                title="管理货架"
              >
                <Settings2 className="h-5 w-5" />
              </button>
            </div>
            {shelfLevel1 && shelfLevel2 && shelfLevel3 && (
              <p className="text-[10px] text-gray-500 mt-1 font-bold">
                {getShelfNo()}（{shelfLevel1}货架第{shelfLevel3}层）
              </p>
            )}
          </div>

          {/* Season */}
          <div>
            <label className="text-sm lg:text-base font-extrabold text-gray-900 mb-1 block">
              季节分类
            </label>
            <select
              value={season}
              onChange={(e) => setSeason(e.target.value)}
              className="neo-input w-full text-sm"
            >
              <option value="">请选择季节</option>
              {SEASON_CATEGORIES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Style */}
          <div>
            <label className="text-sm lg:text-base font-extrabold text-gray-900 mb-1 block">
              款式分类
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <select
                  value={style}
                  onChange={(e) => handleStyleChange(e.target.value)}
                  className="neo-input w-full text-sm"
                >
                  <option value="">请选择款式</option>
                  <optgroup label="── 含尺码分类 ──">
                    {sizeStyles.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </optgroup>
                  <optgroup label="── 不含尺码分类 ──">
                    {noSizeStyles.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </optgroup>
                </select>
              </div>
              <button
                onClick={() => { setStyleSizeDraft([...sizeStyles]); setStyleNoSizeDraft([...noSizeStyles]); setStyleHasChanges(false); setShowStyleDialog(true); }}
                className="flex h-10 w-10 items-center justify-center rounded-xl border-[3px] border-gray-900 bg-gray-100 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[3px] active:translate-y-[3px] transition-all shrink-0"
                title="管理款式"
              >
                <Settings2 className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Sizes */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm lg:text-base font-extrabold text-gray-900">
              {isNoSizeStyle ? "标码数量" : "尺码数量"}
            </label>
            <span className="text-xs lg:text-sm font-bold text-gray-500">
              合计: {totalSizeCount} 件
            </span>
          </div>
          {isNoSizeStyle ? (
            <div className="rounded-xl border-[3px] border-gray-900 bg-white p-3 inline-flex items-center gap-3">
              <span className="text-sm font-extrabold text-gray-900">标码</span>
              <button
                type="button"
                onClick={() => setStandardSize((prev) => Math.max(0, prev - 1))}
                className="flex h-8 w-8 items-center justify-center rounded-lg border-[2px] border-gray-900 bg-[#FF6B7A] text-white active:scale-90 transition-transform"
              >
                <Minus className="h-4 w-4" />
              </button>
              <input
                type="text"
                inputMode="numeric"
                value={standardSize}
                onChange={(e) => {
                  const num = parseInt(e.target.value, 10);
                  setStandardSize(isNaN(num) ? 0 : Math.max(0, num));
                }}
                className="w-16 text-center text-base font-extrabold text-gray-900 border-none outline-none bg-transparent"
              />
              <button
                type="button"
                onClick={() => setStandardSize((prev) => prev + 1)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border-[2px] border-gray-900 bg-[#4CD964] text-white active:scale-90 transition-transform"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-7 lg:grid-cols-7 gap-2 lg:gap-3">
              {SIZE_OPTIONS.map((size) => (
                <div
                  key={size}
                  className="rounded-xl border-[3px] border-gray-900 bg-white p-1.5 lg:p-2"
                >
                  <div className={`text-center text-[10px] lg:text-xs font-extrabold mb-1 ${(sizes[size] || 0) > 0 ? "text-gray-900" : "text-gray-300"}`}>
                    {size}
                  </div>
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => updateSize(size, -1)}
                      className="flex h-5 w-5 lg:h-6 lg:w-6 items-center justify-center rounded-md border-[2px] border-gray-900 bg-[#FF6B7A] text-white active:scale-90 transition-transform"
                    >
                      <Minus className="h-2.5 w-2.5 lg:h-3 lg:w-3" />
                    </button>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={sizes[size] || 0}
                      onChange={(e) => setSizeValue(size, e.target.value)}
                      className={`w-full text-center text-xs lg:text-sm font-extrabold border-none outline-none bg-transparent ${(sizes[size] || 0) > 0 ? "text-gray-900" : "text-gray-300"}`}
                    />
                    <button
                      type="button"
                      onClick={() => updateSize(size, 1)}
                      className="flex h-5 w-5 lg:h-6 lg:w-6 items-center justify-center rounded-md border-[2px] border-gray-900 bg-[#4CD964] text-white active:scale-90 transition-transform"
                    >
                      <Plus className="h-2.5 w-2.5 lg:h-3 lg:w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Notes */}
        <div className="mb-8">
          <label className="text-sm lg:text-base font-extrabold text-gray-900 mb-1 block">
            备注 <span className="text-xs font-normal text-gray-400">(非必填)</span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="请输入备注信息..."
            rows={3}
            className="neo-input w-full text-sm resize-none"
          />
        </div>

        {/* Submit */}
        <Button
          variant="primary"
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full py-4 text-base lg:text-lg font-extrabold"
        >
          {submitting ? "提交中..." : "提交入库"}
        </Button>
      </div>

      {/* Manufacturer Dialog */}
      {showMfrDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-[90%] max-w-md max-h-[80vh] bg-white rounded-2xl border-[3px] border-gray-900 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] p-6 flex flex-col"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-extrabold">厂家管理</h2>
              <button
                onClick={() => {
                  setShowMfrDialog(false);
                  setMfrSortMode(false);
                }}
                className="flex h-8 w-8 items-center justify-center rounded-lg border-[2px] border-gray-900 hover:bg-gray-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Add new */}
            <div className="flex gap-2 mb-4">
              <Input
                value={newMfrName}
                onChange={(e) => setNewMfrName(e.target.value)}
                placeholder="输入新厂家名称"
                className="text-sm flex-1"
                onKeyDown={(e) => e.key === "Enter" && addManufacturer()}
              />
              <button
                onClick={addManufacturer}
                className="flex h-10 w-10 items-center justify-center rounded-xl border-[3px] border-gray-900 bg-[#4CD964] shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[3px] active:translate-y-[3px] transition-all"
              >
                <PlusCircle className="h-5 w-5 text-white" />
              </button>
            </div>

            {/* Toggle sort mode */}
            <button
              onClick={() => setMfrSortMode(!mfrSortMode)}
              className="text-xs font-bold text-[#4A90E2] mb-3 self-start"
            >
              {mfrSortMode ? "完成排序" : "拖拽排序"}
            </button>

            {/* Manufacturer list */}
            <div className="flex-1 overflow-y-auto space-y-1">
              {mfrDraft.map((m, index) => (
                <div
                  key={m}
                  draggable={mfrSortMode}
                  onDragStart={() => mfrSortMode && setDragIndex(index)}
                  onDragOver={(e) => {
                    if (mfrSortMode && dragIndex !== null && dragIndex !== index) {
                      e.preventDefault();
                      moveManufacturer(dragIndex, index);
                      setDragIndex(index);
                    }
                  }}
                  onDragEnd={() => setDragIndex(null)}
                  className={`flex items-center justify-between p-2 rounded-lg border-[2px] border-gray-200 ${
                    mfrSortMode ? "cursor-grab active:cursor-grabbing" : ""
                  } ${index === dragIndex ? "bg-gray-100" : ""}`}
                >
                  <div className="flex items-center gap-2">
                    {mfrSortMode && <GripVertical className="h-4 w-4 text-gray-400" />}
                    <span className="text-sm font-bold">{m}</span>
                  </div>
                  <button
                    onClick={() => removeManufacturer(m)}
                    className="flex h-6 w-6 items-center justify-center rounded-md border-[2px] border-gray-300 text-red-400 hover:bg-red-50 hover:border-red-400"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>

            {/* 保存修改按钮 */}
            <div className="mt-4 pt-3 border-t-[2px] border-gray-200">
              <button
                onClick={saveManufacturers}
                disabled={!mfrHasChanges}
                className={`w-full py-2.5 text-sm font-extrabold rounded-xl border-[3px] border-gray-900 transition-all ${
                  mfrHasChanges
                    ? "bg-[#4CD964] text-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[3px] active:translate-y-[3px]"
                    : "bg-gray-200 text-gray-400 cursor-not-allowed"
                }`}
              >
                {mfrHasChanges ? "保存修改" : "已保存"}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Shelf Management Dialog */}
      {showShelfDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-[90%] max-w-md max-h-[80vh] bg-white rounded-2xl border-[3px] border-gray-900 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] p-6 flex flex-col"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-extrabold">货架管理</h2>
              <button
                onClick={() => { setShowShelfDialog(false); setExpandedShelfRow(null); setExpandedShelfNum(null); }}
                className="flex h-8 w-8 items-center justify-center rounded-lg border-[2px] border-gray-900 hover:bg-gray-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex gap-2 mb-4">
              <Input
                value={newShelfLevel1}
                onChange={(e) => setNewShelfLevel1(e.target.value)}
                placeholder="排编号 (如: D)"
                className="text-sm flex-1"
                maxLength={1}
              />
              <Input
                type="number"
                value={newShelfLevel2Count}
                onChange={(e) => setNewShelfLevel2Count(e.target.value)}
                placeholder="货架数"
                className="text-sm w-20"
                min="1"
                max="20"
              />
              <button
                onClick={addShelfLevel1}
                className="flex h-10 w-10 items-center justify-center rounded-xl border-[3px] border-gray-900 bg-[#4CD964] shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[3px] active:translate-y-[3px] transition-all"
              >
                <PlusCircle className="h-5 w-5 text-white" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2">
              {Object.entries(shelfDraft).map(([key, positions]) => {
                const isRowExpanded = expandedShelfRow === key;
                return (
                  <div key={key} className="rounded-lg border-[2px] border-gray-200 overflow-hidden">
                    {/* 一级：排 */}
                    <div
                      className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-50"
                      onClick={() => setExpandedShelfRow(isRowExpanded ? null : key)}
                    >
                      <div className="flex items-center gap-2">
                        <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform ${isRowExpanded ? "rotate-180" : ""}`} />
                        <span className="text-sm font-extrabold">{key} 排</span>
                        <span className="text-[10px] text-gray-400">({positions.length}个货架)</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            setTransferFromShelf(key);
                            const allShelves: string[] = [];
                            for (const pos of positions) {
                              for (const layer of DEFAULT_LAYERS) {
                                allShelves.push(`${key}-${pos}-${layer}`);
                              }
                            }
                            for (const sn of allShelves) {
                              const products = await checkShelfProducts(sn);
                              if (products.length > 0) {
                                setShelfProducts((prev) => ({ ...prev, [sn]: products }));
                              }
                            }
                            setShowTransferDialog(true);
                          }}
                          className="flex h-6 px-2 items-center justify-center rounded-md border-[2px] border-[#4A90E2] text-[10px] font-bold text-[#4A90E2] hover:bg-blue-50"
                          title="搬运整排货物"
                        >
                          搬运
                        </button>
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            await removeShelfLevel1(key);
                          }}
                          className="flex h-6 w-6 items-center justify-center rounded-md border-[2px] border-gray-300 text-red-400 hover:bg-red-50 hover:border-red-400"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    </div>

                    {/* 二级：货架号 */}
                    {isRowExpanded && (
                      <div className="border-t-[2px] border-gray-200 bg-gray-50/50">
                        {positions.map((shelfNum) => {
                          const isNumExpanded = expandedShelfNum === `${key}-${shelfNum}`;
                          return (
                            <div key={shelfNum} className="border-b border-gray-100 last:border-b-0">
                              <div
                                className="flex items-center justify-between pl-8 pr-3 py-2 cursor-pointer hover:bg-gray-100"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpandedShelfNum(isNumExpanded ? null : `${key}-${shelfNum}`);
                                }}
                              >
                                <div className="flex items-center gap-2">
                                  <ChevronDown className={`h-3 w-3 text-gray-400 transition-transform ${isNumExpanded ? "rotate-180" : ""}`} />
                                  <span className="text-xs font-bold text-gray-700">货架 {shelfNum}</span>
                                  <span className="text-[10px] text-gray-400">({DEFAULT_LAYERS.length}层)</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={async (ev) => {
                                      ev.stopPropagation();
                                      await handleTransferShelfNum(key, shelfNum);
                                    }}
                                    className="flex h-5 px-1.5 items-center justify-center rounded-md border-[1px] border-[#4A90E2] text-[9px] font-bold text-[#4A90E2] hover:bg-blue-50"
                                    title="搬运此货架"
                                  >
                                    搬运
                                  </button>
                                  <button
                                    onClick={async (ev) => {
                                      ev.stopPropagation();
                                      await removeShelfNumFromRow(key, shelfNum);
                                    }}
                                    className="flex h-5 w-5 items-center justify-center rounded-md border-[1px] border-gray-300 text-red-400 hover:bg-red-50 hover:border-red-400"
                                  >
                                    <X className="h-2.5 w-2.5" />
                                  </button>
                                </div>
                              </div>

                              {/* 三级：层 */}
                              {isNumExpanded && (
                                <div className="pl-14 pr-3 py-1 space-y-0.5 bg-gray-100/50">
                                  {DEFAULT_LAYERS.map((layer) => {
                                    const fullShelfNo = `${key}-${shelfNum}-${layer}`;
                                    return (
                                      <div key={layer} className="flex items-center justify-between py-1">
                                        <span className="text-[10px] text-gray-600">
                                          第 {layer} 层 <span className="text-gray-400 font-mono">({fullShelfNo})</span>
                                        </span>
                                        <div className="flex items-center gap-1">
                                          <button
                                            onClick={async (ev) => {
                                              ev.stopPropagation();
                                              setTransferFromShelf(`${key}-${shelfNum}`);
                                              const products = await checkShelfProducts(fullShelfNo);
                                              if (products.length > 0) {
                                                setShelfProducts((prev) => ({ ...prev, [fullShelfNo]: products }));
                                              }
                                              setShowTransferDialog(true);
                                            }}
                                            className="flex h-5 px-1.5 items-center justify-center rounded-md border-[1px] border-[#4A90E2] text-[9px] font-bold text-[#4A90E2] hover:bg-blue-50"
                                            title="搬运此层"
                                          >
                                            搬运
                                          </button>
                                          <button
                                            onClick={async (ev) => {
                                              ev.stopPropagation();
                                              const products = await checkShelfProducts(fullShelfNo);
                                              if (products.length > 0) {
                                                setShelfProducts((prev) => ({ ...prev, [fullShelfNo]: products }));
                                                alert(`该层(${fullShelfNo})有 ${products.length} 种商品，请先搬运后再删除`);
                                                return;
                                              }
                                              alert(`该层(${fullShelfNo})暂无商品，层删除功能暂不支持单独删除层，如需调整请修改货架结构`);
                                            }}
                                            className="flex h-5 w-5 items-center justify-center rounded-md border-[1px] border-gray-300 text-red-400 hover:bg-red-50 hover:border-red-400"
                                          >
                                            <X className="h-2.5 w-2.5" />
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      addShelfNumToRow(key);
                                    }}
                                    className="flex items-center gap-1 text-[9px] font-bold text-[#4CD964] hover:underline py-1"
                                  >
                                    <PlusCircle className="h-2.5 w-2.5" /> 在此排添加货架号
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            addShelfNumToRow(key);
                          }}
                          className="flex items-center gap-1 text-[9px] font-bold text-[#4CD964] hover:underline py-1.5 pl-8"
                        >
                          <PlusCircle className="h-2.5 w-2.5" /> 添加货架号
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* 保存修改按钮 */}
            <div className="mt-4 pt-3 border-t-[2px] border-gray-200">
              <button
                onClick={saveShelf}
                disabled={!shelfHasChanges}
                className={`w-full py-2.5 text-sm font-extrabold rounded-xl border-[3px] border-gray-900 transition-all ${
                  shelfHasChanges
                    ? "bg-[#4CD964] text-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[3px] active:translate-y-[3px]"
                    : "bg-gray-200 text-gray-400 cursor-not-allowed"
                }`}
              >
                {shelfHasChanges ? "保存修改" : "已保存"}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Style Management Dialog */}
      {showStyleDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-[90%] max-w-md max-h-[80vh] bg-white rounded-2xl border-[3px] border-gray-900 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] p-6 flex flex-col"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-extrabold">款式管理</h2>
              <button
                onClick={() => { setShowStyleDialog(false); setStyleSortMode(false); }}
                className="flex h-8 w-8 items-center justify-center rounded-lg border-[2px] border-gray-900 hover:bg-gray-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Add new */}
            <div className="flex gap-2 mb-2">
              <Input
                value={newStyleName}
                onChange={(e) => setNewStyleName(e.target.value)}
                placeholder="输入新款式名称"
                className="text-sm flex-1"
                onKeyDown={(e) => e.key === "Enter" && addStyle()}
              />
              <select
                value={newStyleType}
                onChange={(e) => setNewStyleType(e.target.value as "size" | "nosize")}
                className="neo-input text-sm w-24"
              >
                <option value="size">含尺码</option>
                <option value="nosize">不含尺码</option>
              </select>
              <button
                onClick={addStyle}
                className="flex h-10 w-10 items-center justify-center rounded-xl border-[3px] border-gray-900 bg-[#4CD964] shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[3px] active:translate-y-[3px] transition-all"
              >
                <PlusCircle className="h-5 w-5 text-white" />
              </button>
            </div>

            <button
              onClick={() => setStyleSortMode(!styleSortMode)}
              className="text-xs font-bold text-[#4A90E2] mb-3 self-start"
            >
              {styleSortMode ? "完成排序" : "拖拽排序"}
            </button>

            <div className="flex-1 overflow-y-auto space-y-3">
              {/* 含尺码 */}
              <div>
                <p className="text-xs font-extrabold text-gray-500 mb-1">含尺码分类</p>
                <div className="space-y-1">
                  {styleSizeDraft.map((s, index) => (
                    <div
                      key={s}
                      draggable={styleSortMode}
                      onDragStart={() => { styleSortMode && setStyleDragIndex(index); setStyleDragType("size"); }}
                      onDragOver={(e) => {
                        if (styleSortMode && styleDragIndex !== null && styleDragType === "size" && styleDragIndex !== index) {
                          e.preventDefault();
                          moveStyle(styleDragIndex, index, "size");
                          setStyleDragIndex(index);
                        }
                      }}
                      onDragEnd={() => { setStyleDragIndex(null); setStyleDragType(null); }}
                      className={`flex items-center justify-between p-2 rounded-lg border-[2px] border-gray-200 ${styleSortMode ? "cursor-grab active:cursor-grabbing" : ""}`}
                    >
                      <div className="flex items-center gap-2">
                        {styleSortMode && <GripVertical className="h-4 w-4 text-gray-400" />}
                        <span className="text-sm font-bold">{s}</span>
                      </div>
                      <button
                        onClick={() => removeStyle(s, "size")}
                        className="flex h-6 w-6 items-center justify-center rounded-md border-[2px] border-gray-300 text-red-400 hover:bg-red-50 hover:border-red-400"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* 不含尺码 */}
              <div>
                <p className="text-xs font-extrabold text-gray-500 mb-1">不含尺码分类</p>
                <div className="space-y-1">
                  {styleNoSizeDraft.map((s, index) => (
                    <div
                      key={s}
                      draggable={styleSortMode}
                      onDragStart={() => { styleSortMode && setStyleDragIndex(index); setStyleDragType("nosize"); }}
                      onDragOver={(e) => {
                        if (styleSortMode && styleDragIndex !== null && styleDragType === "nosize" && styleDragIndex !== index) {
                          e.preventDefault();
                          moveStyle(styleDragIndex, index, "nosize");
                          setStyleDragIndex(index);
                        }
                      }}
                      onDragEnd={() => { setStyleDragIndex(null); setStyleDragType(null); }}
                      className={`flex items-center justify-between p-2 rounded-lg border-[2px] border-gray-200 ${styleSortMode ? "cursor-grab active:cursor-grabbing" : ""}`}
                    >
                      <div className="flex items-center gap-2">
                        {styleSortMode && <GripVertical className="h-4 w-4 text-gray-400" />}
                        <span className="text-sm font-bold">{s}</span>
                      </div>
                      <button
                        onClick={() => removeStyle(s, "nosize")}
                        className="flex h-6 w-6 items-center justify-center rounded-md border-[2px] border-gray-300 text-red-400 hover:bg-red-50 hover:border-red-400"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 保存修改按钮 */}
            <div className="mt-4 pt-3 border-t-[2px] border-gray-200">
              <button
                onClick={saveStyles}
                disabled={!styleHasChanges}
                className={`w-full py-2.5 text-sm font-extrabold rounded-xl border-[3px] border-gray-900 transition-all ${
                  styleHasChanges
                    ? "bg-[#4CD964] text-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[3px] active:translate-y-[3px]"
                    : "bg-gray-200 text-gray-400 cursor-not-allowed"
                }`}
              >
                {styleHasChanges ? "保存修改" : "已保存"}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Import Dialog */}
      {showImportDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-[90%] max-w-lg max-h-[85vh] bg-white rounded-2xl border-[3px] border-gray-900 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] p-6 flex flex-col"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-extrabold">批量导入</h2>
              <button
                onClick={() => { setShowImportDialog(false); setImportResult(null); }}
                className="flex h-8 w-8 items-center justify-center rounded-lg border-[2px] border-gray-900 hover:bg-gray-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {/* 下载模板 */}
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-gray-500">
                  支持 CSV 格式批量导入。必填: 售卖编号, 厂家名称, 进价。
                </p>
                <button
                  onClick={downloadTemplate}
                  className="flex items-center gap-1.5 text-xs font-bold text-[#4A90E2] hover:underline"
                >
                  <Upload className="h-3.5 w-3.5" />
                  下载模板
                </button>
              </div>

              {/* 列映射 */}
              <div className="mb-4 p-3 rounded-xl border-[2px] border-gray-200 bg-gray-50">
                <p className="text-xs font-extrabold text-gray-500 mb-2">列映射（CSV表头 → 系统字段）</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {Object.entries(importMapping).map(([field, csvHeader]) => (
                    <div key={field} className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold text-gray-500 w-16 shrink-0">{field.replace("_", " ")}:</span>
                      <Input
                        value={csvHeader}
                        onChange={(e) =>
                          setImportMapping((prev) => ({ ...prev, [field]: e.target.value }))
                        }
                        className="text-[10px] h-6 flex-1"
                        placeholder={field}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {!importing && !importResult && (
                <div
                  onClick={() => importFileRef.current?.click()}
                  className="h-[120px] rounded-xl border-[3px] border-dashed border-gray-400 bg-gray-50 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-gray-900 hover:bg-gray-100 transition-all mb-4"
                >
                  <Upload className="h-8 w-8 text-gray-400" />
                  <span className="text-xs font-bold text-gray-400">点击选择 CSV 文件</span>
                  <input
                    ref={importFileRef}
                    type="file"
                    accept=".csv"
                    onChange={handleImportFile}
                    className="hidden"
                  />
                </div>
              )}

              {importing && (
                <div className="flex flex-col items-center gap-3 py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
                  <span className="text-sm font-bold text-gray-500">正在导入中...</span>
                </div>
              )}

              {importResult && (
                <div className="mb-4 space-y-2">
                  <div className="flex gap-4">
                    <div className="flex-1 rounded-xl border-[2px] border-green-500 bg-green-50 p-3 text-center">
                      <p className="text-2xl font-extrabold text-green-600">{importResult.success}</p>
                      <p className="text-xs font-bold text-green-500">成功</p>
                    </div>
                    <div className="flex-1 rounded-xl border-[2px] border-red-500 bg-red-50 p-3 text-center">
                      <p className="text-2xl font-extrabold text-red-600">{importResult.fail}</p>
                      <p className="text-xs font-bold text-red-500">失败</p>
                    </div>
                  </div>
                  {importResult.errors.length > 0 && (
                    <div className="max-h-[120px] overflow-y-auto rounded-lg border-[2px] border-gray-200 p-2">
                      {importResult.errors.map((err, i) => (
                        <p key={i} className="text-[10px] text-red-500">{err}</p>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => setImportResult(null)}
                    className="w-full py-2 text-sm font-bold rounded-xl border-[2px] border-gray-900 bg-gray-100 hover:bg-gray-200"
                  >
                    继续导入
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    {/* Transfer Dialog */}
      {showTransferDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-[90%] max-w-md max-h-[80vh] bg-white rounded-2xl border-[3px] border-gray-900 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] p-6 flex flex-col"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-extrabold">货物搬运</h2>
              <button
                onClick={() => setShowTransferDialog(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border-[2px] border-gray-900 hover:bg-gray-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-gray-500 mb-3">
              将 <span className="font-extrabold text-gray-900">{transferFromShelf}</span> 排的所有商品搬运到目标货架
            </p>

            {/* 当前货架商品列表 */}
            <div className="mb-3">
              <p className="text-xs font-extrabold text-gray-500 mb-1">当前货架商品:</p>
              <div className="max-h-[120px] overflow-y-auto space-y-1">
                {Object.entries(shelfProducts).filter(([sn]) => sn.startsWith(transferFromShelf)).map(([sn, products]) => (
                  products.length > 0 && (
                    <div key={sn} className="text-[10px] text-gray-600 p-1.5 rounded border-[1px] border-gray-200">
                      <span className="font-bold">{sn}</span>: {products.map((p) => `${p.name}(${p.count}件)`).join(", ")}
                    </div>
                  )
                ))}
                {Object.values(shelfProducts).flat().length === 0 && (
                  <p className="text-[10px] text-gray-400">该排没有商品</p>
                )}
              </div>
            </div>

            {/* 目标货架 */}
            <div className="mb-4">
              <p className="text-xs font-extrabold text-gray-500 mb-1">目标货架:</p>
              <select
                value={transferToShelf}
                onChange={(e) => setTransferToShelf(e.target.value)}
                className="neo-input w-full text-sm"
              >
                <option value="">请选择目标货架</option>
                {Object.entries(shelfData).map(([key, positions]) => (
                  positions.map((pos) => (
                    DEFAULT_LAYERS.map((layer) => {
                      const sn = `${key}-${pos}-${layer}`;
                      return (
                        <option key={sn} value={sn} disabled={sn.startsWith(transferFromShelf)}>
                          {sn} ({key}货架第{layer}层)
                        </option>
                      );
                    })
                  ))
                ))}
              </select>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setShowTransferDialog(false)}
                className="flex-1 py-2 text-sm font-bold rounded-xl border-[2px] border-gray-900 bg-gray-100 hover:bg-gray-200"
              >
                取消
              </button>
              <button
                onClick={handleTransferShelf}
                disabled={!transferToShelf || transferring}
                className="flex-1 py-2 text-sm font-bold text-white rounded-xl border-[3px] border-gray-900 bg-[#4A90E2] shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[3px] active:translate-y-[3px] transition-all disabled:opacity-50"
              >
                {transferring ? "搬运中..." : "确认搬运"}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </PageWrapper>
  );
}