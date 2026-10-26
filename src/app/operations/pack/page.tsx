"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Camera, Search, Package, CheckCircle, PauseCircle, Truck, ChevronDown, ChevronRight, X, Pencil, Shirt, Ruler, Clock } from "lucide-react";
import Link from "next/link";
import { PageWrapper, showToast } from "@/components/page-wrapper";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { BarcodeScanner } from "@/components/barcode-scanner";
import { RemarkRowsDialog, SIZE_OPTIONS, userNotesOnly } from "@/components/remark-quick-fill";

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
  notes?: string;
}

// 售出/退货明细弹窗行(与管理栏明细弹窗同源接口字段)
interface DetailRecord {
  id: number;
  sale_id: string;
  size: number;
  quantity: number;
  sell_price?: number;
  tracking_number?: string;
  return_price?: number;
  return_time?: string;
  order_time?: string;
  created_at?: string;
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

// 备注解析: "S对应尺码120裤长61建议身高110" → [{ tag:"S", size:"120", pants:"61", height:"110" }], 显示为 "S/120:裤长61:建议110"
// 兼容无裤长/无建议身高的旧行、无字母标记格式 "90裤长30建议身高110" → 显示为 "90:裤长30:建议110",
// 以及旧身高按钮独立行 "100建议身高90" → [{ tag:"", size:"100", pants:"", height:"90" }], 显示为 "100:建议90"
function parseNoteEntries(notes: string): { tag: string; size: string; pants: string; height: string }[] {
  const out: { tag: string; size: string; pants: string; height: string }[] = [];
  const re = /(?:([0-9A-Z]+)对应尺码(\d+)(?:裤长(\d+))?(?:建议身高(\d+))?|(\d+)裤长(\d+)(?:建议身高(\d+))?|(\d+)建议身高(\d+))/g;
  const src = String(notes || "");
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m[1]) out.push({ tag: m[1], size: m[2], pants: m[3] || "", height: m[4] || "" });
    else if (m[5]) out.push({ tag: "", size: m[5], pants: m[6], height: m[7] || "" });
    else out.push({ tag: "", size: m[8], pants: "", height: m[9] });
  }
  return out;
}
const fmtNoteEntry = (e: { tag: string; size: string; pants: string; height?: string }) => {
  const label = e.tag ? `${e.tag}/${e.size}` : e.size;
  let s = e.pants ? `${label}:裤长${e.pants}` : label;
  if (e.height) s += `:建议${e.height}`;
  return s;
};

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

// 票根齿口半线: 18×8矩形虚线整线横切的一半(高4px), 2px黑内描边;
// 左右端为四分之一块(9px, 仅内侧竖边+横边描边), 中间13块在整个空档内均分
function PerfHalfLine({ part, fill }: { part: "top" | "bottom"; fill: string }) {
  const hEdge = part === "top" ? "border-t-2" : "border-b-2";
  const st = { backgroundColor: fill, borderColor: "#111827" };
  return (
    <div aria-hidden className="flex items-stretch w-full h-[4px]">
      <div className={`shrink-0 w-[9px] ${hEdge} border-r-2`} style={st} />
      <div className="flex-1 flex justify-evenly min-w-0">
        {Array.from({ length: 13 }, (_, i) => (
          <div key={i} className={`shrink-0 w-[18px] ${hEdge} border-x-2`} style={st} />
        ))}
      </div>
      <div className={`shrink-0 w-[9px] ${hEdge} border-l-2`} style={st} />
    </div>
  );
}

