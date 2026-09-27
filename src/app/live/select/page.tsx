"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { ArrowLeft, Search, Package, Filter, ChevronDown, X, ArrowUpDown, ArrowUp, ArrowDown, Pencil, BadgeDollarSign, Tag } from "lucide-react";
import Link from "next/link";
import { PageWrapper } from "@/components/page-wrapper";
import { ErrorState } from "@/components/error-state";

const ALL_SIZES = [80, 90, 95, 100, 105, 110, 120, 130, 140, 150, 160, 170, 180] as const;

interface SummaryProduct {
  sale_id: string;
  inbound_total: number;
  sold_total: number;
  pdd_sold: number;
  return_total: number;
  remaining: number;
  profits: number;
  inventory_value: number;
  cost_price: number;
  sell_price: number;
  name: string;
  manufacturer: string;
  photo: string;
  shelf_no: string;
  inbound_date: string;
  last_order_time: string;
  [key: string]: unknown;
}

interface SelectionRow {
  id: string;
  member_name: string;
  sale_id: string;
  created_at: string;
}

const fmt = (n: number) => n.toFixed(2);
const pct = (n: number) => (n * 100).toFixed(1) + "%";

// 选品人角标配色
const ADMIN_COLORS = [
  { bg: "bg-[#FF6B7A]", text: "text-white" },
  { bg: "bg-[#4A90E2]", text: "text-white" },
  { bg: "bg-[#FFC93C]", text: "text-gray-900" },
  { bg: "bg-[#4CD964]", text: "text-white" },
  { bg: "bg-[#9B59B6]", text: "text-white" },
  { bg: "bg-[#FF8C42]", text: "text-white" },
  { bg: "bg-[#00BCD4]", text: "text-white" },
  { bg: "bg-[#E91E63]", text: "text-white" },
];

const getAdminColor = (name: string) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return ADMIN_COLORS[Math.abs(hash) % ADMIN_COLORS.length];
};

// 筛选选项按钮（黑字黑框, 选中黑底白字, 与管理栏总表同款）
function FilterOption({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`h-8 inline-flex items-center px-3 rounded-lg border-[2px] text-xs font-bold transition-all whitespace-nowrap ${
        active
          ? "bg-gray-900 text-white border-gray-900"
          : "bg-white border-gray-900 text-gray-900 hover:bg-gray-100"
      }`}
    >
      {label}
    </button>
  );
}

// 北京时间日期键(用于按天分组)与展示格式
const dayKey = (iso: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
};

const fmtDate = (d: string) => dayKey(d) || "-";

