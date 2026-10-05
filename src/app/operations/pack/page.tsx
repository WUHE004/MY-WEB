"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Camera, Search, Package, CheckCircle, PauseCircle, Truck, Trash2, ChevronDown, X, Pencil } from "lucide-react";
import Link from "next/link";
import { PageWrapper, showToast } from "@/components/page-wrapper";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { BarcodeScanner } from "@/components/barcode-scanner";

interface SalesRecord {
  id: number;
  sale_id: string;
  photo: string;
  product_name: string;
  size: number;
  quantity: number;
  sell_price: number;
  shelf_no: string;
  order_time: string;
  manufacturer: string;
  tracking_number?: string;
}

interface PackRecord {
  id: number;
  tracking_number: string;
  status: string;
  submitter: string;
  packer: string;
  created_at: string;
  items: PackItem[];
}

interface PackItem {
  id: number;
  sale_id: string;
  photo: string;
  product_name: string;
  size: number;
  quantity: number;
  sell_price: number;
  shelf_no: string;
  order_time: string;
  manufacturer: string;
}

// 货架数据(与入库登记共用 shelf_data 设置, 默认值一致)
const DEFAULT_SHELF_DATA: Record<string, number[]> = {
  A: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  B: [1, 2],
  C: [1, 2, 3, 4, 5],
};

const DEFAULT_LAYERS = [1, 2, 3, 4, 5];

// 总表商品卡片尺码列表(与管理栏总表一致)
const CARD_SIZES = [80, 90, 95, 100, 105, 110, 120, 130, 140, 150, 160, 170, 180];

// 总表同款商品卡片的数据结构(来自 /api/product-card, 聚合口径与 /api/summary 一致)
interface SummaryCardRow {
  sale_id: string;
  name?: string;
  photo?: string;
  inbound_total: number;
  sold_total: number;
  pdd_sold?: number;
  return_total: number;
  remaining: number;
  cost_price: number;
  sell_price: number;
  shelf_no?: string;
  manufacturer?: string;
  inbound_date?: string;
  last_order_time?: string;
  inventory_value: number;
  [key: string]: unknown;
}

const fmtMoney = (n: number) => `¥${(Number(n) || 0).toFixed(2)}`;
const fmtPct = (r: number) => `${((Number(r) || 0) * 100).toFixed(1)}%`;
const fmtCardDate = (d?: string) => {
  if (!d) return "-";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "-";
  return `${dt.getFullYear()}/${String(dt.getMonth() + 1).padStart(2, "0")}/${String(dt.getDate()).padStart(2, "0")}`;
};

// 总表同款商品卡片(布局与管理栏"总表"移动端商品卡片一致)
function ProductSummaryCard({ row, onImageClick }: { row: SummaryCardRow; onImageClick: (src: string) => void }) {
  const returnRate = row.sold_total > 0 ? row.return_total / row.sold_total : 0;
  const profitRate = row.sell_price > 0 ? (row.sell_price - row.cost_price) / row.sell_price : 0;
  const pddQty = Number(row.pdd_sold) || 0;
  const dyQty = Math.max(0, row.sold_total - pddQty);
  return (
    <div className="relative bg-white rounded-xl border-[3px] border-gray-900 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] p-2.5">
      <div className="flex gap-2.5">
        {/* 图片区域 */}
        <div className="w-[50%] aspect-[4/5] rounded-lg border-2 border-gray-200 overflow-hidden bg-gray-100 shrink-0">
          {row.photo ? (
            <img src={row.photo} alt="" loading="lazy" className="w-full h-full object-cover cursor-pointer" onClick={() => onImageClick(row.photo!)} />
          ) : (
            <div className="w-full h-full flex items-center justify-center"><Package className="h-16 w-16 text-gray-300" /></div>
          )}
        </div>
        {/* 右侧规范化格子区 */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex items-start justify-between gap-1">
            <div className="min-w-0">
              <div className="text-2xl leading-none font-extrabold text-gray-900 truncate">{row.sale_id}</div>
              {row.name && <div className="text-sm text-gray-500 truncate mt-1">{row.name}</div>}
            </div>
            {row.sold_total > 0 ? (
              <div className="flex flex-col items-end gap-0.5 shrink-0">
                <span className="rounded-md border-2 border-gray-900 bg-[#FF6B7A] px-1.5 py-0.5 text-[10px] leading-none font-extrabold text-white">多多{pddQty}</span>
                <span className="rounded-md border-2 border-gray-900 bg-[#4CD964] px-1.5 py-0.5 text-[10px] leading-none font-extrabold text-white">抖音{dyQty}</span>
              </div>
            ) : null}
          </div>
          <div className="mt-1 rounded-lg border-2 border-gray-200 overflow-hidden text-xs divide-y-2 divide-gray-200">
            <div className="flex divide-x-2 divide-gray-200">
              <div className="w-[40%] flex items-center justify-between gap-0.5 px-1 py-1 min-w-0">
                <span className="text-gray-500 shrink-0 text-[13px] font-bold">售出</span>
                <span className="font-extrabold text-[13px] text-green-600 truncate">{row.sold_total}</span>
              </div>
              <div className="flex-1 flex items-center justify-between gap-0.5 px-1 py-1 min-w-0">
                <span className="text-gray-500 shrink-0 text-[13px] font-bold">利润率</span>
                <span className={`font-extrabold text-[13px] truncate ${profitRate >= 0 ? "text-green-600" : "text-red-500"}`}>{fmtPct(profitRate)}</span>
              </div>
            </div>
            <div className="flex divide-x-2 divide-gray-200">
              <div className="w-[40%] flex items-center justify-between gap-0.5 px-1 py-1 min-w-0">
                <span className="text-gray-500 shrink-0 text-[13px] font-bold">退货</span>
                <span className="font-extrabold text-[13px] text-yellow-600 truncate">{row.return_total}</span>
              </div>
              <div className="flex-1 flex items-center justify-between gap-0.5 px-1 py-1 min-w-0">
                <span className="text-gray-500 shrink-0 text-[13px] font-bold">退货率</span>
                <span className="font-extrabold text-[13px] text-yellow-600 truncate">{fmtPct(returnRate)}</span>
              </div>
            </div>
            <div className="flex bg-gray-100">
              <div className="w-full flex items-center justify-between gap-1 px-1.5 py-1 min-w-0">
                <span className="text-gray-500 shrink-0">进价</span>
                <span className="font-bold text-gray-700 truncate">{fmtMoney(row.cost_price)}</span>
              </div>
            </div>
            <div className="flex bg-gray-100">
              <div className="w-full flex items-center justify-between gap-1 px-1.5 py-1 min-w-0">
                <span className="text-red-500 shrink-0">售价</span>
                <span className="font-extrabold text-red-500 truncate">{fmtMoney(row.sell_price)}</span>
              </div>
            </div>
            <div className="flex">
              <div className="w-full flex items-center justify-between gap-1 px-1.5 py-1 min-w-0">
                <span className="text-gray-500 shrink-0">入库时间</span>
                <span className="font-medium text-gray-700 truncate">{fmtCardDate(row.inbound_date)}</span>
              </div>
            </div>
            <div className="flex">
              <div className="w-full flex items-center justify-between gap-1 px-1.5 py-1 min-w-0">
                <span className="text-gray-500 shrink-0">售出时间</span>
                <span className="font-medium text-gray-700 truncate">{fmtCardDate(row.last_order_time)}</span>
              </div>
            </div>
            <div className="flex bg-gray-100">
              <div className="w-full flex items-center justify-between gap-1 px-1.5 py-1 min-w-0">
                <span className="text-gray-500 shrink-0">货架号</span>
                <span className="font-medium text-gray-700 truncate">{row.shelf_no || "-"}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 尺码全宽5列换行显示 */}
      <div className="mt-1.5 grid grid-cols-5 gap-1">
        {CARD_SIZES.map((s) => {
          const val = Number(row[`size_${s}`]) || 0;
          return (
            <span key={s} className={`text-[10px] px-1 py-1 rounded border font-bold text-center whitespace-nowrap ${
              val < 0 ? "bg-red-50 border-red-300 text-red-600" :
              val > 0 ? "bg-gray-100 border-gray-300 text-gray-700" :
              "bg-white border-gray-200 text-gray-300"
            }`}>{s}:{val}</span>
          );
        })}
      </div>

      {/* 入库/剩余/价值 均匀排开 */}
      <div className="flex justify-between items-center text-[10px] pt-1.5 mt-1.5 border-t border-gray-200">
        <div>
          <span className="text-gray-400">入库 </span>
          <span className="font-extrabold text-blue-600">{row.inbound_total}</span>
        </div>
        <div>
          <span className="text-gray-400">剩余 </span>
          <span className="font-extrabold text-gray-900">{row.remaining}</span>
        </div>
        <div>
          <span className="text-gray-400">厂家 </span>
          <span className="font-extrabold text-gray-700 truncate">{row.manufacturer || "-"}</span>
        </div>
        <div>
          <span className="text-gray-400">价值 </span>
          <span className="font-extrabold text-red-500">{fmtMoney(row.inventory_value)}</span>
        </div>
      </div>
    </div>
  );
}