// 总表同款商品卡片(布局与管理栏"总表"移动端商品卡片一致, 含待裁线+备注条目展开)
// needsBySize: 本次导入找货需求(该商品在最新导入批次中的尺码需求/已找/剩余), 卡片下方显示
// onShowDetail: 售出/退货数字点击回调, 弹出与管理栏总表同款的明细列表
function ProductSummaryCard({ row, onImageClick, needsBySize, onShowDetail }: {
  row: SummaryCardRow;
  onImageClick: (src: string) => void;
  needsBySize?: { sizes: Record<string, number>; total: number; packed: number; remaining: number };
  onShowDetail?: (type: "sales" | "returns", saleId: string) => void;
}) {
  const returnRate = row.sold_total > 0 ? row.return_total / row.sold_total : 0;
  const profitRate = row.sell_price > 0 ? (row.sell_price - row.cost_price) / row.sell_price : 0;
  const pddQty = Number(row.pdd_sold) || 0;
  const dyQty = Math.max(0, row.sold_total - pddQty);
  // 备注展开状态(与管理栏总表一致: 有备注默认展开, 点击切换)
  const [notesToggled, setNotesToggled] = useState<boolean | null>(null);
  const notes = String(row.notes || "");
  const hasNotes = !!notes.trim();
  const noteEntries = hasNotes ? parseNoteEntries(notes) : [];
  const notesExpanded = notesToggled ?? hasNotes;
  const toggleNotes = () => setNotesToggled(!notesExpanded);
  const fill = hasNotes ? "#EF4444" : "#E5E7EB";
  return (
    <div className="relative">
      {/* 上半张: 图片/信息/尺码 + 待裁齿口(撕口以上) */}
      <div className="relative bg-white p-2.5 border-[3px] border-b-0 rounded-t-xl border-gray-900 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
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
              <div
                className={`w-[40%] flex items-center justify-between gap-0.5 px-1 py-1 min-w-0 ${row.sold_total > 0 && onShowDetail ? "cursor-pointer" : ""}`}
                onClick={() => row.sold_total > 0 && onShowDetail?.("sales", row.sale_id)}
                title={row.sold_total > 0 && onShowDetail ? "点击查看售卖明细" : undefined}
              >
                <span className="text-gray-500 shrink-0 text-[13px] font-bold">售出</span>
                <span className="font-extrabold text-[13px] text-green-600 truncate">{row.sold_total}</span>
              </div>
              <div className="flex-1 flex items-center justify-between gap-0.5 px-1 py-1 min-w-0">
                <span className="text-gray-500 shrink-0 text-[13px] font-bold">利润率</span>
                <span className={`font-extrabold text-[13px] truncate ${profitRate >= 0 ? "text-green-600" : "text-red-500"}`}>{fmtPct(profitRate)}</span>
              </div>
            </div>
            <div className="flex divide-x-2 divide-gray-200">
              <div
                className={`w-[40%] flex items-center justify-between gap-0.5 px-1 py-1 min-w-0 ${row.return_total > 0 && onShowDetail ? "cursor-pointer" : ""}`}
                onClick={() => row.return_total > 0 && onShowDetail?.("returns", row.sale_id)}
                title={row.return_total > 0 && onShowDetail ? "点击查看退货明细" : undefined}
              >
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

      {/* 尺码全宽5列换行显示(点击展开/收起备注, 对齐管理栏总表) */}
      <div className="mt-1.5 grid grid-cols-5 gap-1 cursor-pointer" onClick={toggleNotes}>
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

      {/* 上半虚线(齿口横切上半)绑定上半张下端; 左右端延伸盖过边框与投影, 贴齐卡片最外围 */}
      <div aria-hidden className="absolute bottom-0 left-[-3px] right-[-6px]"><PerfHalfLine part="top" fill={fill} /></div>
      </div>{/* /上半张 */}

      {/* 备注带: 展开缺口直接填齿口同色(有备注红/无备注灰), 右端拉长3px对齐投影最右侧 */}
      <div className={`mr-[-3px] grid transition-[grid-template-rows] duration-300 ease-out ${notesExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="overflow-hidden">
          <div className="relative" style={{ backgroundColor: fill }}>
            {noteEntries.length > 0 ? (
              /* 有备注: 条目式圆角矩形(S/90:裤长80), 一排最多3条, 多的换行 */
              <button
                type="button"
                onClick={toggleNotes}
                className="relative z-10 grid w-full grid-cols-3 gap-1.5 px-3 py-2 border-0 cursor-pointer bg-transparent"
              >
                {noteEntries.map((e, i) => (
                  <span key={i} className="rounded-md border-2 border-white px-0.5 py-0.5 text-[10px] leading-tight font-extrabold text-white text-center truncate" title={fmtNoteEntry(e)}>
                    {fmtNoteEntry(e)}
                  </span>
                ))}
              </button>
            ) : (
              <button
                type="button"
                onClick={toggleNotes}
                className={`relative z-10 block w-full text-left px-4 py-2.5 text-xs leading-relaxed whitespace-pre-wrap break-words border-0 cursor-pointer bg-transparent ${hasNotes ? "text-white" : "text-gray-500"}`}
              >
                {hasNotes ? notes : "暂无备注"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 下半张(撕口以下): 入库/剩余/厂家/价值 均匀排开 */}
      <div className="relative bg-white px-2.5 py-2 border-[3px] border-t-0 rounded-b-xl shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
        {!notesExpanded && (
          <button
            type="button"
            aria-label="展开备注"
            onClick={toggleNotes}
            className="absolute top-0 left-0 right-0 z-20 h-[12px] p-0 border-0 cursor-pointer bg-transparent"
          />
        )}
        {/* 下半虚线(齿口横切下半)绑定下半张上端; 左右端延伸盖过边框与投影, 贴齐卡片最外围 */}
        <div aria-hidden className="absolute top-0 left-[-3px] right-[-6px]"><PerfHalfLine part="bottom" fill={fill} /></div>
        <div className="flex justify-between items-center text-[10px]">
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
      </div>{/* /下半张 */}

      {/* 本次找货需求页脚: 该商品在最新导入批次中的尺码需求 + 已找/剩余件数(随导入与打包提交自动更新) */}
      {needsBySize && needsBySize.total > 0 && (
        <div className="mt-1.5 rounded-lg border-2 border-dashed border-[#4A90E2] bg-blue-50 px-2 py-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-extrabold text-[#4A90E2] shrink-0">本次找货 共{needsBySize.total}件</span>
            <span className={`text-[11px] font-extrabold shrink-0 ${needsBySize.remaining <= 0 ? "text-green-600" : "text-[#4A90E2]"}`}>
              已找{needsBySize.packed}件 · 还剩{needsBySize.remaining}件
            </span>
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {Object.entries(needsBySize.sizes).sort((a, b) => Number(a[0]) - Number(b[0])).map(([s, q]) => (
              <span key={s} className="rounded border-2 border-gray-900 bg-white px-1.5 py-0.5 text-[10px] font-extrabold text-gray-900">{s}码×{q}</span>
            ))}
          </div>
        </div>
      )}
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
  // 后六位匹配到多个面单号时的候选列表
  const [matchedTrackingNumbers, setMatchedTrackingNumbers] = useState<string[]>([]);
  // 打包进度(最新售卖日期的面单提交进度, 便签内进度条)
  const [packProgress, setPackProgress] = useState<{ date: string; total: number; packed: number } | null>(null);
  // packRecords 镜像 ref: doSearch 回调内判断面单是否已提交过(避免闭包旧值)
  const packRecordsRef = useRef<PackRecord[]>([]);
  useEffect(() => { packRecordsRef.current = packRecords; }, [packRecords]);

  // 打包模式: 面单查找(查已提交的记录) + 扫码模式区分
  const [packTrackingNumber, setPackTrackingNumber] = useState("");
  const [scannerMode, setScannerMode] = useState<"find" | "pack">("find");
  // 打包模式: 展开的文件夹合集
  const [expandedPackId, setExpandedPackId] = useState<number | null>(null);
  // 找货模式: 货架号编辑(卡片索引) - 三级货架选择(排/货架号/层, 与入库登记同步)
  const [editingShelfIdx, setEditingShelfIdx] = useState<number | null>(null);
  // 找货模式: 尺码框点击 → 补充备注弹窗(与入库调整-备注调整同款交互: 只补备注, 不改售卖尺码)
  const [notesTarget, setNotesTarget] = useState<{ saleId: string; size: number } | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [notesSaving, setNotesSaving] = useState(false);
  // 该商品全部入库行汇总的已入库尺码(裤长快捷填入自动生成对应行)
  const [sizeStockedList, setSizeStockedList] = useState<string[]>([]);
  const [showSizeHeightDialog, setShowSizeHeightDialog] = useState(false);
  const [showSizePantsDialog, setShowSizePantsDialog] = useState(false);
  const [sizeHeightInserted, setSizeHeightInserted] = useState<string[] | null>(null);
  const [sizePantsInserted, setSizePantsInserted] = useState<string[] | null>(null);
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

  // 下拉建议: 当前找货面单(searchResults)下去重后的商品编号(缩略图+编号+名称), 点选直接查询
  const [showCodeDropdown, setShowCodeDropdown] = useState(false);
  const codeSuggestions = useMemo(() => {
    const map = new Map<string, { sale_id: string; photo: string; name: string }>();
    for (const r of searchResults) {
      const sid = String(r.sale_id || "").toUpperCase().trim();
      if (!sid || map.has(sid)) continue;
      map.set(sid, { sale_id: sid, photo: r.photo || "", name: r.product_name || "" });
    }
    return Array.from(map.values());
  }, [searchResults]);
  const pickCodeSuggestion = (code: string) => {
    if (productTimer.current) clearTimeout(productTimer.current);
    setProductQuery(code);
    setShowCodeDropdown(false);
    doProductSearch(code);
  };

  const openProductSearch = () => {
    setProductQuery("");
    setProductRows([]);
    setProductSearched(false);
    setImgPreview(null);
    // 已在找货界面搜出面单商品时, 打开弹窗默认展开编号下拉
    setShowCodeDropdown(searchResults.length > 0);
    setShowProductSearch(true);
  };

  // ---------- 卡片明细弹窗(售出/退货, 与管理栏总表同款) + 本次找货需求 ----------
  const [detailType, setDetailType] = useState<"sales" | "returns" | null>(null);
  const [detailSaleId, setDetailSaleId] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailRecords, setDetailRecords] = useState<DetailRecord[]>([]);
  const openPackDetail = async (type: "sales" | "returns", saleId: string) => {
    setDetailType(type);
    setDetailSaleId(saleId);
    setDetailLoading(true);
    setDetailRecords([]);
    try {
      const endpoint = type === "sales" ? "/api/sales-records" : "/api/return-records";
      const res = await fetch(`${endpoint}?sale_id=${encodeURIComponent(saleId)}`);
      const d = await res.json();
      setDetailRecords(Array.isArray(d) ? d : []);
    } catch { setDetailRecords([]); } finally { setDetailLoading(false); }
  };

  // 本次找货需求(编号→各尺码件数+总件数+已找+剩余): 数据源 /api/pack-progress(最新登记日期导入的全部记录,
  // 与打包进度条同批次同口径), 弹窗打开时拉取并 10s 轮询(仅页面可见), 新导入记录后自动更新;
  // 独立状态不写 searchResults, 避免覆盖找货视图未提交的货架号编辑
  const [packNeeds, setPackNeeds] = useState<Record<string, { sizes: Record<string, number>; total: number; packed: number; remaining: number }>>({});
  const fetchPackNeeds = useCallback(async () => {
    try {
      const res = await fetch("/api/pack-progress");
      const d = await res.json();
      setPackNeeds(d && d.needs && typeof d.needs === "object" ? d.needs : {});
    } catch { /* 静默失败, 保留上次数据 */ }
  }, []);
  useEffect(() => {
    if (!showProductSearch) return;
    fetchPackNeeds();
    const t = setInterval(() => { if (document.visibilityState === "visible") fetchPackNeeds(); }, 10000);
    return () => clearInterval(t);
  }, [showProductSearch, fetchPackNeeds]);
  // 需求匹配: 售卖记录的编号是基础编号(如002), 总表行可能是多色编号(002/红色), 回退按基础编号匹配
  const needsForCard = (saleId: string) =>
    packNeeds[saleId] || packNeeds[saleId.split("/")[0]];

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

  // 打包进度: 最新登记日期(导入/登记日)非多多面单已提交/总数(多多面单号不参与进度; 10s 轮询仅页面可见时执行 + 切回页面立即刷新, 新售卖记录导入后自动更新; 须在 doSearch 之前定义, 其依赖数组渲染期即读取)
  const fetchPackProgress = useCallback(async () => {
    try {
      const res = await fetch("/api/pack-progress");
      const data = await res.json();
      if (data && typeof data.total === "number") {
        setPackProgress({ date: String(data.date || ""), total: Number(data.total) || 0, packed: Number(data.packed) || 0 });
      }
    } catch { /* 进度获取失败不影响主流程 */ }
  }, []);

  useEffect(() => {
    fetchPackProgress();
    const t = setInterval(() => { if (document.visibilityState === "visible") fetchPackProgress(); }, 10000);
    // 切回本页(手机切应用/浏览器切标签)立即刷新
    const onVisible = () => { if (document.visibilityState === "visible") fetchPackProgress(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVisible); };
  }, [fetchPackProgress]);

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
        const distinct = Array.from(new Set(data.map((d: SalesRecord) => (d.tracking_number || "").trim()).filter(Boolean)));
        // 短输入(≤6位)后缀匹配: 唯一命中时自动补全完整面单号
        if (q.length <= 6) {
          if (distinct.length === 1) {
            setTrackingNumber(distinct[0]);
          } else if (distinct.length > 1) {
            setMatchedTrackingNumbers(distinct);
          }
        }
        // 自动提交货已找齐: 面单唯一且从未提交过时自动标记找齐;
        // 已提交过(找齐/挂起/发货)的不重复提交、不改变原提交日期(服务端 auto 幂等跳过兜底)
        const isAmbiguous = q.length <= 6 && distinct.length > 1;
        const resolvedTn = distinct.length === 1 ? distinct[0] : q;
        const alreadySubmitted = packRecordsRef.current.some((r) => (r.tracking_number || "").trim() === resolvedTn);
        if (!isAmbiguous && !alreadySubmitted) {
          setSubmittingFind(true);
          try {
            const res2 = await fetch("/api/pack", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                tracking_number: resolvedTn, status: "found", auto: true,
                submitter: localStorage.getItem("member_name") || "未知",
                items: data.map((item: SalesRecord) => ({
                  sale_id: item.sale_id, photo: item.photo, product_name: item.product_name,
                  size: item.size, quantity: item.quantity, sell_price: item.sell_price,
                  shelf_no: item.shelf_no, order_time: item.order_time, manufacturer: item.manufacturer,
                })),
              }),
            });
            const result2 = await res2.json().catch(() => ({}));
            if (res2.ok) {
              showToast(result2.skipped ? "该面单已提交过，未重复提交" : "已自动提交货已找齐", "success");
              fetchPackRecords();
              fetchPackProgress();
            } else {
              showToast("自动提交失败: " + (result2.error || "未知错误") + "，可手动点击「货已找齐」", "error");
            }
          } catch { showToast("自动提交失败，可手动点击「货已找齐」", "error"); }
          finally { setSubmittingFind(false); }
        }
      }
      else { setNotFound(true); setSearched(true); }
    } catch { setNotFound(true); setSearched(true); }
    finally { setSearching(false); }
  }, [fetchPackProgress]);

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
            fetchPackRecords(); fetchPackProgress();
          }, 950);
        } else {
          showToast("已挂起", "success");
          setSearchResults([]); setSearched(false); setTrackingNumber(""); fetchPackRecords(); fetchPackProgress();
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
      if (res.ok) { fetchPackRecords(); fetchPackProgress(); }
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

  // 找货卡片: 点击尺码框打开备注补充弹窗(只补备注不改尺码); 同时拉全部入库行汇总已入库尺码(裤长填入自动生成对应行)
  const openNotesDialog = async (saleId: string, size: number, currentNotes?: string) => {
    setNotesTarget({ saleId, size });
    setNotesDraft(userNotesOnly(currentNotes));
    setSizeHeightInserted(null); setSizePantsInserted(null);
    setShowSizeHeightDialog(false); setShowSizePantsDialog(false);
    setSizeStockedList([]);
    try {
      const res = await fetch(`/api/inbound-records?sale_id=${encodeURIComponent(saleId)}`);
      const rows: Record<string, unknown>[] = await res.json();
      if (Array.isArray(rows)) {
        const sums: Record<string, number> = {};
        for (const r of rows) {
          for (const s of SIZE_OPTIONS) sums[s] = (sums[s] || 0) + (Number(r[`size_${s}`]) || 0);
        }
        setSizeStockedList(SIZE_OPTIONS.filter((s) => (sums[s] || 0) > 0).map(String));
      }
    } catch { /* 拉取失败时裤长弹窗从空白行开始 */ }
  };

  // 备注追加行(已有内容时换行追加) / 删除本次填入的行
  const appendSizeNotes = useCallback((lines: string[]) => {
    setNotesDraft((prev) => (prev.trim() ? prev.trimEnd() + "\n" + lines.join("\n") : lines.join("\n")));
  }, []);
  const removeSizeNotesLines = useCallback((lines: string[] | null) => {
    if (!lines || lines.length === 0) return;
    setNotesDraft((prev) => prev.split("\n").filter((l) => !lines.includes(l.trim())).join("\n"));
  }, []);

  // 保存尺码备注: 与备注调整同逻辑 —— 按行 id 更新, 补录行保留「补录入库」标记行+新备注,
  // 原始行只写新备注(整体覆盖会让财务补录视图无法区分补录行)
  const handleNotesSave = async () => {
    if (!notesTarget) return;
    if (!notesDraft.trim()) { showToast("请输入备注内容", "error"); return; }
    setNotesSaving(true);
    try {
      const res0 = await fetch(`/api/inbound-records?sale_id=${encodeURIComponent(notesTarget.saleId)}`);
      if (!res0.ok) throw new Error();
      const rows: { id?: number; notes?: string | null }[] = await res0.json();
      if (!Array.isArray(rows) || rows.length === 0) throw new Error();
      // 第一行的新 notes 用于本地列表展示(售出行的 notes 显示自入库记录)
      const firstMark = String(rows[0]?.notes || "").split("\n").find((l) => l.trim().startsWith("补录入库"));
      const displayNotes = firstMark ? `${firstMark}\n${notesDraft}` : notesDraft;
      for (const row of rows) {
        const mark = String(row.notes || "").split("\n").find((l) => l.trim().startsWith("补录入库"));
        const notes = mark ? `${mark}\n${notesDraft}` : notesDraft;
        const res = await fetch("/api/inbound-records", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(row.id ? { id: row.id, notes } : { sale_id: notesTarget.saleId, notes }),
        });
        if (!res.ok) throw new Error();
      }
      setSearchResults((prev) => prev.map((r) => (r.sale_id === notesTarget.saleId ? { ...r, notes: displayNotes } : r)));
      setNotesTarget(null);
      showToast("备注保存成功", "success");
    } catch { showToast("保存失败，请重试", "error"); }
    finally { setNotesSaving(false); }
  };

  // 打包模式: 状态筛选 + 面单号查找(已提交记录, 支持完整精确/后六位后缀匹配, 本地过滤)
  const packSearchQ = packTrackingNumber.trim();

  // 找货模式: 该面单下商品总价(售价×数量合计)
  const trackingTotalPrice = useMemo(
    () => searchResults.reduce((sum, r) => sum + (Number(r.sell_price) || 0) * (Number(r.quantity) || 0), 0),
    [searchResults]
  );

  // 找货模式: 该面单已提交过的打包记录(完整号或后六位唯一命中)
  // 已提交过的面单不重复自动提交(保留原提交日期), 下方按钮转为对该记录的状态切换
  const tnTrim = trackingNumber.trim();
  const existingPackMatches = tnTrim
    ? packRecords.filter((r) => {
        const t = (r.tracking_number || "").trim();
        return !!t && (t === tnTrim || (tnTrim.length <= 6 && t.endsWith(tnTrim)));
      })
    : [];
  const existingPackRecord = existingPackMatches.length === 1 ? existingPackMatches[0] : null;
  const visiblePackRecords = useMemo(() => {
    const base = packFilter ? packRecords.filter((r) => r.status === packFilter) : packRecords;
    if (!packSearchQ) return base;
    return base.filter((r) => r.tracking_number === packSearchQ || (r.tracking_number || "").endsWith(packSearchQ));
  }, [packRecords, packFilter, packSearchQ]);

  const filteredPackRecords = visiblePackRecords;

  const filterBtnDefs: { key: PackFilter; label: string; icon: React.ReactNode }[] = [
    { key: "suspended", label: "已挂起", icon: <PauseCircle className="h-3 w-3" /> },
    { key: "found", label: "已找齐", icon: <CheckCircle className="h-3 w-3" /> },
    { key: "shipped", label: "已发货", icon: <Truck className="h-3 w-3" /> },
  ];

  // ===== 打包记录按天分组(参考管理栏补录视图文件夹逻辑) =====
  // 北京时间日期(YYYY-MM-DD): 记录按天归档
  const bjDay = (iso: string) => {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return new Date(d.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  };
  const [packShowAll, setPackShowAll] = useState(true);
  const [packFocusDate, setPackFocusDate] = useState<string | null>(null);
  const packDateGroups = useMemo(() => {
    const map = new Map<string, PackRecord[]>();
    for (const r of visiblePackRecords) {
      const d = bjDay(r.created_at);
      if (!d) continue;
      const arr = map.get(d);
      if (arr) arr.push(r); else map.set(d, [r]);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, records]) => ({ date, records }));
  }, [visiblePackRecords]);
  const packToday = bjDay(new Date().toISOString());
  const packFocusGroup = packDateGroups.find((g) => g.date === packFocusDate);
  // 底部固定按钮: 全部日期文件夹 ↔ 单日期面单记录; 切到单日期时聚焦最近打包日期
  const togglePackShowAll = () => {
    const next = !packShowAll;
    setPackShowAll(next);
    setPackFocusDate(next ? null : packDateGroups[0]?.date ?? null);
  };
  // 点击日期文件夹条: 进入该日期的面单记录
  const selectPackDay = (d: string) => {
    setPackFocusDate(d);
    setPackShowAll(false);
  };

  return (
    <PageWrapper>
      {/* 固定顶部: 标题梯形(桌面) + 便签头(找货/打包) + 便签框(统计/搜索), 仅下方内容滚动 */}
      <div className="sticky top-0 z-30 -mx-4 sm:-mx-6 lg:-mx-8 xl:-mx-10 -mt-2 sm:-mt-3 lg:-mt-4 px-4 sm:px-6 lg:px-8 xl:px-10 pt-2 sm:pt-3 lg:pt-4 pb-2 mb-4 sm:mb-6 bg-white">
        <div className="flex flex-wrap items-end gap-2 sm:gap-3 relative">
          {/* 返回按钮: 移动端显示(桌面端收进标题梯形内) */}
          <Link
            href="/links"
            className="lg:hidden flex h-10 w-10 items-center justify-center rounded-xl border-[3px] border-gray-900 bg-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] transition-all shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          {/* 标题梯形: 页签插在便签主体后面(容器 54px, 底部下探被主体顶边框截断), 左上圆角, 填充随当前页签色, 标题字白色 */}
          <div className="hidden lg:block relative h-[54px]">
            <div className={`absolute inset-0 rounded-tl-2xl rounded-tr-2xl border-t-[3px] border-l-[3px] border-r-[3px] border-b-0 border-gray-900 ${activeTab === "find" ? "bg-[#4A90E2]" : "bg-[#FFC93C]"} transition-colors duration-300`} style={{ zIndex: 43, transform: "perspective(90px) rotateX(6deg)", transformOrigin: "bottom left" }} />
            <h1 className="relative z-[44] flex items-center gap-3 h-12 pl-[20px] pr-5 text-2xl font-extrabold translate-y-[2px] text-white">
              <Link href="/links" className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-black/10 transition-colors" title="返回操作台">
                <ArrowLeft className="h-5 w-5" />
              </Link>
              打包找货
            </h1>
          </div>
          {/* 便签头: 倒梯形 tab(上短下长、上边圆角), 固定宽度不随屏幕拉伸, 左右轻微重合, 当前项置顶 */}
          <div className="ml-auto flex items-end lg:pb-[6px] px-3 lg:px-0 lg:pr-4">
            {([
              { v: "find" as TabMode, label: "找货", on: "bg-[#4A90E2] text-white", off: "bg-white text-gray-700" },
              { v: "pack" as TabMode, label: "打包", on: "bg-[#FFC93C] text-gray-900", off: "bg-white text-gray-700" },
            ]).map((t, i) => {
              const on = activeTab === t.v;
              return (
                <button
                  key={t.v}
                  onClick={() => setActiveTab(t.v)}
                  style={{ zIndex: on ? 50 : 40 - i, transform: "perspective(24px) rotateX(6deg)", transformOrigin: "bottom" }}
                  className={`relative w-[88px] lg:w-[110px] ${on ? "h-11 lg:h-12 border-b-0" : "h-10 lg:h-11"} ${i > 0 ? "-ml-2" : ""} flex items-center justify-center rounded-t-2xl border-[3px] border-gray-900 font-extrabold text-base lg:text-lg transition-all duration-300 ease-out ${on ? t.on : t.off}`}
                >
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>
        </div>
        {/* 便签框: 与便签头连成一体的大矩形(填充当前页签色), 统计(找货)/搜索框(相机集成框内右侧) + 无框查找按钮 */}
        <div className={`relative z-10 lg:z-[45] -mt-[3px] lg:-mt-[9px] rounded-2xl border-[3px] border-gray-900 ${activeTab === "find" ? "bg-[#4A90E2]" : "bg-[#FFC93C]"} px-3 py-2 lg:px-5 lg:py-3 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] transition-colors duration-300`}>
          {activeTab === "find" ? (
            <>
              {/* 统计区: 两项(详情=总价·件数 / 面单号), 未扫码时显示 - */}
              <div className="flex items-stretch divide-x divide-white/30">
                <div className="flex-1 min-w-0 px-2 text-center">
                  <p className="text-[10px] lg:text-xs font-bold truncate text-white/80">详情</p>
                  <p className="text-base lg:text-2xl font-extrabold leading-tight truncate text-white">
                    {searchResults.length > 0 ? `¥${Number(trackingTotalPrice.toFixed(2))} · ${searchResults.length}件` : "-"}
                  </p>
                </div>
                <div className="flex-1 min-w-0 px-2 text-center">
                  <p className="text-[10px] lg:text-xs font-bold truncate text-white/80">面单号</p>
                  <p className="text-sm lg:text-lg font-extrabold leading-tight truncate text-white pt-0.5 lg:pt-1" title={trackingNumber.trim() || undefined}>
                    {trackingNumber.trim() || "-"}
                  </p>
                </div>
              </div>
              {/* 搜索行: 面单输入框(相机集成框内右侧) + 无框查找按钮 */}
              <div className="mt-3 lg:mt-4 flex items-center gap-2 lg:gap-3">
                <div className="relative flex-1 min-w-0">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 lg:h-5 lg:w-5 text-gray-400 z-10" />
                  <input
                    type="text"
                    value={trackingNumber}
                    onChange={(e) => { setTrackingNumber(e.target.value); setMatchedTrackingNumbers([]); }}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    placeholder="面单号 / 后六位"
                    className="w-full h-10 lg:h-12 text-sm lg:text-base pl-10 lg:pl-11 pr-11 lg:pr-12 rounded-xl border-[3px] border-gray-900 bg-white font-bold text-gray-800 placeholder-gray-400 focus:outline-none transition-all"
                  />
                  <button
                    type="button" onClick={() => { setScannerMode("find"); setShowScanner(true); }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 z-10 flex h-7 w-7 lg:h-9 lg:w-9 items-center justify-center rounded-lg text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-colors"
                    title="扫码识别面单号"
                  >
                    <Camera className="h-4 w-4 lg:h-5 lg:w-5" />
                  </button>
                </div>
                <button
                  onClick={handleSearch} disabled={searching || !trackingNumber.trim()}
                  className="shrink-0 flex items-center gap-1 px-2 h-9 rounded-lg text-xs lg:text-sm font-extrabold text-white hover:bg-black/10 transition-all whitespace-nowrap disabled:opacity-50"
                >
                  {searching ? "搜索中..." : "查找"}
                </button>
              </div>
              {/* 打包进度条: 最新售卖日期的面单提交进度(便签内, 实时) */}
              {packProgress && packProgress.total > 0 && (
                <div className="mt-2.5 lg:mt-3">
                  <div className="flex items-center justify-between gap-2 text-[10px] lg:text-xs font-bold text-white/85">
                    <span className="truncate">打包进度 ({packProgress.date})</span>
                    <span className="shrink-0 font-extrabold text-white">
                      {packProgress.packed}/{packProgress.total} 单 · {Math.min(100, Math.round((packProgress.packed / packProgress.total) * 100))}%
                    </span>
                  </div>
                  <div className="mt-1 h-2.5 lg:h-3 rounded-full bg-white/30 overflow-hidden">
                    <div className="h-full rounded-full bg-[#FFC93C] transition-all duration-500" style={{ width: `${Math.min(100, Math.round((packProgress.packed / packProgress.total) * 100))}%` }} />
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              {/* 搜索行: 面单查找框(清空+相机集成框内右侧) + 无框查找按钮 */}
              <div className="mt-1 flex items-center gap-2 lg:gap-3">
                <div className="relative flex-1 min-w-0">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 lg:h-5 lg:w-5 text-gray-400 z-10" />
                  <input
                    type="text"
                    value={packTrackingNumber}
                    onChange={(e) => { setPackTrackingNumber(e.target.value); setExpandedPackId(null); }}
                    placeholder="面单号 / 后六位（查已提交记录）"
                    className="w-full h-10 lg:h-12 text-sm lg:text-base pl-10 lg:pl-11 pr-20 rounded-xl border-[3px] border-gray-900 bg-white font-bold text-gray-800 placeholder-gray-400 focus:outline-none transition-all"
                  />
                  {packTrackingNumber && (
                    <button
                      onClick={() => setPackTrackingNumber("")}
                      className="absolute right-12 top-1/2 -translate-y-1/2 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-gray-200 text-gray-500 hover:bg-gray-300"
                      title="清空"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                  <button
                    type="button" onClick={() => { setScannerMode("pack"); setShowScanner(true); }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 z-10 flex h-7 w-7 lg:h-9 lg:w-9 items-center justify-center rounded-lg text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-colors"
                    title="扫码识别面单号"
                  >
                    <Camera className="h-4 w-4 lg:h-5 lg:w-5" />
                  </button>
                </div>
                <button
                  onClick={() => { fetchPackRecords(); setExpandedPackId(null); }}
                  className="shrink-0 flex items-center gap-1 px-2 h-9 rounded-lg text-xs lg:text-sm font-extrabold text-gray-900 hover:bg-black/10 transition-all whitespace-nowrap"
                >
                  查找
                </button>
              </div>
              {/* 筛选行: 无框无底文字按钮(选中=黑色下划线) + 右侧统计 n 单 */}
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 sm:gap-x-4 gap-y-1">
                {filterBtnDefs.map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setPackFilter(packFilter === f.key ? "" : f.key)}
                    className={`flex items-center gap-1 text-[11px] lg:text-xs font-bold transition-all ${
                      packFilter === f.key ? "text-gray-900 underline decoration-2 underline-offset-4" : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    {f.icon}<span>{f.label}</span>
                  </button>
                ))}
                {/* 短进度条: 最新售卖日期的打包提交进度(条内显示 n/m 单) */}
                {packProgress && packProgress.total > 0 && (() => {
                  const pct = Math.min(100, Math.round((packProgress.packed / packProgress.total) * 100));
                  return (
                    <div className="ml-auto shrink-0 relative h-5 w-32 rounded-full overflow-hidden border-2 border-gray-900 bg-white/50">
                      <div className="h-full bg-[#4A90E2] transition-all duration-500" style={{ width: `${pct}%` }} />
                      <span className={`absolute inset-0 flex items-center justify-center text-[10px] font-extrabold ${pct >= 55 ? "text-white" : "text-gray-900"}`}>
                        {packProgress.packed}/{packProgress.total} 单
                      </span>
                    </div>
                  );
                })()}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ===== 找货模式 ===== */}
      {activeTab === "find" && (
        <div>
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
                {searchResults.map((item, index) => {
                  const hasNotes = !!(item.notes && String(item.notes).trim());
                  const noteEntries = hasNotes ? parseNoteEntries(String(item.notes)) : [];
                  // 有裤长备注且条目尺码与商品尺码一致时, 尺码块同时显示备注字母标记(如 90/XL)
                  const sizeTag = noteEntries.find((e) => e.size === String(item.size))?.tag || "";
                  // 同编号同尺码多件: 卡片换底色区分 + 右上角×N角标
                  const qty = Math.max(1, Number(item.quantity) || 1);
                  const isMulti = qty > 1;
                  return (
                  <div key={index} className={`relative rounded-xl border-[3px] border-gray-900 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] overflow-hidden ${isMulti ? "bg-[#FFF4C2]" : "bg-white"}`}>
                    {/* 数量角标: 同面单同编号同尺码≥2件时右上角显示×N */}
                    {isMulti && (
                      <div className="absolute top-0 right-0 z-20 rounded-bl-xl border-b-2 border-l-2 border-gray-900 bg-[#FF6B7A] px-2.5 py-1 text-lg leading-none font-extrabold text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                        ×{qty}
                      </div>
                    )}
                    <div className="relative aspect-square bg-gray-100 flex items-center justify-center overflow-hidden">
                      {item.photo ? <img src={item.photo} alt="" className="w-full h-full object-cover" /> : <Package className="h-12 w-12 text-gray-300" />}
                      {/* 备注: 图片底部白色渐变上叠加红色条目(一排最多3条, 多的换行); 早期自由文本备注直接显示 */}
                      {hasNotes && (
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-white via-white/85 to-transparent pt-8 pb-1.5 px-1.5">
                          {noteEntries.length > 0 ? (
                            <div className="grid grid-cols-3 gap-1">
                              {noteEntries.map((e, i) => (
                                <span key={i} className="rounded-md border-2 border-red-500 bg-white/90 px-1.5 py-1 text-[13px] leading-tight font-extrabold text-red-500 text-center truncate" title={fmtNoteEntry(e)}>
                                  {fmtNoteEntry(e)}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <div className="text-[13px] leading-snug font-extrabold text-red-500 break-words" title={String(item.notes)}>
                              {String(item.notes)}
                            </div>
                          )}
                        </div>
                      )}
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
                        <div
                          onClick={() => {
                            setEditingShelfIdx(null);
                            void openNotesDialog(item.sale_id, Number(item.size), item.notes);
                          }}
                          className="relative rounded-lg border-2 border-gray-900 bg-[#FFC93C] px-1 py-1.5 text-center cursor-pointer active:scale-95 transition-transform"
                          title="点击补充尺码备注"
                        >
                          <div className="text-[9px] font-bold text-gray-700 leading-none mb-0.5">尺码<Pencil className="inline h-2 w-2 ml-0.5" /></div>
                          <div className={`font-extrabold text-gray-900 leading-tight truncate ${sizeTag ? "text-base sm:text-lg" : "text-lg sm:text-xl"}`}>
                            {sizeTag ? `${item.size}/${sizeTag}` : item.size}
                          </div>
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
                  );
                })}
              </div>
              {existingPackRecord && existingPackRecord.status === "shipped" ? (
                /* 已提交且已发货: 无需再操作 */
                <div className="flex-1 py-2.5 sm:py-3 rounded-xl border-[3px] border-gray-200 bg-gray-50 text-center text-xs sm:text-sm font-extrabold text-gray-400">
                  该面单已发货，无需重复提交
                </div>
              ) : existingPackRecord ? (
                /* 已提交过(找齐/挂起): 不重复提交(保留原提交日期), 按钮转为对该记录的状态切换 */
                <div>
                  <div className="flex gap-3 sm:gap-4">
                    {existingPackRecord.status === "suspended" && (
                      <button onClick={() => handlePackAction(existingPackRecord.id, "found")} disabled={busyActionIds.has(existingPackRecord.id)} className="flex items-center justify-center gap-1.5 flex-1 py-2.5 sm:py-3 rounded-xl border-[3px] border-gray-900 bg-[#4CD964] text-white font-extrabold text-xs sm:text-sm shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:translate-y-[2px] transition-all disabled:opacity-50 disabled:hover:shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] disabled:hover:translate-y-0 disabled:cursor-not-allowed">
                        <CheckCircle className="h-4 w-4" /><span>货已找齐</span>
                      </button>
                    )}
                    {existingPackRecord.status === "found" && (
                      <button onClick={() => handlePackAction(existingPackRecord.id, "suspended")} disabled={busyActionIds.has(existingPackRecord.id)} className="flex items-center justify-center gap-1.5 flex-1 py-2.5 sm:py-3 rounded-xl border-[3px] border-gray-900 bg-[#FFC93C] text-gray-900 font-extrabold text-xs sm:text-sm shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:translate-y-[2px] transition-all disabled:opacity-50 disabled:hover:shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] disabled:hover:translate-y-0 disabled:cursor-not-allowed">
                        <PauseCircle className="h-4 w-4" /><span>挂起</span>
                      </button>
                    )}
                  </div>
                  <p className="mt-1.5 text-center text-[10px] sm:text-xs font-bold text-gray-400">
                    该面单已提交过（{statusLabel(existingPackRecord.status).text} · {new Date(existingPackRecord.created_at).toLocaleString("zh-CN")}），不会重复提交
                  </p>
                </div>
              ) : (
                <div className="flex gap-3 sm:gap-4">
                  <button onClick={() => handleSubmitFind("found")} disabled={submittingFind || flyOut || matchedTrackingNumbers.length > 1} className="flex items-center justify-center gap-1.5 flex-1 py-2.5 sm:py-3 rounded-xl border-[3px] border-gray-900 bg-[#4CD964] text-white font-extrabold text-xs sm:text-sm shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:translate-y-[2px] transition-all disabled:opacity-50 disabled:hover:shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] disabled:hover:translate-y-0 disabled:cursor-not-allowed">
                    <CheckCircle className="h-4 w-4" /><span>货已找齐</span>
                  </button>
                  <button onClick={() => handleSubmitFind("suspended")} disabled={submittingFind || flyOut || matchedTrackingNumbers.length > 1} className="flex items-center justify-center gap-1.5 flex-1 py-2.5 sm:py-3 rounded-xl border-[3px] border-gray-900 bg-[#FFC93C] text-gray-900 font-extrabold text-xs sm:text-sm shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:translate-y-[2px] transition-all disabled:opacity-50 disabled:hover:shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] disabled:hover:translate-y-0 disabled:cursor-not-allowed">
                    <PauseCircle className="h-4 w-4" /><span>挂起</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ===== 打包模式 ===== */}
      {activeTab === "pack" && (
        <div>
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
          ) : packShowAll || !packFocusGroup ? (
            /* 全部日期模式: 只显示打包日期文件夹条(不渲染卡片), 点击文件夹条=选择该日期, 进入单日期面单记录 */
            <div className="pb-44 md:pb-24 space-y-2">
              {packDateGroups.map((group) => {
                const dayQty = group.records.reduce((s, r) => s + (r.items || []).reduce((t, it) => t + (Number(it.quantity) || 0), 0), 0);
                return (
                  <button
                    key={group.date}
                    onClick={() => selectPackDay(group.date)}
                    className="w-full flex items-center justify-between px-4 py-3 gap-2 bg-white rounded-xl border-[3px] border-gray-900 shadow-[3px_3px_0px_0px_rgba(0,0,0,0.3)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-base font-extrabold text-gray-900">{group.date}</span>
                      {group.date === packToday && (
                        <span className="shrink-0 rounded-md border-2 border-gray-900 bg-[#FFC93C] px-1.5 py-0.5 text-[10px] leading-none font-extrabold text-gray-900">今天</span>
                      )}
                      <span className="shrink-0 text-xs font-bold text-gray-500">{group.records.length}单</span>
                      <span className="shrink-0 text-xs font-extrabold text-red-500">共{dayQty}件</span>
                    </div>
                    <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
                  </button>
                );
              })}
            </div>
          ) : (
            /* 单日期模式: 直接平铺该日期的全部面单文件夹记录 */
            <div className="pb-44 md:pb-24">
              {packFocusGroup.records.map((record) => {
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
              })}
            </div>
          )}
          {/* 底部固定按钮: 全部日期文件夹 ↔ 当日打包(最近日期); 无白底, 缩短并与右下角悬浮搜索并排 */}
          {packDateGroups.length > 0 && (
            <button
              onClick={togglePackShowAll}
              className="fixed right-[4.5rem] bottom-[calc(80px+env(safe-area-inset-bottom))] md:bottom-6 z-30 flex items-center h-12 gap-1 max-w-[calc(100vw-6rem)] px-4 rounded-xl border-[3px] border-gray-900 bg-[#FFC93C] text-xs font-extrabold text-gray-900 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            >
              <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${packShowAll ? "" : "rotate-180"}`} />
              <span className="truncate">{packShowAll ? `显示当日打包 (${packDateGroups[0].date})` : "显示全部日期"}</span>
            </button>
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

      {/* 尺码备注补充弹窗(与入库调整-备注调整同款: 只补备注, 不改售卖尺码) */}
      {notesTarget && (
        <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setNotesTarget(null)} />
          <div className="relative bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border-[3px] border-gray-900 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-4">
            <div className="flex items-center justify-between mb-1">
              <div className="text-sm font-extrabold text-gray-900">补充备注 · {notesTarget.saleId}</div>
              <button
                onClick={() => setNotesTarget(null)}
                className="h-8 w-8 flex items-center justify-center rounded-lg border-2 border-gray-900 bg-white text-gray-600 shrink-0"
                title="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="text-xs text-gray-400 mb-3">售卖尺码: {notesTarget.size} · 备注写入商品备注(同编号所有入库记录同步)</div>
            <div className="flex items-stretch gap-2 mb-3">
              <textarea
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                placeholder="请输入备注信息..."
                rows={4}
                className="flex-1 text-sm border-2 border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-gray-900 font-bold resize-none"
              />
              {/* 快捷填入按钮: 与备注调整同款; 已填入时变"取消填入"(一键删除本次填入的行) */}
              <div className="flex flex-col justify-center gap-2 shrink-0">
                {sizeHeightInserted ? (
                  <button
                    onClick={() => { removeSizeNotesLines(sizeHeightInserted); setSizeHeightInserted(null); }}
                    className="h-10 px-2.5 flex items-center gap-1 rounded-xl border-[3px] border-gray-900 bg-[#FF6B6B] text-white text-xs font-extrabold shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[3px] active:translate-y-[3px] transition-all whitespace-nowrap"
                    title="删除本次填入的身高备注"
                  >
                    取消填入<X className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <button
                    onClick={() => setShowSizeHeightDialog(true)}
                    className="h-10 w-10 flex items-center justify-center rounded-xl border-[3px] border-gray-900 bg-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[3px] active:translate-y-[3px] transition-all"
                    title="身高批量填入"
                  >
                    <Ruler className="h-5 w-5 text-gray-700" />
                  </button>
                )}
                {sizePantsInserted ? (
                  <button
                    onClick={() => { removeSizeNotesLines(sizePantsInserted); setSizePantsInserted(null); }}
                    className="h-10 px-2.5 flex items-center gap-1 rounded-xl border-[3px] border-gray-900 bg-[#FF6B6B] text-white text-xs font-extrabold shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[3px] active:translate-y-[3px] transition-all whitespace-nowrap"
                    title="删除本次填入的裤长备注"
                  >
                    取消填入<X className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <button
                    onClick={() => setShowSizePantsDialog(true)}
                    className="h-10 w-10 flex items-center justify-center rounded-xl border-[3px] border-gray-900 bg-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[3px] active:translate-y-[3px] transition-all"
                    title="裤长批量填入"
                  >
                    <Shirt className="h-5 w-5 text-gray-700" />
                  </button>
                )}
                <button
                  onClick={() => appendSizeNotes(["待定"])}
                  className="h-10 w-10 flex items-center justify-center rounded-xl border-[3px] border-gray-900 bg-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[3px] active:translate-y-[3px] transition-all"
                  title="备注追加: 待定"
                >
                  <Clock className="h-5 w-5 text-gray-700" />
                </button>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleNotesSave}
                disabled={notesSaving || !notesDraft.trim()}
                className="flex-1 h-10 flex items-center justify-center gap-1.5 rounded-xl border-[3px] border-gray-900 bg-[#4A90E2] text-white font-extrabold text-sm shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[3px] active:translate-y-[3px] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {notesSaving ? "保存中..." : "保存备注"}
              </button>
              <button
                onClick={() => setNotesTarget(null)}
                className="h-10 px-4 rounded-xl border-[3px] border-gray-900 bg-white text-gray-600 font-extrabold text-sm shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[3px] active:translate-y-[3px] transition-all"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 尺码备注-身高/裤长快捷填入悬浮窗 */}
      {showSizeHeightDialog && (
        <RemarkRowsDialog
          title="身高"
          rowLabel="建议身高"
          mode="height"
          onClose={() => setShowSizeHeightDialog(false)}
          onConfirm={(lines) => { appendSizeNotes(lines); setSizeHeightInserted(lines); }}
        />
      )}
      {showSizePantsDialog && (
        <RemarkRowsDialog
          title="裤长"
          rowLabel="对应尺码"
          mode="pants"
          initialSizes={sizeStockedList}
          onClose={() => setShowSizePantsDialog(false)}
          onConfirm={(lines) => { appendSizeNotes(lines); setSizePantsInserted(lines); }}
        />
      )}

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
        className={`fixed right-4 ${activeTab === "pack" && packDateGroups.length > 0 ? "bottom-[calc(80px+env(safe-area-inset-bottom))] md:bottom-6" : "bottom-[4.5rem] md:bottom-6"} z-40 flex h-12 w-12 items-center justify-center rounded-2xl border-[3px] border-gray-900 bg-[#4A90E2] text-white shadow-[3px_3px_0px_0px_rgba(0,0,0,0.12)] hover:-translate-y-0.5 transition-all ${showProductSearch ? "opacity-0 pointer-events-none" : "opacity-100"}`}
        title="按商品编号查询总表卡片"
      >
        <Search className="h-5 w-5" />
      </button>

      {/* 编号搜商品弹窗: 顶部搜索输入框 + 下方结果区(仅结果区滚动) */}
      {showProductSearch && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowProductSearch(false)} />
          <div className="relative bg-gray-50 w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border-[3px] border-gray-900 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col max-h-[85vh] sm:max-h-[80vh] overflow-hidden">
            {/* 顶部: 搜索输入框 + 编号下拉按钮 */}
            <div className="p-3 bg-white border-b-2 border-gray-200 shrink-0">
              <div className="flex gap-2">
                <div className="relative flex-1 min-w-0">
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
                {/* 编号下拉按钮: 集成当前找货面单下的商品编号 */}
                <button
                  onClick={() => setShowCodeDropdown((v) => !v)}
                  disabled={codeSuggestions.length === 0}
                  className={`shrink-0 h-11 w-11 flex items-center justify-center rounded-xl border-[2px] border-gray-900 ${
                    codeSuggestions.length === 0
                      ? "opacity-40 cursor-not-allowed bg-gray-100 text-gray-400"
                      : "bg-white text-gray-700 active:translate-y-0.5"
                  }`}
                  title={codeSuggestions.length > 0 ? "当前面单下的商品编号" : "先在找货界面搜索面单"}
                >
                  <ChevronDown className={`h-5 w-5 transition-transform ${showCodeDropdown ? "rotate-180" : ""}`} />
                </button>
              </div>
              {/* 下拉预览: 缩略图+编号+名称, 点选直接查询 */}
              {showCodeDropdown && codeSuggestions.length > 0 && (
                <div className="relative z-10 mt-2 max-h-56 overflow-y-auto rounded-xl border-[2px] border-gray-900 bg-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
                  {codeSuggestions.map((s) => (
                    <button
                      key={s.sale_id}
                      onClick={() => pickCodeSuggestion(s.sale_id)}
                      className="flex w-full items-center gap-2.5 px-2.5 py-2 text-left border-b-2 border-gray-100 last:border-b-0 hover:bg-gray-50"
                    >
                      {s.photo ? (
                        <img src={s.photo} alt="" className="h-10 w-10 shrink-0 rounded-lg border-2 border-gray-200 object-cover" />
                      ) : (
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border-2 border-gray-200 bg-gray-100">
                          <Package className="h-4 w-4 text-gray-300" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-extrabold text-gray-900">{s.sale_id}</div>
                        <div className="text-xs text-gray-500 truncate">{s.name || "商品名称"}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
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
                  <ProductSummaryCard
                    key={row.sale_id}
                    row={row}
                    onImageClick={setImgPreview}
                    needsBySize={needsForCard(row.sale_id)}
                    onShowDetail={openPackDetail}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 售出/退货明细弹窗(与管理栏总表同款): 层级在编号搜商品弹窗(z-70)之上、图片预览(z-80)之下 */}
      {detailType && (
        <div className="fixed inset-0 z-[75] bg-black/50 flex items-center justify-center p-4" onClick={() => setDetailType(null)}>
          <div className="bg-white rounded-2xl border-[3px] border-gray-900 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] max-w-2xl w-full max-h-[80vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b-2 border-gray-200">
              <h3 className="text-base font-extrabold">
                {detailType === "sales" ? "售卖明细" : "退货明细"} - {detailSaleId}
              </h3>
              <button onClick={() => setDetailType(null)} className="flex h-8 w-8 items-center justify-center rounded-lg border-2 border-gray-900 bg-white hover:bg-gray-100">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              {detailLoading ? (
                <div className="text-center py-8 text-gray-400">加载中...</div>
              ) : detailRecords.length === 0 ? (
                <div className="text-center py-8 text-gray-400">暂无数据</div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="bg-gray-900 text-white">
                    <tr>
                      <th className="px-2 py-1.5 text-left">编号</th>
                      <th className="px-2 py-1.5 text-center">尺码</th>
                      <th className="px-2 py-1.5 text-center">数量</th>
                      {detailType === "sales" && <th className="px-2 py-1.5 text-center">售价</th>}
                      {detailType === "sales" && <th className="px-2 py-1.5 text-left">面单号</th>}
                      {detailType === "returns" && <th className="px-2 py-1.5 text-center">退货价</th>}
                      <th className="px-2 py-1.5 text-left">时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailRecords.map((r, i) => (
                      <tr key={r.id || i} className={`border-b border-gray-200 ${i % 2 === 0 ? "bg-white" : "bg-gray-50"}`}>
                        <td className="px-2 py-1.5 font-bold">{r.sale_id}</td>
                        <td className="px-2 py-1.5 text-center">{r.size}</td>
                        <td className="px-2 py-1.5 text-center font-bold">{r.quantity}</td>
                        {detailType === "sales" && <td className="px-2 py-1.5 text-center text-red-500 font-bold">¥{r.sell_price}</td>}
                        {detailType === "sales" && <td className="px-2 py-1.5 text-xs">{r.tracking_number || "-"}</td>}
                        {detailType === "returns" && <td className="px-2 py-1.5 text-center text-red-500 font-bold">¥{r.return_price}</td>}
                        <td className="px-2 py-1.5 text-xs text-gray-500">
                          {detailType === "returns"
                            ? (r.return_time || r.created_at ? new Date((r.return_time || r.created_at)!).toLocaleString("zh-CN") : "-")
                            : (r.order_time || r.created_at ? new Date((r.order_time || r.created_at)!).toLocaleString("zh-CN") : "-")
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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