// 商品卡片 - 一比一复刻管理栏总表卡片(渠道角标位置改为直播价角标)
function ProductCard({
  product,
  editMode,
  livePrices,
  cancelSelection,
  setPriceEditProduct,
  setPriceInput,
  setImgPreview,
  isAdmin,
  showToast,
}: {
  product: SummaryProduct & { _selectors: string[]; _livePrice: number | null; _ids: string[] };
  editMode: boolean;
  livePrices: Record<string, number>;
  cancelSelection: (p: { sale_id: string; _ids: string[] }) => void;
  setPriceEditProduct: (p: { sale_id: string; name: string; sellPrice: number } | null) => void;
  setPriceInput: (v: string) => void;
  setImgPreview: (v: string | null) => void;
  isAdmin: () => boolean;
  showToast: (msg: string, type?: "error" | "success") => void;
}) {
  const returnRate = product.sold_total > 0 ? product.return_total / product.sold_total : 0;
  const profitRate = product.sell_price > 0 ? (product.sell_price - product.cost_price) / product.sell_price : 0;

  return (
    <div className="relative bg-white rounded-xl border-[3px] border-gray-900 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] p-2.5">
      {/* 编辑模式: 右上角变为 取消/改价 按钮(替换选品人角标) */}
      {editMode ? (
        <div className="absolute -top-2 -right-2 flex flex-col gap-1 z-10">
          <button
            onClick={() => cancelSelection(product)}
            className="text-[10px] px-2 py-1 rounded-lg border-2 border-gray-900 bg-[#FF6B7A] text-white font-extrabold shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none whitespace-nowrap"
          >
            取消
          </button>
          <button
            onClick={() => {
              if (!isAdmin()) {
                showToast("仅管理员可以编辑", "error");
                return;
              }
              setPriceEditProduct({ sale_id: product.sale_id, name: product.name, sellPrice: product.sell_price });
              setPriceInput(livePrices[product.sale_id] != null ? String(livePrices[product.sale_id]) : "");
            }}
            className="text-[10px] px-2 py-1 rounded-lg border-2 border-gray-900 bg-[#FFD43B] text-gray-900 font-extrabold shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none whitespace-nowrap"
          >
            改价
          </button>
        </div>
      ) : (
        /* 选品人角标 - 右上角(非编辑模式) */
        product._selectors.length > 0 && (
          <div className="absolute -top-1.5 -right-1.5 flex flex-col gap-0.5 z-10">
            {product._selectors.map((name) => {
              const c = getAdminColor(name);
              return (
                <span key={name} className={`text-[9px] px-1.5 py-0.5 rounded-full border-2 border-gray-900 ${c.bg} ${c.text} font-extrabold shadow-md whitespace-nowrap`}>
                  {name}已选品
                </span>
              );
            })}
          </div>
        )
      )}
      <div className="flex gap-2.5">
        {/* 图片区域 */}
        <div className="w-[50%] aspect-[4/5] rounded-lg border-2 border-gray-200 overflow-hidden bg-gray-100 shrink-0">
          {product.photo ? (
            <img src={product.photo} alt="" loading="lazy" className="w-full h-full object-cover cursor-pointer" onClick={() => setImgPreview(product.photo)} />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Package className="h-16 w-16 text-gray-300" />
            </div>
          )}
        </div>
        {/* 右侧规范化格子区 */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* 编号/名称 + 直播价角标(原渠道角标位置, 有改价才显示) */}
          <div className="flex items-start justify-between gap-1">
            <div className="min-w-0">
              <div className="text-2xl leading-none font-extrabold text-gray-900 truncate">{product.sale_id}</div>
              {product.name && <div className="text-sm text-gray-500 truncate mt-1">{product.name}</div>}
            </div>
            {product._livePrice != null && (
              <div className="flex flex-col items-center shrink-0 rounded-lg border-[3px] border-gray-900 bg-[#FF6B7A] px-2 py-1 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                <span className="text-[9px] leading-none font-extrabold text-white/90">直播价</span>
                <span className="text-lg leading-tight font-extrabold text-white">¥{product._livePrice}</span>
              </div>
            )}
          </div>
          {/* 规范格子: 每行两格, 隔行浅灰底 */}
          <div className="mt-1 rounded-lg border-2 border-gray-200 overflow-hidden text-xs divide-y-2 divide-gray-200">
            <div className="flex divide-x-2 divide-gray-200">
              <div className="w-[40%] flex items-center justify-between gap-0.5 px-1 py-1 min-w-0">
                <span className="text-gray-500 shrink-0 text-[13px] font-bold">售出</span>
                <span className="font-extrabold text-[13px] text-green-600 truncate">{product.sold_total}</span>
              </div>
              <div className="flex-1 flex items-center justify-between gap-0.5 px-1 py-1 min-w-0">
                <span className="text-gray-500 shrink-0 text-[13px] font-bold">利润率</span>
                <span className={`font-extrabold text-[13px] truncate ${profitRate >= 0 ? "text-green-600" : "text-red-500"}`}>{pct(profitRate)}</span>
              </div>
            </div>
            <div className="flex divide-x-2 divide-gray-200">
              <div className="w-[40%] flex items-center justify-between gap-0.5 px-1 py-1 min-w-0">
                <span className="text-gray-500 shrink-0 text-[13px] font-bold">退货</span>
                <span className="font-extrabold text-[13px] text-yellow-600 truncate">{product.return_total}</span>
              </div>
              <div className="flex-1 flex items-center justify-between gap-0.5 px-1 py-1 min-w-0">
                <span className="text-gray-500 shrink-0 text-[13px] font-bold">退货率</span>
                <span className="font-extrabold text-[13px] text-yellow-600 truncate">{pct(returnRate)}</span>
              </div>
            </div>
            <div className="flex bg-gray-100">
              <div className="w-full flex items-center justify-between gap-1 px-1.5 py-1 min-w-0">
                <span className="text-gray-500 shrink-0">进价</span>
                <span className="font-bold text-gray-700 truncate">¥{fmt(product.cost_price)}</span>
              </div>
            </div>
            <div className="flex bg-gray-100">
              <div className="w-full flex items-center justify-between gap-1 px-1.5 py-1 min-w-0">
                <span className="text-red-500 shrink-0">售价</span>
                <span className="font-extrabold text-red-500 truncate">¥{fmt(product.sell_price)}</span>
              </div>
            </div>
            <div className="flex">
              <div className="w-full flex items-center justify-between gap-1 px-1.5 py-1 min-w-0">
                <span className="text-gray-500 shrink-0">入库时间</span>
                <span className="font-medium text-gray-700 truncate">{fmtDate(product.inbound_date)}</span>
              </div>
            </div>
            <div className="flex">
              <div className="w-full flex items-center justify-between gap-1 px-1.5 py-1 min-w-0">
                <span className="text-gray-500 shrink-0">售出时间</span>
                <span className="font-medium text-gray-700 truncate">{fmtDate(product.last_order_time)}</span>
              </div>
            </div>
            <div className="flex bg-gray-100">
              <div className="w-full flex items-center justify-between gap-1 px-1.5 py-1 min-w-0">
                <span className="text-gray-500 shrink-0">货架号</span>
                <span className="font-medium text-gray-700 truncate">{product.shelf_no || "-"}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 尺码全宽5列换行显示 */}
      <div className="mt-1.5 grid grid-cols-5 gap-1">
        {ALL_SIZES.map((s) => {
          const val = Number(product[`size_${s}`]) || 0;
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
          <span className="font-extrabold text-blue-600">{product.inbound_total}</span>
        </div>
        <div>
          <span className="text-gray-400">剩余 </span>
          <span className="font-extrabold text-gray-900">{product.remaining}</span>
        </div>
        <div>
          <span className="text-gray-400">价值 </span>
          <span className="font-extrabold text-red-500">¥{fmt(product.inventory_value)}</span>
        </div>
      </div>
    </div>
  );
}

export default function LiveSelectPage() {
  const [products, setProducts] = useState<SummaryProduct[]>([]);
  const [selections, setSelections] = useState<SelectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  // 商品数据加载失败标记
  const [productsError, setProductsError] = useState(false);
  // 轮询快照: 与上次相同则跳过 setState
  const selectionsSnapshotRef = useRef<string>("");
  const pricesSnapshotRef = useRef<string>("");
  const [search, setSearch] = useState("");
  const [imgPreview, setImgPreview] = useState<string | null>(null);
  const [memberName, setMemberName] = useState("");

  // 筛选(与管理栏总表同款)
  const [stockFilter, setStockFilter] = useState("");
  const [valueFilter, setValueFilter] = useState("");
  const [alertFilter, setAlertFilter] = useState("");
  const [hotRankFilter, setHotRankFilter] = useState("");
  const [returnFilter, setReturnFilter] = useState("");
  const [manufacturerFilter, setManufacturerFilter] = useState("");
  const [showFilterMenu, setShowFilterMenu] = useState(false);

  // 排序(管理栏总表同款) + 直播改价表
  const [sortBy, setSortBy] = useState<"" | "sales" | "profitRate" | "returnRate" | "stock" | "inbound" | "inboundTime">("");
  const [sortDesc, setSortDesc] = useState(true);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [livePrices, setLivePrices] = useState<Record<string, number>>({});

  // 按天文件夹展开状态(null=未初始化, 首次拉取后默认展开最新一天)
  const [expandedDays, setExpandedDays] = useState<Set<string> | null>(null);
  // 默认只显示最近一天, 滚动到底部后自动显示更早日期(每次多显示5天)
  const [visibleDays, setVisibleDays] = useState(1);
  const moreDaysRef = useRef<HTMLDivElement>(null);
  // 底部固定栏: 展开所有日期选品 ↔ 收起仅看今日
  const [showAllDays, setShowAllDays] = useState(false);
  // 移动端底部 Tab 导航高度(固定栏需悬于其上; 桌面端导航隐藏高度为 0)
  const [mobileNavH, setMobileNavH] = useState(0);

  // 编辑模式: 卡片右上角变为 取消/改价 按钮(仅管理员)
  const [editMode, setEditMode] = useState(false);
  // 改价弹窗(管理栏总表同款底部抽屉)
  const [priceEditProduct, setPriceEditProduct] = useState<{ sale_id: string; name: string; sellPrice: number } | null>(null);
  const [priceInput, setPriceInput] = useState("");
  // 轻提示
  const [toast, setToast] = useState<{ msg: string; type: "error" | "success" } | null>(null);
  const showToast = (msg: string, type: "error" | "success" = "error") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2000);
  };
  const isAdmin = () => (localStorage.getItem("member_role") || "") === "admin";
  // 编辑模式取消选品: 删除该天该条选品记录(按记录 id 精确删除)
  const cancelSelection = async (p: { sale_id: string; _ids: string[] }) => {
    if (!isAdmin()) {
      showToast("仅管理员可以编辑", "error");
      return;
    }
    try {
      await fetch("/api/live-selections", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: p._ids }),
      });
      showToast("已删除该条选品", "success");
    } catch {
      showToast("删除失败，请重试", "error");
    }
    fetchSelections();
  };
  // 保存直播改价(settings.live_prices, 空值=清除改价)
  const saveLivePrice = async (saleId: string, val: string) => {
    const num = Number(val);
    const price = val === "" || Number.isNaN(num) ? null : num;
    try {
      await fetch("/api/live-selections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          member_name: localStorage.getItem("member_name") || "未知设备",
          sale_id: saleId,
          action: "price",
          price,
        }),
      });
    } catch {
      showToast("改价同步失败，请重试", "error");
    }
    fetchSelections();
  };
  // 改价弹窗主按钮: 提交改价
  const confirmPriceSave = () => {
    if (!priceEditProduct) return;
    const val = priceInput.trim();
    const num = Number(val);
    if (val === "" || Number.isNaN(num) || num < 0) {
      showToast("请输入正确的价格", "error");
      return;
    }
    saveLivePrice(priceEditProduct.sale_id, val);
    setPriceEditProduct(null);
  };
  useEffect(() => {
    const nav = document.querySelector("nav.md\\:hidden.fixed");
    if (!nav) return;
    const update = () => setMobileNavH(nav.getBoundingClientRect().height);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(nav);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setMemberName(localStorage.getItem("member_name") || "未知设备");
    fetchProducts();
    fetchSelections();
    // 每 2 秒轮询选品记录, 保证总表端选品实时可见
    const t = setInterval(fetchSelections, 2000);
    return () => clearInterval(t);
  }, []);

  const fetchProducts = async () => {
    try {
      const res = await fetch("/api/summary", { cache: "no-store" });
      const data = await res.json();
      const list = (Array.isArray(data) ? data : []).map((p: SummaryProduct) => ({
        ...p,
        remaining: Number(p.remaining) || 0,
        sell_price: Number(p.sell_price) || 0,
        cost_price: Number(p.cost_price) || 0,
        inbound_total: Number(p.inbound_total) || 0,
        sold_total: Number(p.sold_total) || 0,
        return_total: Number(p.return_total) || 0,
        inventory_value: (Number(p.remaining) || 0) * (Number(p.cost_price) || 0),
      }));
      setProducts(list);
      setProductsError(false);
    } catch (err) {
      console.error("Fetch products error:", err);
      setProductsError(true);
    } finally {
      setLoading(false);
    }
  };

  const fetchSelections = async () => {
    try {
      const res = await fetch("/api/live-selections", { cache: "no-store" });
      const data = await res.json();
      // 数据没变化就不 setState, 避免 2 秒轮询持续触发无效重渲染
      const nextSel = JSON.stringify(data.selections ?? null);
      if (Array.isArray(data.selections) && nextSel !== selectionsSnapshotRef.current) {
        selectionsSnapshotRef.current = nextSel;
        setSelections(data.selections);
      }
      const nextPrices = JSON.stringify(data.prices ?? null);
      if (data.prices && typeof data.prices === "object" && nextPrices !== pricesSnapshotRef.current) {
        pricesSnapshotRef.current = nextPrices;
        setLivePrices(data.prices as Record<string, number>);
      }
    } catch (err) {
      console.error("Fetch selections error:", err);
    }
  };

  // 选品记录: 按天分组(每天独立, 同日同编号合并选品人), 编号关联总表数据 + 直播改价
  const daySelections = useMemo(() => {
    const groups = new Map<string, Map<string, SummaryProduct & { _selectors: string[]; _createdAt: string; _livePrice: number | null; _ids: string[] }>>();
    for (const row of selections) {
      const key = dayKey(row.created_at || "") || "未知日期";
      if (!groups.has(key)) groups.set(key, new Map());
      const g = groups.get(key)!;
      const cur = g.get(row.sale_id);
      if (cur) {
        if (!cur._selectors.includes(row.member_name)) cur._selectors.push(row.member_name);
        if (row.created_at > cur._createdAt) cur._createdAt = row.created_at || "";
        if (row.id && !cur._ids.includes(row.id)) cur._ids.push(row.id);
      } else {
        const p = products.find((x) => x.sale_id === row.sale_id);
        if (p) {
          g.set(row.sale_id, { ...p, _selectors: [row.member_name], _createdAt: row.created_at || "", _livePrice: livePrices[row.sale_id] != null ? livePrices[row.sale_id] : null, _ids: row.id ? [row.id] : [] });
        }
      }
    }
    return groups;
  }, [selections, products, livePrices]);

  // 全部已选商品(跨天去重, 用于空状态/厂家筛选/热销排行/底部栏)
  const selectedProducts = useMemo(() => {
    const seen = new Map<string, SummaryProduct & { _selectors: string[]; _createdAt: string; _livePrice: number | null; _ids: string[] }>();
    for (const g of daySelections.values()) {
      for (const [sid, p] of g) if (!seen.has(sid)) seen.set(sid, p);
    }
    return Array.from(seen.values());
  }, [daySelections]);

  const manufacturerList = useMemo(() => {
    const set = new Set<string>();
    for (const p of selectedProducts) {
      if (p.manufacturer) set.add(p.manufacturer);
    }
    return Array.from(set).sort();
  }, [selectedProducts]);

  const activeFilterCount = useMemo(() => {
    return [stockFilter, valueFilter, alertFilter, hotRankFilter, returnFilter, manufacturerFilter].filter(Boolean).length;
  }, [stockFilter, valueFilter, alertFilter, hotRankFilter, returnFilter, manufacturerFilter]);

  // 筛选逻辑(与管理栏总表一致)
  const sizeKindCount = (row: SummaryProduct) => ALL_SIZES.filter((s) => Number(row[`size_${s}`]) > 0).length;
  const minSizeQty = (row: SummaryProduct) => {
    const vals = ALL_SIZES.map((s) => Number(row[`size_${s}`])).filter((v) => v > 0);
    return vals.length > 0 ? Math.min(...vals) : 0;
  };

  // 按天分组 + 筛选 + 排序(每天独立记录, 最新一天在前)
  const dayGroups = useMemo(() => {
    type SelProduct = SummaryProduct & { _selectors: string[]; _createdAt: string; _livePrice: number | null; _ids: string[] };
    // 筛选逻辑(与管理栏总表一致, 作用于每日组内)
    const filterList = (list: SelProduct[]): SelProduct[] => {
      let result = list;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        result = result.filter((r) => r.sale_id.toLowerCase().includes(q) || (r.name && r.name.toLowerCase().includes(q)) || (r.manufacturer && r.manufacturer.toLowerCase().includes(q)));
      }
      if (stockFilter) {
        result = result.filter((r) => {
          const kinds = sizeKindCount(r); const minQty = minSizeQty(r);
          if (stockFilter === "tail") return kinds < 5 && kinds > 0;
          if (stockFilter === "low") return kinds >= 5 && minQty < 5;
          if (stockFilter === "mid") return kinds >= 5 && minQty >= 5 && minQty <= 10;
          if (stockFilter === "high") return kinds >= 5 && minQty > 10;
          return true;
        });
      }
      if (valueFilter) {
        result = result.filter((r) => {
          const v = r.inventory_value;
          if (valueFilter === "0-100") return v >= 0 && v <= 100;
          if (valueFilter === "101-300") return v >= 101 && v <= 300;
          if (valueFilter === "301-500") return v >= 301 && v <= 500;
          if (valueFilter === "500+") return v > 500;
          return true;
        });
      }
      if (alertFilter) {
        result = result.filter((r) => {
          const rem = r.remaining;
          if (alertFilter === "out") return rem <= 0;
          if (alertFilter === "low") return rem > 0 && rem < 5;
          if (alertFilter === "mid") return rem >= 5 && rem <= 20;
          if (alertFilter === "over") return rem > 50;
          return true;
        });
      }
      if (hotRankFilter) {
        if (hotRankFilter === "zero") {
          result = result.filter((r) => (r.sold_total || 0) === 0);
        } else {
          const n = hotRankFilter === "top10" ? 10 : hotRankFilter === "top30" ? 30 : 50;
          const sorted = [...selectedProducts].sort((a, b) => (b.sold_total || 0) - (a.sold_total || 0)).slice(0, n);
          const topIds = new Set(sorted.map((r) => r.sale_id));
          result = result.filter((r) => topIds.has(r.sale_id));
        }
      }
      if (returnFilter) {
        result = result.filter((r) => {
          const ret = r.return_total;
          if (returnFilter === "zero") return ret === 0;
          if (returnFilter === "low") return ret >= 1 && ret <= 2;
          if (returnFilter === "mid") return ret >= 3 && ret <= 5;
          if (returnFilter === "high") return ret > 5;
          return true;
        });
      }
      if (manufacturerFilter) {
        result = result.filter((r) => r.manufacturer === manufacturerFilter);
      }
      return result;
    };
    const dirMul = sortDesc ? 1 : -1;
    const cmp = (a: SelProduct, b: SelProduct): number => {
      if (sortBy === "sales") return ((b.sold_total || 0) - (a.sold_total || 0)) * dirMul;
      if (sortBy === "profitRate") {
        const rate = (r: SelProduct) => {
          const revenue = (r.sell_price || 0) * (r.sold_total || 0);
          return revenue > 0 ? (r.profits || 0) / revenue : 0;
        };
        return (rate(b) - rate(a)) * dirMul;
      }
      if (sortBy === "returnRate") {
        const rate = (r: SelProduct) => (r.sold_total || 0) > 0 ? (r.return_total || 0) / (r.sold_total || 0) : (r.return_total || 0) > 0 ? 1 : 0;
        return (rate(b) - rate(a)) * dirMul;
      }
      if (sortBy === "stock") return ((b.remaining || 0) - (a.remaining || 0)) * dirMul;
      if (sortBy === "inbound") return ((b.inbound_total || 0) - (a.inbound_total || 0)) * dirMul;
      if (sortBy === "inboundTime") {
        // 按入库时间排序(取最新入库日期, 无日期排最后)
        const da = a.inbound_date || "", db = b.inbound_date || "";
        if (!da && !db) return 0;
        if (!da) return 1;
        if (!db) return -1;
        return (db < da ? -1 : db > da ? 1 : 0) * dirMul;
      }
      return 0;
    };
    return Array.from(daySelections.entries())
      .map(([date, g]) => ({ date, items: filterList(Array.from(g.values())) }))
      .filter((grp) => grp.items.length > 0)
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .map((grp) => ({
        date: grp.date,
        items: sortBy ? grp.items.sort(cmp) : grp.items.sort((a, b) => (a._createdAt < b._createdAt ? 1 : -1)),
      }));
  }, [daySelections, selectedProducts, search, stockFilter, valueFilter, alertFilter, hotRankFilter, returnFilter, manufacturerFilter, sortBy, sortDesc]);

  // 首次拉取后默认展开最新一天
  useEffect(() => {
    if (expandedDays === null && dayGroups.length > 0) {
      setExpandedDays(new Set([dayGroups[0].date]));
    }
  }, [dayGroups, expandedDays]);

  // 滚动到底部提示条时自动显示更早日期(无限滚动, 不与浏览器下拉刷新冲突)
  const hasMoreDays = dayGroups.length > visibleDays;
  useEffect(() => {
    const el = moreDaysRef.current;
    if (!el || !hasMoreDays) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        setVisibleDays((v) => v + 5);
      }
    }, { rootMargin: "0px 0px 300px 0px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMoreDays, visibleDays, dayGroups]);

  const toggleDay = (d: string) => {
    setExpandedDays((prev) => {
      const cur = prev ?? new Set<string>();
      const next = new Set(cur);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
  };
  // 展开所有日期选品: 收起今日文件夹并显示全部日期; 再次点击收起只看今日
  const toggleAllDays = () => {
    if (showAllDays) {
      setVisibleDays(1);
      setExpandedDays(new Set([todayKey]));
      setShowAllDays(false);
    } else {
      setVisibleDays(dayGroups.length);
      setExpandedDays(new Set());
      setShowAllDays(true);
    }
  };

  const clearAllFilters = () => {
    setStockFilter("");
    setValueFilter("");
    setAlertFilter("");
    setHotRankFilter("");
    setReturnFilter("");
    setManufacturerFilter("");
    setSearch("");
  };

  const todayKey = dayKey(new Date().toISOString());

  // 成员选品统计(仅今日, 每日刷新)
  const memberStats = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of selections) {
      if (dayKey(row.created_at || "") !== todayKey) continue;
      map.set(row.member_name, (map.get(row.member_name) || 0) + 1);
    }
    return Array.from(map.entries())
      .filter(([name]) => name !== memberName)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [selections, memberName, todayKey]);


  return (
    <PageWrapper>
      {/* Header */}
      <div className="flex items-center gap-2 sm:gap-3 lg:gap-4 mb-4 sm:mb-6">
        <Link
          href="/links"
          className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl border-[3px] border-gray-900 bg-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] transition-all shrink-0"
        >
          <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
        </Link>
        <h1 className="text-xl sm:text-2xl lg:text-4xl font-extrabold text-gray-900">
          <span className="highlight-yellow">直播选品</span>
        </h1>
        <div className="ml-auto text-xs font-bold text-gray-500">
          今日已选 <span className="text-[#FF6B7A] font-extrabold">{selections.filter((s) => dayKey(s.created_at || "") === dayKey(new Date().toISOString())).length}</span> 款
        </div>
      </div>

      {/* 搜索 + 筛选 (管理栏总表同款, 固定不参与滚动) */}
      <div className="sticky top-0 z-30 -mx-4 sm:-mx-6 lg:mx-0 mb-3 bg-white px-4 sm:px-6 lg:px-0 pt-1 pb-2 border-b-2 border-gray-900">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="relative flex-1 min-w-[140px] lg:min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 sm:h-5 sm:w-5 text-gray-400 z-10" />
            <input
              type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索商品编号/名称..."
              className="w-full h-11 text-sm sm:text-base pl-11 pr-4 rounded-xl border-[3px] border-gray-900 bg-white font-bold text-gray-800 placeholder-gray-400 focus:outline-none transition-all shadow-[3px_3px_0px_0px_rgba(0,0,0,0.12)] focus:shadow-[5px_5px_0px_0px_rgba(0,0,0,0.3)]"
            />
          </div>
          {/* 排序/筛选/编辑 三按钮并排成组, 整组换行不拆散 */}
          <div className="flex flex-nowrap items-center gap-2 sm:gap-3">
          <div className="relative order-2">
            <button
              onClick={() => { setShowFilterMenu(!showFilterMenu); setShowSortMenu(false); }}
              className={`h-11 inline-flex items-center gap-1.5 px-3 rounded-xl border-[2px] border-gray-900 text-xs font-extrabold transition-all whitespace-nowrap ${
                activeFilterCount > 0
                  ? "bg-gray-900 text-white shadow-[3px_3px_0px_0px_rgba(0,0,0,0.3)]"
                  : "bg-white text-gray-600 hover:bg-gray-50 shadow-[3px_3px_0px_0px_rgba(0,0,0,0.12)]"
              }`}
            >
              <Filter className="h-3.5 w-3.5" />
              筛选
              {activeFilterCount > 0 && (
                <span className="min-w-[16px] h-4 px-1 rounded-full bg-[#FF6B7A] text-white text-[9px] font-extrabold inline-flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
              <ChevronDown className={`h-3 w-3 transition-transform ${showFilterMenu ? "rotate-180" : ""}`} />
            </button>
            {showFilterMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowFilterMenu(false)} />
                <div className="absolute right-0 top-full mt-2 z-50 w-[340px] max-w-[85vw] p-3 rounded-xl border-[3px] border-gray-900 bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] max-h-[70vh] overflow-y-auto">
                  {/* 剩余库存 */}
                  <div className="mb-3">
                    <p className="text-[11px] font-extrabold text-gray-500 mb-1.5">剩余库存</p>
                    <div className="flex flex-wrap gap-1.5">
                      <FilterOption label="尾货" active={stockFilter === "tail"} onClick={() => { setStockFilter(stockFilter === "tail" ? "" : "tail"); }} />
                      <FilterOption label="<5手" active={stockFilter === "low"} onClick={() => { setStockFilter(stockFilter === "low" ? "" : "low"); }} />
                      <FilterOption label="5-10手" active={stockFilter === "mid"} onClick={() => { setStockFilter(stockFilter === "mid" ? "" : "mid"); }} />
                      <FilterOption label=">10手" active={stockFilter === "high"} onClick={() => { setStockFilter(stockFilter === "high" ? "" : "high"); }} />
                    </div>
                  </div>
                  {/* 库存价值 */}
                  <div className="mb-3">
                    <p className="text-[11px] font-extrabold text-gray-500 mb-1.5">库存价值</p>
                    <div className="flex flex-wrap gap-1.5">
                      <FilterOption label="0-100" active={valueFilter === "0-100"} onClick={() => { setValueFilter(valueFilter === "0-100" ? "" : "0-100"); }} />
                      <FilterOption label="101-300" active={valueFilter === "101-300"} onClick={() => { setValueFilter(valueFilter === "101-300" ? "" : "101-300"); }} />
                      <FilterOption label="301-500" active={valueFilter === "301-500"} onClick={() => { setValueFilter(valueFilter === "301-500" ? "" : "301-500"); }} />
                      <FilterOption label=">500" active={valueFilter === "500+"} onClick={() => { setValueFilter(valueFilter === "500+" ? "" : "500+"); }} />
                    </div>
                  </div>
                  {/* 库存预警 */}
                  <div className="mb-3">
                    <p className="text-[11px] font-extrabold text-gray-500 mb-1.5">库存预警</p>
                    <div className="flex flex-wrap gap-1.5">
                      <FilterOption label="缺货≤0" active={alertFilter === "out"} onClick={() => { setAlertFilter(alertFilter === "out" ? "" : "out"); }} />
                      <FilterOption label="1-4" active={alertFilter === "low"} onClick={() => { setAlertFilter(alertFilter === "low" ? "" : "low"); }} />
                      <FilterOption label="5-20" active={alertFilter === "mid"} onClick={() => { setAlertFilter(alertFilter === "mid" ? "" : "mid"); }} />
                      <FilterOption label=">50" active={alertFilter === "over"} onClick={() => { setAlertFilter(alertFilter === "over" ? "" : "over"); }} />
                    </div>
                  </div>
                  {/* 热销排行 */}
                  <div className="mb-3">
                    <p className="text-[11px] font-extrabold text-gray-500 mb-1.5">热销排行</p>
                    <div className="flex flex-wrap gap-1.5">
                      <FilterOption label="Top10" active={hotRankFilter === "top10"} onClick={() => { setHotRankFilter(hotRankFilter === "top10" ? "" : "top10"); }} />
                      <FilterOption label="Top30" active={hotRankFilter === "top30"} onClick={() => { setHotRankFilter(hotRankFilter === "top30" ? "" : "top30"); }} />
                      <FilterOption label="Top50" active={hotRankFilter === "top50"} onClick={() => { setHotRankFilter(hotRankFilter === "top50" ? "" : "top50"); }} />
                      <FilterOption label="零销量" active={hotRankFilter === "zero"} onClick={() => { setHotRankFilter(hotRankFilter === "zero" ? "" : "zero"); }} />
                    </div>
                  </div>
                  {/* 退货分析 */}
                  <div className="mb-3">
                    <p className="text-[11px] font-extrabold text-gray-500 mb-1.5">退货分析</p>
                    <div className="flex flex-wrap gap-1.5">
                      <FilterOption label="无退货" active={returnFilter === "zero"} onClick={() => { setReturnFilter(returnFilter === "zero" ? "" : "zero"); }} />
                      <FilterOption label="1-2件" active={returnFilter === "low"} onClick={() => { setReturnFilter(returnFilter === "low" ? "" : "low"); }} />
                      <FilterOption label="3-5件" active={returnFilter === "mid"} onClick={() => { setReturnFilter(returnFilter === "mid" ? "" : "mid"); }} />
                      <FilterOption label=">5件" active={returnFilter === "high"} onClick={() => { setReturnFilter(returnFilter === "high" ? "" : "high"); }} />
                    </div>
                  </div>
                  {/* 厂家 */}
                  <div>
                    <p className="text-[11px] font-extrabold text-gray-500 mb-1.5">厂家</p>
                    <select
                      value={manufacturerFilter}
                      onChange={(e) => setManufacturerFilter(e.target.value)}
                      className="w-full h-9 px-2 rounded-lg border-[2px] border-gray-900 bg-white text-xs font-bold text-gray-700 focus:outline-none"
                    >
                      <option value="">全部厂家</option>
                      {manufacturerList.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                  {/* 清空筛选 */}
                  {activeFilterCount > 0 && (
                    <button
                      onClick={() => { clearAllFilters(); setShowFilterMenu(false); }}
                      className="mt-3 flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border-[2px] border-gray-900 bg-white text-xs font-extrabold text-gray-900 hover:bg-gray-100 transition-all"
                    >
                      <X className="h-3.5 w-3.5" />
                      清空筛选({activeFilterCount})
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

          {/* 排序下拉(管理栏总表同款) */}
          <div className="relative order-1">
            <button
              onClick={() => { setShowSortMenu(!showSortMenu); setShowFilterMenu(false); }}
              className={`h-11 inline-flex items-center gap-1.5 px-3 rounded-xl border-[2px] border-gray-900 text-xs font-extrabold transition-all whitespace-nowrap ${
                sortBy
                  ? "bg-gray-900 text-white shadow-[3px_3px_0px_0px_rgba(0,0,0,0.3)]"
                  : "bg-white text-gray-600 hover:bg-gray-50 shadow-[3px_3px_0px_0px_rgba(0,0,0,0.12)]"
              }`}
            >
              <ArrowUpDown className="h-3.5 w-3.5" />
              排序
              {sortBy && (
                <span className="text-[10px] opacity-70">
                  ({sortBy === "sales" ? "销量" : sortBy === "profitRate" ? "利润率" : sortBy === "returnRate" ? "退货率" : sortBy === "stock" ? "库存量" : sortBy === "inbound" ? "入库量" : "入库时间"} {sortDesc ? "↓" : "↑"})
                </span>
              )}
              <ChevronDown className={`h-3 w-3 transition-transform ${showSortMenu ? "rotate-180" : ""}`} />
            </button>
            {showSortMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowSortMenu(false)} />
                <div className="absolute right-0 top-full mt-2 z-50 w-40 p-1.5 rounded-xl border-[3px] border-gray-900 bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                  {([
                    { v: "", label: "默认排序" },
                    { v: "sales", label: "按销量" },
                    { v: "profitRate", label: "按利润率" },
                    { v: "returnRate", label: "按退货率" },
                    { v: "stock", label: "按库存量" },
                    { v: "inbound", label: "按入库量" },
                    { v: "inboundTime", label: "按入库时间" },
                  ] as const).map((o) => (
                    <button
                      key={o.v}
                      onClick={() => {
                        if (!o.v) {
                          setSortBy("");
                          setShowSortMenu(false);
                          return;
                        }
                        if (sortBy === o.v) {
                          // 同一排序再点一次: 从大到小 ↔ 从小到大
                          setSortDesc((d) => !d);
                        } else {
                          // 首次点击: 默认从大到小
                          setSortBy(o.v);
                          setSortDesc(true);
                        }
                        setShowSortMenu(false);
                      }}
                      className={`w-full flex items-center justify-between gap-1 px-3 h-9 rounded-lg text-xs font-bold transition-all ${
                        sortBy === o.v ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-100"
                      }`}
                    >
                      <span>{o.label}</span>
                      {o.v && (
                        <span className="flex items-center gap-0.5">
                          <ArrowUp className={`h-3 w-3 ${sortBy === o.v && !sortDesc ? "opacity-100" : "opacity-30"}`} />
                          <ArrowDown className={`h-3 w-3 ${sortBy === o.v && sortDesc ? "opacity-100" : "opacity-30"}`} />
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* 编辑按钮: 卡片右上角变为 取消/改价 按钮(仅管理员) */}
          <div className="relative order-3">
            <button
              onClick={() => {
                if (!isAdmin()) {
                  showToast("仅管理员可以编辑", "error");
                  return;
                }
                setShowSortMenu(false);
                setShowFilterMenu(false);
                setEditMode(!editMode);
              }}
              className={`h-11 inline-flex items-center gap-1.5 px-3 rounded-xl border-[2px] border-gray-900 text-xs font-extrabold transition-all whitespace-nowrap ${
                editMode
                  ? "bg-[#4A90E2] text-white shadow-[3px_3px_0px_0px_rgba(0,0,0,0.3)]"
                  : "bg-white text-gray-600 hover:bg-gray-50 shadow-[3px_3px_0px_0px_rgba(0,0,0,0.12)]"
              }`}
            >
              <Pencil className="h-3.5 w-3.5" />
              编辑
            </button>
          </div>
          </div>
        </div>
      </div>

      {/* 按天文件夹 */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-gray-200 border-t-[#FFC93C]" />
        </div>
      ) : productsError ? (
        <ErrorState
          title="选品数据加载失败"
          message="请检查网络后重试。"
          onRetry={fetchProducts}
          compact
        />
      ) : selectedProducts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Package className="h-12 w-12 text-gray-300" />
          <p className="font-bold text-gray-500 text-sm">暂无选品</p>
          <p className="text-xs text-gray-400">在管理栏总表开启「选品模式」进行选品</p>
        </div>
      ) : dayGroups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Package className="h-12 w-12 text-gray-300" />
          <p className="font-bold text-gray-500 text-sm">无匹配选品</p>
        </div>
      ) : (
        <div className="space-y-3">
          {dayGroups.slice(0, visibleDays).map((group) => {
            const expanded = expandedDays?.has(group.date) ?? false;
            return (
              <div key={group.date} className="bg-white rounded-xl border-[3px] border-gray-900 shadow-[3px_3px_0px_0px_rgba(0,0,0,0.3)] overflow-hidden">
                {/* 文件夹头部 */}
                <button
                  onClick={() => toggleDay(group.date)}
                  className="w-full flex items-center justify-between px-4 py-3 gap-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-base font-extrabold text-gray-900 truncate">{group.date}</span>
                    {group.date === todayKey && (
                      <span className="shrink-0 rounded-md border-2 border-gray-900 bg-[#FFC93C] px-1.5 py-0.5 text-[10px] leading-none font-extrabold text-gray-900">今天</span>
                    )}
                    <span className="shrink-0 text-xs font-bold text-gray-500">{group.items.length}款</span>
                  </div>
                  <ChevronDown className={`h-5 w-5 text-gray-600 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />
                </button>
                {/* 展开的商品卡片 */}
                {expanded && (
                  <div className="p-2 pt-2 border-t-[3px] border-gray-900 grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
                    {group.items.map((product) => (
                      <ProductCard key={product.sale_id} product={product} editMode={editMode} livePrices={livePrices} cancelSelection={cancelSelection} setPriceEditProduct={setPriceEditProduct} setPriceInput={setPriceInput} setImgPreview={setImgPreview} isAdmin={isAdmin} showToast={showToast} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {/* 滚动到此自动显示更早日期(也可点击) */}
          {hasMoreDays && (
            <div
              ref={moreDaysRef}
              onClick={() => setVisibleDays((v) => v + 5)}
              className="flex items-center gap-3 py-3 cursor-pointer select-none"
            >
              <div className="h-0.5 flex-1 bg-gray-300 rounded-full" />
              <span className="flex items-center gap-1 text-xs font-bold text-gray-400 whitespace-nowrap">
                下拉显示更多日期
                <ChevronDown className="h-3.5 w-3.5 animate-bounce" />
              </span>
              <div className="h-0.5 flex-1 bg-gray-300 rounded-full" />
            </div>
          )}
        </div>
      )}

      {/* 底部占位(避免固定栏+底部Tab遮挡内容) */}
      <div className="h-40" />

      {/* 底部固定栏: 其他成员今日选品(每日刷新, 已缩小) + 展开所有日期选品(居中); 移动端悬于底部Tab上方 */}
      {selectedProducts.length > 0 && (
        <div
          style={{ bottom: mobileNavH }}
          className="fixed inset-x-0 z-40 bg-white border-t-[3px] border-gray-900"
        >
          <div className="max-w-6xl mx-auto px-4 pt-2 pb-[calc(env(safe-area-inset-bottom)_+_8px)]">
            {memberStats.length > 0 && (
              <div className="flex flex-wrap gap-1.5 justify-center mb-2">
                {memberStats.map((m) => (
                  <div key={m.name} className="flex items-center gap-1 px-2 py-0.5 rounded-lg border-2 border-gray-300 bg-gray-50">
                    <span className="text-[10px] font-bold text-gray-700">{m.name}</span>
                    <span className="inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-[#FF6B7A] text-white text-[9px] font-extrabold">
                      {m.count}
                    </span>
                    <span className="text-[9px] text-gray-400">款</span>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={toggleAllDays}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border-[3px] border-gray-900 bg-[#FFC93C] text-sm font-extrabold text-gray-900 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            >
              <ChevronDown className={`h-4 w-4 transition-transform ${showAllDays ? "rotate-180" : ""}`} />
              {showAllDays ? "收起仅看今日选品" : "展开所有日期选品"}
            </button>
          </div>
        </div>
      )}

      {/* 直播改价弹窗: 底部抽屉(管理栏总表同款) */}
      {priceEditProduct && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" onClick={() => setPriceEditProduct(null)}>
          <div
            className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl border-[3px] border-gray-900 bg-white p-5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-lg font-extrabold text-gray-900">
                <BadgeDollarSign className="h-5 w-5" />
                改价 - {priceEditProduct.sale_id}
              </h3>
              <button onClick={() => setPriceEditProduct(null)} className="rounded-lg p-1 hover:bg-gray-100">
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            <p className="mb-3 truncate text-xs font-bold text-gray-400">
              {priceEditProduct.name || "未命名"} · 当前售价: ¥{priceEditProduct.sellPrice}
            </p>
            <input
              type="number" inputMode="decimal" min="0" step="0.1" autoFocus
              value={priceInput}
              onChange={(e) => setPriceInput(e.target.value)}
              placeholder="新售价"
              className="w-full h-12 px-3 text-lg font-extrabold rounded-xl border-[3px] border-gray-900 bg-white focus:outline-none focus:shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]"
            />
            {/* 预选售价 */}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {["9.9", "19.9", "29.9", "15.9"].map((v) => (
                <button
                  key={v}
                  onClick={() => setPriceInput(v)}
                  className={`rounded-lg border-2 border-gray-900 px-3 py-1.5 text-sm font-extrabold transition-all ${
                    priceInput === v
                      ? "bg-gray-900 text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,0.3)]"
                      : "bg-white text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  ¥{v}
                </button>
              ))}
            </div>
            <button
              onClick={confirmPriceSave}
              className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl border-[3px] border-gray-900 bg-[#FFD43B] px-4 py-2.5 text-sm font-extrabold text-gray-900 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            >
              <Tag className="h-4 w-4" />
              保存改价
            </button>
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => setPriceEditProduct(null)}
                className="flex-1 h-9 rounded-xl border-2 border-gray-900 bg-white text-xs font-extrabold text-gray-700"
              >
                取消
              </button>
              {livePrices[priceEditProduct.sale_id] != null && (
                <button
                  onClick={() => { saveLivePrice(priceEditProduct.sale_id, ""); setPriceEditProduct(null); }}
                  className="flex-1 h-9 rounded-xl border-2 border-gray-400 bg-white text-xs font-bold text-gray-500"
                >
                  清除改价
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 轻提示 */}
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[200] px-4 py-2 rounded-xl border-[3px] border-gray-900 text-sm font-extrabold shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] ${
          toast.type === "success" ? "bg-[#4CD964] text-white" : "bg-[#FF6B7A] text-white"
        }`}>
          {toast.msg}
        </div>
      )}

      {/* 图片大图预览 */}
      <div
        className={`fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 transition-opacity duration-150 ${imgPreview ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
        onClick={() => setImgPreview(null)}
      >
        <div className="relative max-w-[90vw] max-h-[90vh]">
          <button onClick={() => setImgPreview(null)} className="absolute -top-3 -right-3 z-10 w-8 h-8 bg-white rounded-full border-[3px] border-gray-900 flex items-center justify-center shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:bg-gray-100">
            <X className="h-4 w-4" />
          </button>
          {imgPreview && <img src={imgPreview} alt="" className="max-w-full max-h-[90vh] rounded-xl border-[3px] border-gray-900 object-contain bg-white" />}
        </div>
      </div>
    </PageWrapper>
  );
}