// 解析货架号为三级(排/货架号/层)
// 历史格式背景: 2026年6~8月线上版本入库登记产生"排-货架号--层"双横线格式(如B-1--1, 层是正数),
// 9月起入库登记及表格导入为"排-货架号-层"标准格式(如B-1-1), 另有导入缺排横线格式(如A5-1)
const parseShelfNo = (s: string): { l1: string; l2: string; l3: string } => {
  const t = (s || "").trim();
  if (!t) return { l1: "", l2: "", l3: "" };
  // 双横线格式: 排-货架号--层 (必须先于单横线匹配, "--"是分隔符残留而非负数层)
  let m = t.match(/^([^-]+)-(\d+)--(\d+)$/);
  if (m) return { l1: m[1].toUpperCase(), l2: m[2], l3: m[3] };
  // 标准单横线: 排-货架号-层
  m = t.match(/^([^-]+)-(\d+)-(\d+)$/);
  if (m) return { l1: m[1].toUpperCase(), l2: m[2], l3: m[3] };
  // 导入缺排横线: 排货架号-层 (如 A5-1)
  m = t.match(/^([A-Za-z\u4e00-\u9fff]+)(\d+)-(\d+)$/);
  if (m) return { l1: m[1].toUpperCase(), l2: m[2], l3: m[3] };
  return { l1: "", l2: "", l3: "" };
};

type TabMode = "find" | "pack";
type PackFilter = "" | "suspended" | "found" | "shipped";

export default function PackPage() {
  const [activeTab, setActiveTab] = useState<TabMode>("find");

  const [trackingNumber, setTrackingNumber] = useState("");
  const [searchResults, setSearchResults] = useState<SalesRecord[]>([]);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [notFound, setNotFound] = useState(false);
  // 找齐/挂起提交锁: 请求未返回前禁止重复提交, 防止同面单号生成多份记录
  const [submittingFind, setSubmittingFind] = useState(false);
  // 发货/找齐/挂起操作防连点 + 发货二次确认(发货不可逆)
  const [busyActionIds, setBusyActionIds] = useState<Set<number>>(new Set());
  const [confirmShipId, setConfirmShipId] = useState<number | null>(null);
  // 找齐动画: 面单回缩成文件夹向右飞出, 结束后清理状态
  const [flyOut, setFlyOut] = useState(false);

  const [packRecords, setPackRecords] = useState<PackRecord[]>([]);
  const [packFilter, setPackFilter] = useState<PackFilter>("");

  const [showScanner, setShowScanner] = useState(false);
  // 清空全部历史二次确认
  const [pendingClearAll, setPendingClearAll] = useState(false);
  // 后六位匹配到多个面单号时的候选列表
  const [matchedTrackingNumbers, setMatchedTrackingNumbers] = useState<string[]>([]);

  // 打包模式: 面单查找(查已提交的记录) + 扫码模式区分
  const [packTrackingNumber, setPackTrackingNumber] = useState("");
  const [scannerMode, setScannerMode] = useState<"find" | "pack">("find");
  // 打包模式: 展开的文件夹合集
  const [expandedPackId, setExpandedPackId] = useState<number | null>(null);
  // 找货模式: 货架号编辑(卡片索引) - 三级货架选择(排/货架号/层, 与入库登记同步)
  const [editingShelfIdx, setEditingShelfIdx] = useState<number | null>(null);
  const [shelfData, setShelfData] = useState<Record<string, number[]>>(DEFAULT_SHELF_DATA);
  const [editShelfL1, setEditShelfL1] = useState("");
  const [editShelfL2, setEditShelfL2] = useState("");
  const [editShelfL3, setEditShelfL3] = useState("");

  useEffect(() => { fetchPackRecords(); }, []);

  // ---------- 编号搜商品弹窗(总表同款卡片) ----------
  const [showProductSearch, setShowProductSearch] = useState(false);
  const [productQuery, setProductQuery] = useState("");
  const [productRows, setProductRows] = useState<SummaryCardRow[]>([]);
  const [productSearching, setProductSearching] = useState(false);
  const [productSearched, setProductSearched] = useState(false);
  const [imgPreview, setImgPreview] = useState<string | null>(null);
  const productTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doProductSearch = useCallback(async (q: string) => {
    const code = q.trim();
    if (!code) { setProductRows([]); setProductSearched(false); return; }
    setProductSearching(true);
    try {
      const res = await fetch(`/api/product-card?sale_id=${encodeURIComponent(code)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "查询失败");
      setProductRows(data.rows || []);
    } catch {
      showToast("查询失败, 请稍后再试", "error");
      setProductRows([]);
    } finally {
      setProductSearched(true);
      setProductSearching(false);
    }
  }, []);

  // 输入防抖 400ms 自动查询; 回车立即查询
  const handleProductQueryChange = (v: string) => {
    setProductQuery(v);
    if (productTimer.current) clearTimeout(productTimer.current);
    productTimer.current = setTimeout(() => doProductSearch(v), 400);
  };
  const handleProductQueryEnter = () => {
    if (productTimer.current) clearTimeout(productTimer.current);
    doProductSearch(productQuery);
  };

  const openProductSearch = () => {
    setProductQuery("");
    setProductRows([]);
    setProductSearched(false);
    setImgPreview(null);
    setShowProductSearch(true);
  };

  // 加载货架设置(与入库登记共用 shelf_data, 入库登记新增货架后此处同步)
  const loadShelfData = useCallback(() => {
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.shelf_data && typeof data.shelf_data === "object") {
          setShelfData(data.shelf_data as Record<string, number[]>);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => { loadShelfData(); }, [loadShelfData]);

  const doSearch = useCallback(async (query: string) => {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setSearched(false);
    setNotFound(false);
    setSearchResults([]);
    setMatchedTrackingNumbers([]);
    try {
      const res = await fetch(`/api/sales-records?tracking_number=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        setSearchResults(data);
        setSearched(true);
        // 短输入(≤6位)后缀匹配: 唯一命中时自动补全完整面单号
        if (q.length <= 6) {
          const distinct = Array.from(new Set(data.map((d: SalesRecord) => (d.tracking_number || "").trim()).filter(Boolean)));
          if (distinct.length === 1) {
            setTrackingNumber(distinct[0]);
          } else if (distinct.length > 1) {
            setMatchedTrackingNumbers(distinct);
          }
        }
      }
      else { setNotFound(true); setSearched(true); }
    } catch { setNotFound(true); setSearched(true); }
    finally { setSearching(false); }
  }, []);

  // 扫码识别成功: 按模式分发(找货=查售卖记录并搜索, 打包=填入已提交记录查找框)
  const handleScanResult = useCallback((code: string) => {
    if (scannerMode === "pack") {
      setPackTrackingNumber(code);
      setShowScanner(false);
    } else {
      setTrackingNumber(code);
      setShowScanner(false);
      setTimeout(() => doSearch(code), 200);
    }
  }, [doSearch, scannerMode]);

  const fetchPackRecords = async () => {
    try {
      const res = await fetch("/api/pack");
      const data = await res.json();
      if (Array.isArray(data)) setPackRecords(data);
    } catch (err) { console.error(err); }
  };

  const handleSearch = () => doSearch(trackingNumber);

  const handleSubmitFind = async (status: "found" | "suspended") => {
    if (submittingFind) return; // 提交中忽略重复点击
    setSubmittingFind(true);
    const submitter = localStorage.getItem("member_name") || "未知";
    try {
      const res = await fetch("/api/pack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tracking_number: trackingNumber.trim(), status, submitter,
          items: searchResults.map((item) => ({
            sale_id: item.sale_id, photo: item.photo, product_name: item.product_name,
            size: item.size, quantity: item.quantity, sell_price: item.sell_price,
            shelf_no: item.shelf_no, order_time: item.order_time, manufacturer: item.manufacturer,
          })),
        }),
      });
      if (res.ok) {
        if (status === "found") {
          // 找齐: 无弹窗, 面单回缩成文件夹向右飞出后清理
          setFlyOut(true);
          window.setTimeout(() => {
            setFlyOut(false);
            setSearchResults([]); setSearched(false); setTrackingNumber("");
            fetchPackRecords();
          }, 950);
        } else {
          showToast("已挂起", "success");
          setSearchResults([]); setSearched(false); setTrackingNumber(""); fetchPackRecords();
        }
      } else { const err = await res.json(); showToast("操作失败: " + (err.error || "未知错误"), "error"); }
    } catch { showToast("网络错误，请重试", "error"); }
    finally { setSubmittingFind(false); }
  };

  const handlePackAction = async (recordId: number, status: string) => {
    if (busyActionIds.has(recordId)) return; // 防连点: 上一操作未完成前忽略
    setBusyActionIds((prev) => new Set(prev).add(recordId));
    const packer = localStorage.getItem("member_name") || "未知";
    try {
      const res = await fetch("/api/pack", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: recordId, status, packer: status === "shipped" ? packer : undefined }),
      });
      if (res.ok) { fetchPackRecords(); }
      else { const err = await res.json(); showToast("操作失败: " + (err.error || "未知错误"), "error"); }
    } catch { showToast("网络错误，请重试", "error"); }
    finally {
      setBusyActionIds((prev) => {
        const next = new Set(prev);
        next.delete(recordId);
        return next;
      });
    }
  };

  // 清空全部历史
  const handleClearAll = () => {
    if (packRecords.length === 0) { showToast("没有可清除的记录", "error"); return; }
    setPendingClearAll(true);
  };

  const performClearAll = async () => {
    setPendingClearAll(false);
    try {
      const res = await fetch("/api/pack?all=true", { method: "DELETE" });
      if (res.ok) { setPackRecords([]); setPackFilter(""); showToast("已清空全部找货打包记录", "success"); }
      else { const err = await res.json(); showToast("清空失败: " + (err.error || "未知错误"), "error"); }
    } catch { showToast("网络错误，请重试", "error"); }
  };

  const statusLabel = (s: string) => {
    switch (s) {
      case "found": return { text: "已找齐", color: "bg-green-100 text-green-700 border-green-400" };
      case "suspended": return { text: "已挂起", color: "bg-yellow-100 text-yellow-700 border-yellow-400" };
      case "shipped": return { text: "已发货", color: "bg-blue-100 text-blue-700 border-blue-400" };
      default: return { text: "找货中", color: "bg-gray-100 text-gray-600 border-gray-300" };
    }
  };

  // 找货卡片: 保存货架号(写入 inbound_records, 同步本地所有同编号卡片)
  const handleShelfSave = async (saleId: string, shelfNo: string) => {
    if (!saleId) return;
    try {
      const res = await fetch("/api/inbound-records", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sale_id: saleId, shelf_no: shelfNo }),
      });
      if (!res.ok) {
        const err = await res.json();
        showToast("货架号保存失败: " + (err.error || "未知错误"), "error");
        return;
      }
      setSearchResults((prev) => prev.map((r) => (r.sale_id === saleId ? { ...r, shelf_no: shelfNo } : r)));
      setEditingShelfIdx(null);
    } catch { showToast("网络错误，请重试", "error"); }
  };

  // 打包模式: 状态筛选 + 面单号查找(已提交记录, 支持完整精确/后六位后缀匹配, 本地过滤)
  const packSearchQ = packTrackingNumber.trim();

  // 找货模式: 该面单下商品总价(售价×数量合计)
  const trackingTotalPrice = useMemo(
    () => searchResults.reduce((sum, r) => sum + (Number(r.sell_price) || 0) * (Number(r.quantity) || 0), 0),
    [searchResults]
  );
  const visiblePackRecords = useMemo(() => {
    const base = packFilter ? packRecords.filter((r) => r.status === packFilter) : packRecords;
    if (!packSearchQ) return base;
    return base.filter((r) => r.tracking_number === packSearchQ || (r.tracking_number || "").endsWith(packSearchQ));
  }, [packRecords, packFilter, packSearchQ]);

  const filteredPackRecords = visiblePackRecords;
  const filterCounts = {
    suspended: packRecords.filter((r) => r.status === "suspended").length,
    found: packRecords.filter((r) => r.status === "found").length,
    shipped: packRecords.filter((r) => r.status === "shipped").length,
  };

  const filterBtnDefs: { key: PackFilter; label: string; icon: React.ReactNode; activeClass: string }[] = [
    { key: "suspended", label: "已挂起", icon: <PauseCircle className="h-3 w-3" />, activeClass: "bg-[#FFC93C] text-gray-900" },
    { key: "found", label: "已找齐", icon: <CheckCircle className="h-3 w-3" />, activeClass: "bg-[#4CD964] text-white" },
    { key: "shipped", label: "已发货", icon: <Truck className="h-3 w-3" />, activeClass: "bg-[#4A90E2] text-white" },
  ];

  return (
    <PageWrapper>
      {/* Header + Tabs (mobile: side by side) */}
      <div className="flex items-center gap-2 sm:gap-3 lg:gap-4 mb-4 sm:mb-6">
        <Link
          href="/links"
          className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl border-[3px] border-gray-900 bg-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] transition-all shrink-0"
        >
          <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
        </Link>
        <h1 className="text-xl sm:text-2xl lg:text-4xl font-extrabold text-gray-900">
          <span className="highlight-yellow">打包找货</span>
        </h1>
        {/* Tabs inline */}
        <div className="flex gap-1.5 sm:gap-2 ml-1">
          <button
            onClick={() => setActiveTab("find")}
            className={`flex items-center gap-1 px-3 py-1.5 sm:px-5 sm:py-2 rounded-lg sm:rounded-xl border-[2px] sm:border-[3px] border-gray-900 font-extrabold text-xs sm:text-sm transition-all ${
              activeTab === "find" ? "bg-[#4A90E2] text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]" : "bg-white text-gray-700 hover:bg-gray-100"
            }`}
          >
            <Package className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span>找货</span>
          </button>
          <button
            onClick={() => setActiveTab("pack")}
            className={`flex items-center gap-1 px-3 py-1.5 sm:px-5 sm:py-2 rounded-lg sm:rounded-xl border-[2px] sm:border-[3px] border-gray-900 font-extrabold text-xs sm:text-sm transition-all ${
              activeTab === "pack" ? "bg-[#FFC93C] text-gray-900 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]" : "bg-white text-gray-700 hover:bg-gray-100"
            }`}
          >
            <Truck className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span>打包</span>
          </button>
        </div>
      </div>

      {/* ===== 找货模式 ===== */}
      {activeTab === "find" && (
        <div>
          {/* 固定顶部: 面单输入框 + 相机/查找按钮 + 副标题, 仅下方商品卡片滚动 */}
          <div className="sticky top-0 z-30 -mx-4 sm:-mx-6 lg:-mx-8 xl:-mx-10 -mt-2 sm:-mt-3 lg:-mt-4 px-4 sm:px-6 lg:px-8 xl:px-10 pt-1 pb-2 mb-4 sm:mb-6 bg-white">
            <div>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    value={trackingNumber}
                    onChange={(e) => { setTrackingNumber(e.target.value); setMatchedTrackingNumbers([]); }}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    placeholder="面单号 / 后六位"
                    className="neo-input w-full text-sm pl-10"
                  />
                </div>
                <button
                  type="button" onClick={() => { setScannerMode("find"); setShowScanner(true); }}
                  className="flex items-center justify-center h-[42px] w-[42px] rounded-xl border-[3px] border-gray-900 bg-[#4A90E2] text-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:translate-y-[2px] transition-all shrink-0"
                  title="扫码识别面单号"
                >
                  <Camera className="h-4 w-4" />
                </button>
                <button
                  onClick={handleSearch} disabled={searching || !trackingNumber.trim()}
                  className="flex items-center justify-center h-[42px] px-4 rounded-xl border-[3px] border-gray-900 bg-[#FFC93C] text-gray-900 font-extrabold text-sm shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:translate-y-[2px] transition-all shrink-0"
                >
                  {searching ? "搜索中..." : "查找"}
                </button>
              </div>
            </div>
            {/* 副标题: 总价 + 商品数量(保持字体大小和标红) */}
            {searchResults.length > 0 && (
              <div className="flex items-baseline gap-2 flex-wrap mt-3">
                <span className="text-lg sm:text-xl font-extrabold text-red-500">
                  总价 ¥{Number(trackingTotalPrice.toFixed(2))} · 共{searchResults.length}件
                </span>
                <span className="text-xs sm:text-sm font-bold text-gray-500">
                  · 面单号: {trackingNumber}
                </span>
              </div>
            )}
          </div>

          {searched && notFound && (
            <div className="p-4 sm:p-6 rounded-xl border-[3px] border-red-400 bg-red-50 text-center">
              <p className="text-sm font-extrabold text-red-600">未找到面单号 "{trackingNumber}" 对应的售卖记录</p>
            </div>
          )}

          {/* 后六位匹配到多个面单号: 点击选择具体面单 */}
          {matchedTrackingNumbers.length > 1 && (
            <div className="mb-4 p-3 sm:p-4 rounded-xl border-[3px] border-yellow-400 bg-yellow-50">
              <p className="text-xs sm:text-sm font-extrabold text-yellow-700 mb-2">
                后六位匹配到 {matchedTrackingNumbers.length} 个面单号，请点击选择：
              </p>
              <div className="flex flex-wrap gap-2">
                {matchedTrackingNumbers.map((tn) => (
                  <button
                    key={tn}
                    onClick={() => { setTrackingNumber(tn); doSearch(tn); }}
                    className="px-3 py-1.5 rounded-lg border-[2px] border-gray-900 bg-white text-xs font-extrabold text-gray-900 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:translate-y-[1px] transition-all"
                  >
                    {tn}
                  </button>
                ))}
              </div>
            </div>
          )}

          {searchResults.length > 0 && (
            <div className={flyOut ? "pack-fly-out" : ""}>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-4 sm:mb-6">
                {searchResults.map((item, index) => (
                  <div key={index} className="bg-white rounded-xl border-[3px] border-gray-900 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] overflow-hidden">
                    <div className="aspect-square bg-gray-100 flex items-center justify-center overflow-hidden">
                      {item.photo ? <img src={item.photo} alt="" className="w-full h-full object-cover" /> : <Package className="h-12 w-12 text-gray-300" />}
                    </div>
                    <div className="p-3 sm:p-4">
                      <div className="text-xs sm:text-sm font-extrabold text-gray-900 mb-1 truncate">{item.sale_id}</div>
                      <div className="text-xs text-gray-500 mb-2 truncate">{item.product_name || "商品名称"}</div>
                      {/* 找货三要素: 数量(1件红/≥2件绿)/尺码/货架号 突出显示 */}
                      <div className="grid grid-cols-3 gap-1.5 sm:gap-2 mb-2">
                        <div className={`rounded-lg border-2 border-gray-900 px-1 py-1.5 text-center ${Number(item.quantity) >= 2 ? "bg-[#4CD964]" : "bg-[#FF6B7A]"}`}>
                          <div className="text-[9px] font-bold text-white/90 leading-none mb-0.5">数量</div>
                          <div className="text-lg sm:text-xl font-extrabold text-white leading-tight">{item.quantity}</div>
                        </div>
                        <div className="rounded-lg border-2 border-gray-900 bg-[#FFC93C] px-1 py-1.5 text-center">
                          <div className="text-[9px] font-bold text-gray-700 leading-none mb-0.5">尺码</div>
                          <div className="text-lg sm:text-xl font-extrabold text-gray-900 leading-tight">{item.size}</div>
                        </div>
                        <div
                          onClick={() => {
                            setEditingShelfIdx(editingShelfIdx === index ? null : index);
                            // 每次打开时刷新货架数据, 确保与入库登记同步
                            loadShelfData();
                            // 解析已有货架号回填三级选择(兼容 A-3-1 / A-7--4 等格式)
                            const p = parseShelfNo(item.shelf_no || "");
                            setEditShelfL1(p.l1);
                            setEditShelfL2(p.l2);
                            setEditShelfL3(p.l3);
                          }}
                          className="relative rounded-lg border-2 border-gray-900 bg-[#4CD964] px-1 py-1.5 text-center cursor-pointer active:scale-95 transition-transform"
                          title="点击修改货架号"
                        >
                          <div className="text-[9px] font-bold text-white/90 leading-none mb-0.5">货架号<Pencil className="inline h-2 w-2 ml-0.5" /></div>
                          <div className="text-base sm:text-lg font-extrabold text-white leading-tight truncate">{item.shelf_no || "点击添加"}</div>
                        </div>
                      </div>
                      {/* 货架号编辑栏: 三级选择(与入库登记同款, 不用 neo-input 避免文字被裁剪) */}
                      {editingShelfIdx === index && (
                        <div className="mb-2">
                          <div className="flex gap-1.5">
                            <select
                              value={editShelfL1}
                              onChange={(e) => { setEditShelfL1(e.target.value); setEditShelfL2(""); setEditShelfL3(""); }}
                              className="flex-1 min-w-0 h-9 px-1.5 text-xs font-bold bg-white border-[2px] border-gray-900 rounded-lg outline-none"
                            >
                              <option value="">一排</option>
                              {(() => {
                                const keys = Object.keys(shelfData);
                                // 解析出的排不在货架库时追加显示, 保证能识别现有值
                                const opts = editShelfL1 && !keys.includes(editShelfL1) ? [...keys, editShelfL1] : keys;
                                return opts.map((k) => (
                                  <option key={k} value={k}>{k}</option>
                                ));
                              })()}
                            </select>
                            <select
                              value={editShelfL2}
                              onChange={(e) => { setEditShelfL2(e.target.value); setEditShelfL3(""); }}
                              disabled={!editShelfL1}
                              className="flex-1 min-w-0 h-9 px-1.5 text-xs font-bold bg-white border-[2px] border-gray-900 rounded-lg outline-none disabled:opacity-40"
                            >
                              <option value="">货架号</option>
                              {(() => {
                                const nums = (shelfData[editShelfL1] || []).map(String);
                                // 解析出的货架号不在货架库时追加显示, 保证能识别现有值
                                const opts = editShelfL2 && !nums.includes(editShelfL2) ? [...nums, editShelfL2] : nums;
                                return opts.map((n) => (
                                  <option key={n} value={n}>{n}</option>
                                ));
                              })()}
                            </select>
                            <select
                              value={editShelfL3}
                              onChange={(e) => setEditShelfL3(e.target.value)}
                              disabled={!editShelfL2}
                              className="flex-1 min-w-0 h-9 px-1.5 text-xs font-bold bg-white border-[2px] border-gray-900 rounded-lg outline-none disabled:opacity-40"
                            >
                              <option value="">层</option>
                              {DEFAULT_LAYERS.map((n) => (
                                <option key={n} value={String(n)}>{n}</option>
                              ))}
                            </select>
                          </div>
                          <div className="flex gap-1.5 mt-1.5">
                            <button
                              onClick={() => handleShelfSave(item.sale_id, `${editShelfL1}-${editShelfL2}-${editShelfL3}`)}
                              disabled={!editShelfL1 || !editShelfL2 || !editShelfL3}
                              className="h-9 px-3 rounded-lg border-2 border-gray-900 bg-[#4CD964] text-white text-xs font-extrabold shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-[1px] active:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                            >
                              保存
                            </button>
                            <button
                              onClick={() => setEditingShelfIdx(null)}
                              className="h-9 px-3 rounded-lg border-2 border-gray-900 bg-white text-gray-600 text-xs font-extrabold shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-[1px] active:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] shrink-0"
                            >
                              取消
                            </button>
                          </div>
                        </div>
                      )}
                      {/* 次要信息弱化显示 */}
                      <div className="text-xs space-y-0.5">
                        <div className="truncate"><span className="text-gray-400">售价:</span> <span className="font-extrabold text-red-500">¥{item.sell_price}</span><span className="text-gray-300 mx-1">·</span><span className="text-gray-400">厂家:</span> <span className="font-medium">{item.manufacturer || "-"}</span></div>
                        <div className="text-gray-400">{item.order_time ? new Date(item.order_time).toLocaleString("zh-CN") : "-"}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-3 sm:gap-4">
                <button onClick={() => handleSubmitFind("found")} disabled={submittingFind || flyOut || matchedTrackingNumbers.length > 1} className="flex items-center justify-center gap-1.5 flex-1 py-2.5 sm:py-3 rounded-xl border-[3px] border-gray-900 bg-[#4CD964] text-white font-extrabold text-xs sm:text-sm shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:translate-y-[2px] transition-all disabled:opacity-50 disabled:hover:shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] disabled:hover:translate-y-0 disabled:cursor-not-allowed">
                  <CheckCircle className="h-4 w-4" /><span>货已找齐</span>
                </button>
                <button onClick={() => handleSubmitFind("suspended")} disabled={submittingFind || flyOut || matchedTrackingNumbers.length > 1} className="flex items-center justify-center gap-1.5 flex-1 py-2.5 sm:py-3 rounded-xl border-[3px] border-gray-900 bg-[#FFC93C] text-gray-900 font-extrabold text-xs sm:text-sm shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:translate-y-[2px] transition-all disabled:opacity-50 disabled:hover:shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] disabled:hover:translate-y-0 disabled:cursor-not-allowed">
                  <PauseCircle className="h-4 w-4" /><span>挂起</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== 打包模式 ===== */}
      {activeTab === "pack" && (
        <div>
          {/* 固定顶部: 面单查找框 + 筛选按钮, 仅面单文件夹列表滚动 */}
          <div className="sticky top-0 z-30 -mx-4 sm:-mx-6 lg:-mx-8 xl:-mx-10 -mt-2 sm:-mt-3 lg:-mt-4 px-4 sm:px-6 lg:px-8 xl:px-10 pt-1 pb-2 mb-3 sm:mb-4 bg-white">
            {/* 面单查找框（与找货同款, 查已提交记录） */}
            <div>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    value={packTrackingNumber}
                    onChange={(e) => { setPackTrackingNumber(e.target.value); setExpandedPackId(null); }}
                    placeholder="面单号 / 后六位（查已提交记录）"
                    className="neo-input w-full text-sm pl-10 pr-9"
                  />
                  {packTrackingNumber && (
                    <button
                      onClick={() => setPackTrackingNumber("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded-full bg-gray-200 text-gray-500 hover:bg-gray-300"
                      title="清空"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
                <button
                  type="button" onClick={() => { setScannerMode("pack"); setShowScanner(true); }}
                  className="flex items-center justify-center h-[42px] w-[42px] rounded-xl border-[3px] border-gray-900 bg-[#4A90E2] text-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:translate-y-[2px] transition-all shrink-0"
                  title="扫码识别面单号"
                >
                  <Camera className="h-4 w-4" />
                </button>
                <button
                  onClick={() => { fetchPackRecords(); setExpandedPackId(null); }}
                  className="flex items-center justify-center h-[42px] px-4 rounded-xl border-[3px] border-gray-900 bg-[#FFC93C] text-gray-900 font-extrabold text-sm shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:translate-y-[2px] transition-all shrink-0"
                >
                  查找
                </button>
              </div>
            </div>

            {/* 筛选按钮 + 清空 */}
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mt-3">
              {filterBtnDefs.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setPackFilter(packFilter === f.key ? "" : f.key)}
                  className={`flex items-center gap-1 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg border-[2px] border-gray-900 text-xs font-extrabold transition-all ${
                    packFilter === f.key ? f.activeClass + " shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]" : "bg-white text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  {f.icon}<span>{f.label}</span>
                  <span className="ml-0.5 opacity-70">({filterCounts[f.key as keyof typeof filterCounts]})</span>
                </button>
              ))}
              <button
                onClick={handleClearAll}
                className="flex items-center gap-1 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg border-[2px] border-red-400 bg-red-50 text-red-600 text-xs font-extrabold hover:bg-red-100 transition-all ml-auto"
              >
                <Trash2 className="h-3 w-3" />
                <span>清空</span>
              </button>
            </div>
          </div>

          {filteredPackRecords.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Package className="h-12 w-12 mx-auto mb-3" />
              {packSearchQ ? (
                <>
                  <p className="text-sm font-bold">未找到面单 "{packSearchQ}" 的提交记录</p>
                  <p className="text-xs">可尝试输入完整面单号或后六位</p>
                </>
              ) : (
                <>
                  <p className="text-sm font-bold">暂无记录</p>
                  <p className="text-xs">去「找货」模式搜索面单号并提交</p>
                </>
              )}
            </div>
          ) : (
            /* 按面单号文件夹合集展示: 点击展开该面单下所有商品 */
            filteredPackRecords.map((record) => {
              const st = statusLabel(record.status);
              const expanded = expandedPackId === record.id;
              const firstPhoto = record.items && record.items.length > 0 ? record.items[0].photo : "";
              // 该面单下商品总价(售价×数量合计)
              const recordTotalPrice = (record.items || []).reduce(
                (s, it) => s + (Number(it.sell_price) || 0) * (Number(it.quantity) || 0), 0
              );
              return (
                <div key={record.id} className="relative mb-3 sm:mb-4 bg-white rounded-xl border-[3px] border-gray-900 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] overflow-hidden">
                  {/* 该面单下商品数量: 红色角标置于文件夹右上角 */}
                  <div className="absolute top-0 right-0 z-10 bg-[#FF6B7A] border-l-[3px] border-b-[3px] border-gray-900 rounded-bl-xl px-2 py-0.5 text-[11px] sm:text-xs font-extrabold text-white leading-relaxed">
                    {(record.items || []).reduce((s, it) => s + (Number(it.quantity) || 0), 0)}件
                  </div>
                  {/* 文件夹头部: 缩略图 + 面单信息 + 状态 + 操作按钮, 点击主体展开/收起 */}
                  <div className="p-3 sm:p-4 bg-gray-50 border-b-2 border-gray-200">
                    <div
                      className="flex items-center gap-3 cursor-pointer pt-1"
                      onClick={() => setExpandedPackId(expanded ? null : record.id)}
                    >
                      {/* 第一个商品照片缩略图 */}
                      <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-lg border-2 border-gray-900 bg-gray-100 overflow-hidden shrink-0 flex items-center justify-center">
                        {firstPhoto ? <img src={firstPhoto} alt="" className="w-full h-full object-cover" /> : <Package className="h-6 w-6 text-gray-300" />}
                      </div>
                      <div className="flex-1 min-w-0 pr-6 sm:pr-8">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-extrabold text-gray-900 truncate">{record.tracking_number}</span>
                          <span className={`px-2 py-0.5 rounded-lg border-2 text-[10px] font-extrabold shrink-0 ${st.color}`}>{st.text}</span>
                          {/* 商品总价: 状态标志后标红显示 */}
                          <span className="text-xs sm:text-sm font-extrabold text-red-500 shrink-0">
                            ¥{Number(recordTotalPrice.toFixed(2))}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5 truncate">
                          {record.submitter} · {new Date(record.created_at).toLocaleString("zh-CN")}
                        </div>
                      </div>
                      <ChevronDown className={`h-4 w-4 text-gray-400 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />
                    </div>
                    {/* 操作按钮(独立于展开点击区) */}
                    {record.status !== "shipped" && (
                      <div className="flex gap-2 mt-2.5">
                        {(record.status === "pending" || record.status === "suspended") && (
                          <button onClick={() => handlePackAction(record.id, "found")} disabled={busyActionIds.has(record.id)} className="flex items-center justify-center gap-1 flex-1 py-2 sm:py-2.5 rounded-xl border-[3px] border-gray-900 bg-[#4CD964] text-white font-extrabold text-xs sm:text-sm shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:translate-y-[1px] transition-all disabled:opacity-50">
                            <CheckCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4" /><span>找齐</span>
                          </button>
                        )}
                        {record.status === "found" && (
                          <button onClick={() => handlePackAction(record.id, "suspended")} disabled={busyActionIds.has(record.id)} className="flex items-center justify-center gap-1 flex-1 py-2 sm:py-2.5 rounded-xl border-[3px] border-gray-900 bg-[#FFC93C] text-gray-900 font-extrabold text-xs sm:text-sm shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:translate-y-[1px] transition-all disabled:opacity-50">
                            <PauseCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4" /><span>挂起</span>
                          </button>
                        )}
                        <button onClick={() => setConfirmShipId(record.id)} disabled={busyActionIds.has(record.id)} className="flex items-center justify-center gap-1 flex-1 py-2 sm:py-2.5 rounded-xl border-[3px] border-gray-900 bg-[#4A90E2] text-white font-extrabold text-xs sm:text-sm shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:translate-y-[1px] transition-all disabled:opacity-50">
                          <Truck className="h-3.5 w-3.5 sm:h-4 sm:w-4" /><span>发货</span>
                        </button>
                      </div>
                    )}
                  </div>
                  {/* 展开内容: 该面单下所有商品(缩小显示, 一行2个, 卡片区独立上下滚动) — 高度展开动画 + 商品交错飞入 */}
                  <AnimatePresence initial={false}>
                  {expanded && (
                    <motion.div
                      key="pack-items"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.22, ease: "easeOut" }}
                      className="overflow-hidden"
                    >
                      <div className="p-3 sm:p-4">
                        <div className="grid grid-cols-2 gap-2 sm:gap-3 max-h-[65vh] overflow-y-auto">
                          {record.items.map((item, idx) => (
                            <motion.div
                              key={idx}
                              initial={{ opacity: 0, y: 14 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.25, delay: Math.min(idx * 0.05, 0.4) }}
                              className="bg-gray-50 rounded-xl border-2 border-gray-200 overflow-hidden"
                            >
                            <div className="aspect-[4/3] bg-gray-100 flex items-center justify-center overflow-hidden">
                              {item.photo ? <img src={item.photo} alt="" className="w-full h-full object-cover" /> : <Package className="h-8 w-8 text-gray-300" />}
                            </div>
                            <div className="p-1.5 sm:p-2">
                              <div className="text-[11px] sm:text-xs font-extrabold text-gray-900 truncate">{item.sale_id}</div>
                              {/* 数量(1件红/≥2件绿)/尺码 突出显示(货架号移至底部厂家栏小字) */}
                              <div className="grid grid-cols-2 gap-1.5 mt-1 mb-1">
                                <div className={`rounded-lg border-2 border-gray-900 px-1 py-1 text-center ${Number(item.quantity) >= 2 ? "bg-[#4CD964]" : "bg-[#FF6B7A]"}`}>
                                  <div className="text-[9px] font-bold text-white/90 leading-none mb-0.5">数量</div>
                                  <div className="text-base sm:text-lg font-extrabold text-white leading-tight">{item.quantity}</div>
                                </div>
                                <div className="rounded-lg border-2 border-gray-900 bg-[#FFC93C] px-1 py-1 text-center">
                                  <div className="text-[9px] font-bold text-gray-700 leading-none mb-0.5">尺码</div>
                                  <div className="text-base sm:text-lg font-extrabold text-gray-900 leading-tight">{item.size}</div>
                                </div>
                              </div>
                              <div className="text-[10px] sm:text-xs text-gray-400 truncate">
                                ¥{item.sell_price} · {item.manufacturer || "-"} · {item.shelf_no || "-"}
                              </div>
                            </div>
                            </motion.div>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}
                  </AnimatePresence>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* 扫码弹窗 */}
      <BarcodeScanner
        open={showScanner}
        onClose={() => setShowScanner(false)}
        onResult={handleScanResult}
        title="扫描面单号条形码"
        hint="将面单号条形码对准扫描框，识别成功自动搜索"
      />

      {/* 清空全部历史二次确认 */}
      <ConfirmDialog
        open={pendingClearAll}
        title="清空所有找货打包记录？"
        description="将删除全部记录（含历史对账数据），此操作不可恢复。"
        confirmText="确认清空"
        onConfirm={performClearAll}
        onCancel={() => setPendingClearAll(false)}
      />

      {/* 发货二次确认(发货状态不可逆) */}
      <ConfirmDialog
        open={confirmShipId !== null}
        title="确认发货？"
        description="发货后记录不可再改回找货中，请确认包裹已全部找齐并交予快递。"
        confirmText="确认发货"
        onCancel={() => setConfirmShipId(null)}
        onConfirm={() => {
          const id = confirmShipId;
          setConfirmShipId(null);
          if (id !== null) handlePackAction(id, "shipped");
        }}
      />

      {/* 编号搜商品悬浮按钮(右下角, 避开手机底部导航) */}
      <button
        onClick={openProductSearch}
        className={`fixed right-4 bottom-[4.5rem] md:bottom-6 z-40 flex h-12 w-12 items-center justify-center rounded-2xl border-[3px] border-gray-900 bg-[#4A90E2] text-white shadow-[3px_3px_0px_0px_rgba(0,0,0,0.12)] hover:-translate-y-0.5 transition-all ${showProductSearch ? "opacity-0 pointer-events-none" : "opacity-100"}`}
        title="按商品编号查询总表卡片"
      >
        <Search className="h-5 w-5" />
      </button>

      {/* 编号搜商品弹窗: 顶部搜索输入框 + 下方结果区(仅结果区滚动) */}
      {showProductSearch && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowProductSearch(false)} />
          <div className="relative bg-gray-50 w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border-[3px] border-gray-900 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col max-h-[85vh] sm:max-h-[80vh] overflow-hidden">
            {/* 顶部: 搜索输入框 */}
            <div className="p-3 bg-white border-b-2 border-gray-200 shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                <input
                  autoFocus
                  value={productQuery}
                  onChange={(e) => handleProductQueryChange(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleProductQueryEnter(); }}
                  placeholder="输入商品编号查询，如 F236"
                  className="w-full h-11 pl-9 pr-9 rounded-xl border-[2px] border-gray-900 text-sm font-bold text-gray-900 placeholder:text-gray-400 outline-none focus:border-[#4A90E2] transition-colors"
                />
                {productQuery && (
                  <button
                    onClick={() => { setProductQuery(""); setProductRows([]); setProductSearched(false); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded-full bg-gray-200 text-gray-500 hover:bg-gray-300"
                    title="清空"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>

            {/* 下方: 结果区(独立滚动) */}
            <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
              {productSearching ? (
                <div className="py-12 text-center text-gray-400 text-sm font-bold">查询中...</div>
              ) : !productSearched ? (
                <div className="py-12 text-center text-gray-400 text-sm font-bold">
                  <Package className="h-10 w-10 mx-auto mb-3 text-gray-300" />
                  输入商品编号后，这里会显示管理栏总表中对应的同款商品卡片
                </div>
              ) : productRows.length === 0 ? (
                <div className="py-12 text-center text-gray-400 text-sm font-bold">未找到商品编号 &quot;{productQuery}&quot;</div>
              ) : (
                productRows.map((row) => (
                  <ProductSummaryCard key={row.sale_id} row={row} onImageClick={setImgPreview} />
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 图片全屏预览 */}
      {imgPreview && (
        <div className="fixed inset-0 z-[80] bg-black/80 flex items-center justify-center p-6 cursor-pointer" onClick={() => setImgPreview(null)}>
          <img src={imgPreview} alt="" className="max-w-full max-h-full rounded-xl border-[3px] border-gray-900" />
        </div>
      )}
    </PageWrapper>
  );
}