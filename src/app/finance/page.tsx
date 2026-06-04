"use client";

import { useState, useEffect, useMemo } from "react";
import { Search, Package, TrendingUp, TrendingDown, DollarSign, Warehouse, X, ArrowDown } from "lucide-react";
import { PageWrapper } from "@/components/page-wrapper";

const ALL_SIZES = [80, 90, 95, 100, 105, 110, 120, 130, 140, 150, 160, 170, 180] as const;
const CACHE_TTL = 5 * 60 * 1000; // 5分钟缓存

function getCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { data, timestamp } = JSON.parse(raw);
    if (Date.now() - timestamp < CACHE_TTL) return data as T;
    return null;
  } catch { return null; }
}

function setCache(key: string, data: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() }));
  } catch { /* quota exceeded, ignore */ }
}

interface SummaryRow {
  sale_id: string;
  inbound_total: number;
  sold_total: number;
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
  [sizeKey: string]: unknown;
}

interface AggRow {
  sale_id: string;
  total: number;
  name: string;
  manufacturer: string;
  photo: string;
  shelf_no: string;
  sell_price?: number;
  cost_price?: number;
  last_order_time?: string;
  total_revenue?: number;
  last_return_time?: string;
  total_return_amount?: number;
  [sizeKey: string]: unknown;
}

interface DetailRecord {
  id: number;
  sale_id: string;
  size: number;
  quantity: number;
  sell_price?: number;
  return_price?: number;
  tracking_number?: string;
  order_time?: string;
  created_at?: string;
  name?: string;
  manufacturer?: string;
}

type ViewMode = "summary" | "sales" | "returns" | "inbound";

function getShelfRows(data: SummaryRow[]): string[] {
  const rows = new Set<string>();
  for (const r of data) {
    const sn = (r.shelf_no || "").trim();
    if (!sn) continue;
    const parts = sn.split("-");
    if (parts.length >= 2) {
      rows.add(`${parts[0].toUpperCase()}-${parts[1]}`);
    } else {
      rows.add(sn.toUpperCase());
    }
  }
  return Array.from(rows).sort();
}

// 图片 hover 放大组件
function HoverImage({ src, alt }: { src: string; alt: string }) {
  const [show, setShow] = useState(false);
  if (!src) return (
    <div className="w-24 h-24 rounded-md border-2 border-gray-200 bg-gray-100 flex items-center justify-center">
      <Package className="h-8 w-8 text-gray-300" />
    </div>
  );
  return (
    <div className="relative inline-block" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      <img src={src} alt={alt} className="w-24 h-24 rounded-md border-2 border-gray-200 object-cover cursor-pointer" />
      {show && (
        <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[9999] pointer-events-none">
          <img src={src} alt={alt} className="max-w-[640px] max-h-[640px] rounded-xl border-[3px] border-gray-900 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] bg-white object-contain" />
        </div>
      )}
    </div>
  );
}

export default function FinancePage() {
  const [viewMode, setViewMode] = useState<ViewMode>("summary");
  const [data, setData] = useState<SummaryRow[]>(() => getCache<SummaryRow[]>("finance_summary") || []);
  const [salesData, setSalesData] = useState<AggRow[]>([]);
  const [returnData, setReturnData] = useState<AggRow[]>([]);
  const [inboundData, setInboundData] = useState<AggRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // 筛选
  const [stockFilter, setStockFilter] = useState<string>("");
  const [valueFilter, setValueFilter] = useState<string>("");
  const [errorFilter, setErrorFilter] = useState(false);

  // 明细弹窗
  const [detailType, setDetailType] = useState<"sales" | "returns" | null>(null);
  const [detailSaleId, setDetailSaleId] = useState("");
  const [detailRecords, setDetailRecords] = useState<DetailRecord[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => { fetchSummary(); }, []);

  const fetchSummary = async () => {
    try {
      const res = await fetch("/api/summary");
      const result = await res.json();
      if (Array.isArray(result)) {
        setCache("finance_summary", result);
        setData(result);
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const fetchSalesAgg = async () => {
    try {
      const res = await fetch("/api/sales-records");
      const all = await res.json();
      if (!Array.isArray(all) || all.length === 0) { setSalesData([]); return; }
      const map = new Map<string, AggRow>();
      for (const row of all) {
        const sid = (row.sale_id || "").toUpperCase();
        if (!sid) continue;
        if (!map.has(sid)) {
          map.set(sid, {
            sale_id: sid, total: 0, name: row.product_name || "", manufacturer: row.manufacturer || "",
            photo: row.photo || "", shelf_no: row.shelf_no || "",
            sell_price: 0, cost_price: 0, total_revenue: 0, last_order_time: "",
          });
        }
        const e = map.get(sid)!;
        const qty = Number(row.quantity) || 0;
        const sz = Number(row.size) || 0;
        e.total += qty;
        const key = `size_${sz}`;
        e[key] = (Number(e[key]) || 0) + qty;
        // 使用最新的售价/进价/下单时间
        e.sell_price = Number(row.sell_price) || e.sell_price || 0;
        e.cost_price = Number(row.cost_price) || e.cost_price || 0;
        e.total_revenue = (e.total_revenue || 0) + (Number(row.sell_price) || 0) * qty;
        const ot = row.order_time || row.created_at || "";
        if (ot && ot > (e.last_order_time || "")) e.last_order_time = ot;
      }
      setSalesData(Array.from(map.values()));
    } catch { setSalesData([]); }
  };

  const fetchReturnAgg = async () => {
    try {
      const res = await fetch("/api/return-records");
      const all = await res.json();
      if (!Array.isArray(all) || all.length === 0) { setReturnData([]); return; }
      const map = new Map<string, AggRow>();
      for (const row of all) {
        const sid = (row.sale_id || "").toUpperCase();
        if (!sid) continue;
        if (!map.has(sid)) {
          map.set(sid, {
            sale_id: sid, total: 0, name: "", manufacturer: "", photo: "", shelf_no: "",
            total_return_amount: 0, last_return_time: "",
          });
        }
        const e = map.get(sid)!;
        const qty = Number(row.quantity) || 0;
        const sz = Number(row.size) || 0;
        e.total += qty;
        const key = `size_${sz}`;
        e[key] = (Number(e[key]) || 0) + qty;
        e.total_return_amount = (e.total_return_amount || 0) + (Number(row.return_price) || 0) * qty;
        const ct = row.created_at || "";
        if (ct && ct > (e.last_return_time || "")) e.last_return_time = ct;
      }
      setReturnData(Array.from(map.values()));
    } catch { setReturnData([]); }
  };

  const fetchInboundAgg = async () => {
    try {
      const res = await fetch("/api/inbound-records");
      const all = await res.json();
      if (!Array.isArray(all) || all.length === 0) { setInboundData([]); return; }
      const map = new Map<string, AggRow>();
      for (const row of all) {
        const sid = (row.sale_id || "").toUpperCase();
        if (!sid) continue;
        if (!map.has(sid)) {
          map.set(sid, {
            sale_id: sid, total: 0, name: row.name || "", manufacturer: row.manufacturer || "",
            photo: row.photo || "", shelf_no: row.shelf_no || "",
            sell_price: 0, cost_price: 0,
          });
        }
        const e = map.get(sid)!;
        for (const s of ALL_SIZES) {
          const v = Number(row[`size_${s}`]) || 0;
          e.total += v;
          e[`size_${s}`] = (Number(e[`size_${s}`]) || 0) + v;
        }
        e.cost_price = Number(row.cost_price) || e.cost_price || 0;
      }
      setInboundData(Array.from(map.values()));
    } catch { setInboundData([]); }
  };

  const switchView = (mode: ViewMode) => {
    setViewMode(mode);
    setSearch("");
    setStockFilter("");
    setValueFilter("");
    setErrorFilter(false);
    if (mode === "sales") fetchSalesAgg();
    if (mode === "returns") fetchReturnAgg();
    if (mode === "inbound") fetchInboundAgg();
  };

  const fetchDetail = async (type: "sales" | "returns", saleId: string) => {
    setDetailType(type);
    setDetailSaleId(saleId);
    setDetailLoading(true);
    setDetailRecords([]);
    try {
      const endpoint = type === "sales" ? "/api/sales-records" : "/api/return-records";
      const res = await fetch(`${endpoint}?sale_id=${encodeURIComponent(saleId)}`);
      const d = await res.json();
      setDetailRecords(Array.isArray(d) ? d : []);
    } catch { setDetailRecords([]); }
    finally { setDetailLoading(false); }
  };

  const closeDetail = () => { setDetailType(null); setDetailSaleId(""); setDetailRecords([]); };

  const sizeKindCount = (row: SummaryRow) => ALL_SIZES.filter((s) => Number(row[`size_${s}`]) > 0).length;
  const minSizeQty = (row: SummaryRow) => {
    const vals = ALL_SIZES.map((s) => Number(row[`size_${s}`])).filter((v) => v > 0);
    return vals.length > 0 ? Math.min(...vals) : 0;
  };
  const hasErrorStock = (row: SummaryRow) => ALL_SIZES.some((s) => Number(row[`size_${s}`]) < 0);

  // ===== 筛选逻辑 =====
  const filteredSummary = useMemo(() => {
    let result = data;
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
    if (errorFilter) result = result.filter((r) => hasErrorStock(r));
    return result;
  }, [data, search, stockFilter, valueFilter, errorFilter]);

  const filteredSales = useMemo(() => {
    let result = salesData;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((r) => r.sale_id.toLowerCase().includes(q) || (r.name && r.name.toLowerCase().includes(q)));
    }
    return result;
  }, [salesData, search]);

  const filteredReturns = useMemo(() => {
    let result = returnData;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((r) => r.sale_id.toLowerCase().includes(q));
    }
    return result;
  }, [returnData, search]);

  const filteredInbound = useMemo(() => {
    let result = inboundData;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((r) => r.sale_id.toLowerCase().includes(q) || (r.name && r.name.toLowerCase().includes(q)));
    }
    return result;
  }, [inboundData, search]);

  // ===== 汇总数据 =====
  const totals = useMemo(() => {
    return filteredSummary.reduce((acc, row) => ({
      inbound_total: acc.inbound_total + row.inbound_total,
      sold_total: acc.sold_total + row.sold_total,
      return_total: acc.return_total + row.return_total,
      remaining: acc.remaining + row.remaining,
      profits: acc.profits + row.profits,
      inventory_value: acc.inventory_value + row.inventory_value,
    }), { inbound_total: 0, sold_total: 0, return_total: 0, remaining: 0, profits: 0, inventory_value: 0 });
  }, [filteredSummary]);

  // 售出/退货汇总
  const salesTotals = useMemo(() => ({
    orderCount: filteredSales.length,
    revenue: filteredSales.reduce((sum, r) => sum + (r.total_revenue || 0), 0),
  }), [filteredSales]);

  const returnTotals = useMemo(() => ({
    orderCount: filteredReturns.length,
    loss: filteredReturns.reduce((sum, r) => sum + (r.total_return_amount || 0), 0),
  }), [filteredReturns]);

  const shelfRows = useMemo(() => getShelfRows(data), [data]);

  if (loading) {
    return <PageWrapper><div className="text-center py-20 text-gray-400">加载中...</div></PageWrapper>;
  }

  const fmt = (n: number) => n.toFixed(2);
  const pct = (n: number) => (n * 100).toFixed(1) + "%";

  const viewTitle = viewMode === "summary" ? "商品管理总表" : viewMode === "sales" ? "售卖明细表" : viewMode === "returns" ? "退货明细表" : "入库登记清单";
  const highlightClass = viewMode === "summary" ? "highlight-blue" : viewMode === "sales" ? "highlight-green" : viewMode === "returns" ? "highlight-yellow" : "highlight-blue";

  return (
    <PageWrapper>
      {/* Header + 视图切换按钮 */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-gray-900 flex-1 min-w-0">
          <span className={highlightClass}>{viewTitle}</span>
        </h1>
        <div className="flex gap-1.5 sm:gap-2 shrink-0">
          <button onClick={() => switchView("summary")}
            className={`flex items-center gap-1 px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg sm:rounded-xl border-[2px] sm:border-[3px] border-gray-900 font-extrabold text-xs sm:text-sm transition-all ${
              viewMode === "summary" ? "bg-[#4A90E2] text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]" : "bg-white text-gray-700 hover:bg-gray-100"
            }`}>
            <Package className="h-3.5 w-3.5 sm:h-4 sm:w-4" /><span>总表</span>
          </button>
          <button onClick={() => switchView("sales")}
            className={`flex items-center gap-1 px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg sm:rounded-xl border-[2px] sm:border-[3px] border-gray-900 font-extrabold text-xs sm:text-sm transition-all ${
              viewMode === "sales" ? "bg-green-500 text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]" : "bg-white text-gray-700 hover:bg-gray-100"
            }`}>
            <TrendingUp className="h-3.5 w-3.5 sm:h-4 sm:w-4" /><span>售出</span>
          </button>
          <button onClick={() => switchView("returns")}
            className={`flex items-center gap-1 px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg sm:rounded-xl border-[2px] sm:border-[3px] border-gray-900 font-extrabold text-xs sm:text-sm transition-all ${
              viewMode === "returns" ? "bg-yellow-500 text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]" : "bg-white text-gray-700 hover:bg-gray-100"
            }`}>
            <TrendingDown className="h-3.5 w-3.5 sm:h-4 sm:w-4" /><span>退货</span>
          </button>
          <button onClick={() => switchView("inbound")}
            className={`flex items-center gap-1 px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg sm:rounded-xl border-[2px] sm:border-[3px] border-gray-900 font-extrabold text-xs sm:text-sm transition-all ${
              viewMode === "inbound" ? "bg-[#4A90E2] text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]" : "bg-white text-gray-700 hover:bg-gray-100"
            }`}>
            <ArrowDown className="h-3.5 w-3.5 sm:h-4 sm:w-4" /><span>入库</span>
          </button>
        </div>
      </div>

      {/* 统计栏 */}
      <div className="flex flex-wrap items-center gap-3 sm:gap-4 mb-3 sm:mb-4 px-3 py-2 sm:px-4 sm:py-3 bg-white rounded-lg sm:rounded-xl border-[2px] sm:border-[3px] border-gray-900 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
        {viewMode === "summary" && (
          <>
            <div className="flex items-center gap-2">
              <Warehouse className="h-4 w-4 sm:h-5 sm:w-5 text-gray-500" />
              <span className="text-xs sm:text-sm text-gray-500 font-bold">入库</span>
              <span className="text-sm sm:text-lg font-extrabold text-gray-900">{totals.inbound_total}</span>
            </div>
            <div className="flex-1" />
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 sm:h-5 sm:w-5 text-blue-500" />
              <span className="text-xs sm:text-sm text-gray-500 font-bold">剩余</span>
              <span className="text-sm sm:text-lg font-extrabold text-blue-600">{totals.remaining}</span>
            </div>
            <div className="flex-1" />
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 sm:h-5 sm:w-5 text-red-500" />
              <span className="text-xs sm:text-sm text-gray-500 font-bold">价值</span>
              <span className="text-sm sm:text-lg font-extrabold text-red-500">¥{fmt(totals.inventory_value)}</span>
            </div>
          </>
        )}
        {viewMode === "sales" && (
          <>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-green-500" />
              <span className="text-xs sm:text-sm text-gray-500 font-bold">售出</span>
              <span className="text-sm sm:text-lg font-extrabold text-gray-900">{salesTotals.orderCount}单</span>
            </div>
            <div className="flex-1" />
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 sm:h-5 sm:w-5 text-red-500" />
              <span className="text-xs sm:text-sm text-gray-500 font-bold">盈利</span>
              <span className="text-sm sm:text-lg font-extrabold text-red-500">¥{fmt(salesTotals.revenue)}</span>
            </div>
          </>
        )}
        {viewMode === "returns" && (
          <>
            <div className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 sm:h-5 sm:w-5 text-yellow-500" />
              <span className="text-xs sm:text-sm text-gray-500 font-bold">退货</span>
              <span className="text-sm sm:text-lg font-extrabold text-gray-900">{returnTotals.orderCount}单</span>
            </div>
            <div className="flex-1" />
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 sm:h-5 sm:w-5 text-red-500" />
              <span className="text-xs sm:text-sm text-gray-500 font-bold">亏损</span>
              <span className="text-sm sm:text-lg font-extrabold text-red-500">¥{fmt(returnTotals.loss)}</span>
            </div>
          </>
        )}
        {viewMode === "inbound" && (
          <>
            <div className="flex items-center gap-2">
              <ArrowDown className="h-4 w-4 sm:h-5 sm:w-5 text-blue-500" />
              <span className="text-xs sm:text-sm text-gray-500 font-bold">入库</span>
              <span className="text-sm sm:text-lg font-extrabold text-gray-900">{filteredInbound.length}种</span>
            </div>
            <div className="flex-1" />
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 sm:h-5 sm:w-5 text-[#4A90E2]" />
              <span className="text-xs sm:text-sm text-gray-500 font-bold">总入库</span>
              <span className="text-sm sm:text-lg font-extrabold text-[#4A90E2]">{filteredInbound.reduce((s, r) => s + r.total, 0)}件</span>
            </div>
          </>
        )}
      </div>

      {/* 搜索 + 筛选按钮 */}
      <div className="flex flex-wrap items-stretch gap-1.5 sm:gap-2 mb-3 sm:mb-4">
        <div className="relative w-[140px] sm:w-[160px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 sm:h-4 sm:w-4 text-gray-400 z-10" />
          <input
            type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索..." className="neo-input w-full h-full text-xs sm:text-sm pl-10 py-1 sm:py-1.5"
          />
        </div>

        {viewMode === "summary" && (
          <>
            <select value={stockFilter} onChange={(e) => setStockFilter(e.target.value)}
              className="text-[10px] sm:text-xs px-1.5 py-1 sm:px-2 sm:py-1.5 rounded-lg border-[2px] border-gray-900 font-extrabold bg-white text-gray-700 h-auto">
              <option value="">剩余库存</option>
              <option value="tail">尾货</option>
              <option value="low">不足5手</option>
              <option value="mid">5手以上</option>
              <option value="high">10手以上</option>
            </select>
            <select value={valueFilter} onChange={(e) => setValueFilter(e.target.value)}
              className="text-[10px] sm:text-xs px-1.5 py-1 sm:px-2 sm:py-1.5 rounded-lg border-[2px] border-gray-900 font-extrabold bg-white text-gray-700 h-auto">
              <option value="">库存价值</option>
              <option value="0-100">0-100</option>
              <option value="101-300">101-300</option>
              <option value="301-500">301-500</option>
              <option value="500+">500以上</option>
            </select>
          </>
        )}

        {/* 剩余筛选按钮推至最右 */}
        <div className="flex-1 lg:hidden" />

        {viewMode === "summary" && (
          <button onClick={() => setErrorFilter(!errorFilter)}
            className={`inline-flex items-center text-[10px] sm:text-xs px-1.5 py-1 sm:px-2 sm:py-1.5 rounded-lg border-[2px] font-extrabold transition-all h-auto ${
              errorFilter ? "bg-red-500 text-white border-red-500 shadow-[2px_2px_0px_0px_rgba(255,0,0,0.3)]" : "border-red-300 bg-white text-red-500 hover:bg-red-50"
            }`}>错误库存</button>
        )}
      </div>

      {/* ===== 总表 - 桌面端 ===== */}
      {viewMode === "summary" && (
        <div className="hidden lg:block overflow-x-auto">
          <div className="bg-white rounded-xl border-[3px] border-gray-900 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] overflow-hidden">
            <div className="overflow-x-auto max-h-[65vh]">
              <table className="w-full text-sm whitespace-nowrap">
                <thead className="sticky top-0 z-10 bg-gray-900 text-white">
                  <tr>
                    <th className="px-2 py-2 text-left font-extrabold">图片</th>
                    <th className="px-2 py-2 text-left font-extrabold">售卖编号</th>
                    <th className="px-1.5 py-2 text-center font-extrabold">入库</th>
                    <th className="px-1.5 py-2 text-center font-extrabold cursor-pointer hover:bg-gray-700" title="点击查看售卖明细">售出</th>
                    <th className="px-1.5 py-2 text-center font-extrabold cursor-pointer hover:bg-gray-700" title="点击查看退货明细">退货</th>
                    <th className="px-1.5 py-2 text-center font-extrabold">剩余</th>
                    {ALL_SIZES.map((s) => (<th key={s} className="px-1.5 py-2 text-center font-extrabold border-x border-gray-700">{s}</th>))}
                    <th className="px-2 py-2 text-center font-extrabold">厂家</th>
                    <th className="px-2 py-2 text-center font-extrabold">进价</th>
                    <th className="px-2 py-2 text-center font-extrabold">售价</th>
                    <th className="px-2 py-2 text-center font-extrabold">利润</th>
                    <th className="px-2 py-2 text-center font-extrabold">库存价值</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSummary.length === 0 ? (
                    <tr><td colSpan={21 + ALL_SIZES.length} className="py-8 text-center text-gray-400">暂无数据</td></tr>
                  ) : (
                    filteredSummary.map((row, idx) => {
                      const isError = hasErrorStock(row);
                      return (
                        <tr key={row.sale_id} className={`border-b border-gray-200 ${idx % 2 === 0 ? "bg-white" : "bg-gray-50"} ${isError ? "bg-red-50" : ""}`}>
                          <td className="px-2 py-2.5">
                            <HoverImage src={row.photo} alt="" />
                          </td>
                          <td className="px-2 py-2.5 font-extrabold text-gray-900">
                            <div>{row.sale_id}</div>
                            {row.name && <div className="text-xs text-gray-400 font-normal">{row.name}</div>}
                          </td>
                          <td className="px-1.5 py-2.5 text-center font-bold">{row.inbound_total}</td>
                          <td className="px-1.5 py-2.5 text-center font-bold text-green-600 cursor-pointer hover:underline hover:text-green-800"
                            onClick={() => row.sold_total > 0 && fetchDetail("sales", row.sale_id)} title="点击查看售卖明细">{row.sold_total}</td>
                          <td className="px-1.5 py-2.5 text-center font-bold text-yellow-600 cursor-pointer hover:underline hover:text-yellow-800"
                            onClick={() => row.return_total > 0 && fetchDetail("returns", row.sale_id)} title="点击查看退货明细">{row.return_total}</td>
                          <td className="px-1.5 py-2.5 text-center font-extrabold text-blue-600">{row.remaining}</td>
                          {ALL_SIZES.map((s) => {
                            const val = Number(row[`size_${s}`]) || 0;
                            return (<td key={s} className={`px-1.5 py-2.5 text-center font-bold text-xs border-x border-gray-200 ${val < 0 ? "text-red-500 bg-red-100" : val > 0 ? "text-gray-900" : "text-gray-300"}`}>{val}</td>);
                          })}
                          <td className="px-2 py-2.5 text-center font-bold text-xs text-gray-600">{row.manufacturer || "-"}</td>
                          <td className="px-2 py-2.5 text-center font-bold text-xs text-gray-700">¥{fmt(row.cost_price)}</td>
                          <td className="px-2 py-2.5 text-center font-bold text-xs text-red-500">¥{fmt(row.sell_price)}</td>
                          <td className="px-2 py-2.5 text-center font-extrabold text-red-500">¥{fmt(row.profits)}</td>
                          <td className="px-2 py-2.5 text-center font-bold text-gray-700">¥{fmt(row.inventory_value)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===== 售出表 - 桌面端 ===== */}
      {viewMode === "sales" && (
        <div className="hidden lg:block overflow-x-auto">
          <div className="bg-white rounded-xl border-[3px] border-gray-900 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] overflow-hidden">
            <div className="overflow-x-auto max-h-[65vh]">
              <table className="w-full text-sm whitespace-nowrap">
                <thead className="sticky top-0 z-10 bg-gray-900 text-white">
                  <tr>
                    <th className="px-2 py-2 text-left font-extrabold">图片</th>
                    <th className="px-2 py-2 text-left font-extrabold">售卖编号</th>
                    <th className="px-1.5 py-2 text-center font-extrabold">总售出</th>
                    {ALL_SIZES.map((s) => (<th key={s} className="px-1.5 py-2 text-center font-extrabold border-x border-gray-700">{s}</th>))}
                    <th className="px-2 py-2 text-center font-extrabold">售价</th>
                    <th className="px-2 py-2 text-center font-extrabold">进价</th>
                    <th className="px-2 py-2 text-center font-extrabold">利润率</th>
                    <th className="px-2 py-2 text-center font-extrabold">最新下单时间</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSales.length === 0 ? (
                    <tr><td colSpan={7 + ALL_SIZES.length} className="py-8 text-center text-gray-400">暂无数据</td></tr>
                  ) : (
                    filteredSales.map((row, idx) => {
                      const summaryRow = data.find((r) => r.sale_id === row.sale_id);
                      const photo = row.photo || summaryRow?.photo || "";
                      const sp = row.sell_price || 0;
                      const cp = row.cost_price || 0;
                      const rate = cp > 0 ? ((sp - cp) / cp) : 0;
                      return (
                        <tr key={row.sale_id} className={`border-b border-gray-200 ${idx % 2 === 0 ? "bg-white" : "bg-gray-50"}`}>
                          <td className="px-2 py-2.5">
                            <HoverImage src={photo} alt="" />
                          </td>
                          <td className="px-2 py-2.5 font-extrabold text-gray-900">
                            <div>{row.sale_id}</div>
                            {row.name && <div className="text-xs text-gray-400 font-normal">{row.name}</div>}
                            {row.manufacturer && <div className="text-xs text-gray-300">{row.manufacturer}</div>}
                          </td>
                          <td className="px-1.5 py-2.5 text-center font-extrabold text-green-600">{row.total}</td>
                          {ALL_SIZES.map((s) => {
                            const val = Number(row[`size_${s}`]) || 0;
                            return (<td key={s} className={`px-1.5 py-2.5 text-center font-bold text-xs border-x border-gray-200 ${val > 0 ? "text-gray-900" : "text-gray-300"}`}>{val || "-"}</td>);
                          })}
                          <td className="px-2 py-2.5 text-center font-bold text-xs text-red-500">¥{fmt(sp)}</td>
                          <td className="px-2 py-2.5 text-center font-bold text-xs text-gray-700">¥{fmt(cp)}</td>
                          <td className={`px-2 py-2.5 text-center font-bold text-xs ${rate >= 0 ? "text-green-600" : "text-red-500"}`}>{pct(rate)}</td>
                          <td className="px-2 py-2.5 text-center text-xs text-gray-500">
                            {row.last_order_time ? new Date(row.last_order_time).toLocaleDateString("zh-CN") : "-"}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===== 退货表 - 桌面端 ===== */}
      {viewMode === "returns" && (
        <div className="hidden lg:block overflow-x-auto">
          <div className="bg-white rounded-xl border-[3px] border-gray-900 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] overflow-hidden">
            <div className="overflow-x-auto max-h-[65vh]">
              <table className="w-full text-sm whitespace-nowrap">
                <thead className="sticky top-0 z-10 bg-gray-900 text-white">
                  <tr>
                    <th className="px-2 py-2 text-left font-extrabold">图片</th>
                    <th className="px-2 py-2 text-left font-extrabold">售卖编号</th>
                    <th className="px-1.5 py-2 text-center font-extrabold">总退货</th>
                    {ALL_SIZES.map((s) => (<th key={s} className="px-1.5 py-2 text-center font-extrabold border-x border-gray-700">{s}</th>))}
                    <th className="px-2 py-2 text-center font-extrabold">退货率</th>
                    <th className="px-2 py-2 text-center font-extrabold">最新退货时间</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredReturns.length === 0 ? (
                    <tr><td colSpan={5 + ALL_SIZES.length} className="py-8 text-center text-gray-400">暂无数据</td></tr>
                  ) : (
                    filteredReturns.map((row, idx) => {
                      const summaryRow = data.find((r) => r.sale_id === row.sale_id);
                      const photo = summaryRow?.photo || "";
                      const soldTotal = summaryRow?.sold_total || 0;
                      const returnRate = soldTotal > 0 ? row.total / soldTotal : 0;
                      return (
                        <tr key={row.sale_id} className={`border-b border-gray-200 ${idx % 2 === 0 ? "bg-white" : "bg-gray-50"}`}>
                          <td className="px-2 py-2.5">
                            <HoverImage src={photo} alt="" />
                          </td>
                          <td className="px-2 py-2.5 font-extrabold text-gray-900">
                            <div>{row.sale_id}</div>
                            {summaryRow?.name && <div className="text-xs text-gray-400 font-normal">{summaryRow.name}</div>}
                            {summaryRow?.manufacturer && <div className="text-xs text-gray-300">{summaryRow.manufacturer}</div>}
                          </td>
                          <td className="px-1.5 py-2.5 text-center font-extrabold text-yellow-600">{row.total}</td>
                          {ALL_SIZES.map((s) => {
                            const val = Number(row[`size_${s}`]) || 0;
                            return (<td key={s} className={`px-1.5 py-2.5 text-center font-bold text-xs border-x border-gray-200 ${val > 0 ? "text-gray-900" : "text-gray-300"}`}>{val || "-"}</td>);
                          })}
                          <td className={`px-2 py-2.5 text-center font-bold text-xs ${returnRate > 0.3 ? "text-red-500" : "text-gray-700"}`}>{pct(returnRate)}</td>
                          <td className="px-2 py-2.5 text-center text-xs text-gray-500">
                            {row.last_return_time ? new Date(row.last_return_time).toLocaleDateString("zh-CN") : "-"}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===== 入库表 - 桌面端 ===== */}
      {viewMode === "inbound" && (
        <div className="hidden lg:block overflow-x-auto">
          <div className="bg-white rounded-xl border-[3px] border-gray-900 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] overflow-hidden">
            <div className="overflow-x-auto max-h-[65vh]">
              <table className="w-full text-sm whitespace-nowrap">
                <thead className="sticky top-0 z-10 bg-gray-900 text-white">
                  <tr>
                    <th className="px-2 py-2 text-left font-extrabold">图片</th>
                    <th className="px-2 py-2 text-left font-extrabold">售卖编号</th>
                    <th className="px-1.5 py-2 text-center font-extrabold">总入库</th>
                    {ALL_SIZES.map((s) => (<th key={s} className="px-1.5 py-2 text-center font-extrabold border-x border-gray-700">{s}</th>))}
                    <th className="px-2 py-2 text-center font-extrabold">进价</th>
                    <th className="px-2 py-2 text-center font-extrabold">厂家</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInbound.length === 0 ? (
                    <tr><td colSpan={5 + ALL_SIZES.length} className="py-8 text-center text-gray-400">暂无数据</td></tr>
                  ) : (
                    filteredInbound.map((row, idx) => {
                      const summaryRow = data.find((r) => r.sale_id === row.sale_id);
                      const photo = row.photo || summaryRow?.photo || "";
                      return (
                        <tr key={row.sale_id} className={`border-b border-gray-200 ${idx % 2 === 0 ? "bg-white" : "bg-gray-50"}`}>
                          <td className="px-2 py-2.5">
                            <HoverImage src={photo} alt="" />
                          </td>
                          <td className="px-2 py-2.5 font-extrabold text-gray-900">
                            <div>{row.sale_id}</div>
                            {row.name && <div className="text-xs text-gray-400 font-normal">{row.name}</div>}
                            {row.manufacturer && <div className="text-xs text-gray-300">{row.manufacturer}</div>}
                          </td>
                          <td className="px-1.5 py-2.5 text-center font-extrabold text-blue-600">{row.total}</td>
                          {ALL_SIZES.map((s) => {
                            const val = Number(row[`size_${s}`]) || 0;
                            return (<td key={s} className={`px-1.5 py-2.5 text-center font-bold text-xs border-x border-gray-200 ${val > 0 ? "text-gray-900" : "text-gray-300"}`}>{val || "-"}</td>);
                          })}
                          <td className="px-2 py-2.5 text-center font-bold text-xs text-gray-700">¥{fmt(row.cost_price || 0)}</td>
                          <td className="px-2 py-2.5 text-center font-bold text-xs text-gray-600">{row.manufacturer || "-"}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===== 移动端卡片 ===== */}
      <div className="lg:hidden space-y-3">
        {/* 总表移动端 */}
        {viewMode === "summary" && (
          <>
            {filteredSummary.length === 0 ? (
              <div className="text-center py-12 text-gray-400">暂无数据</div>
            ) : (
              filteredSummary.map((row) => {
                const isError = hasErrorStock(row);
                return (
                  <div key={row.sale_id} className={`bg-white rounded-xl border-[3px] shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] p-2.5 ${isError ? "border-red-400" : "border-gray-900"}`}>
                    <div className="flex gap-3 mb-2">
                      <div className="w-48 h-48 rounded-lg border-2 border-gray-200 overflow-hidden bg-gray-100 shrink-0">
                        {row.photo ? <img src={row.photo} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Package className="h-20 w-20 text-gray-300" /></div>}
                      </div>
                      <div className="flex-1 min-w-0 flex flex-col justify-between">
                        <div>
                          <div className="text-sm font-extrabold text-gray-900 truncate">{row.sale_id}</div>
                          {row.name && <div className="text-xs text-gray-500 truncate">{row.name}</div>}
                          {row.manufacturer && <div className="text-[10px] text-gray-400">{row.manufacturer}</div>}
                        </div>
                        <div className="grid grid-cols-2 gap-1">
                          <div className="text-center bg-gray-50 rounded p-1 border border-gray-200">
                            <div className="text-[9px] text-gray-400">入库</div>
                            <div className="text-[10px] font-extrabold">{row.inbound_total}</div>
                          </div>
                          <div className="text-center bg-blue-50 rounded p-1 border border-blue-200">
                            <div className="text-[9px] text-gray-400">剩余</div>
                            <div className="text-[10px] font-extrabold text-blue-600">{row.remaining}</div>
                          </div>
                          <div className="text-center bg-green-50 rounded p-1 border border-green-200 cursor-pointer"
                            onClick={() => row.sold_total > 0 && fetchDetail("sales", row.sale_id)}>
                            <div className="text-[9px] text-gray-400">售出</div>
                            <div className="text-[10px] font-extrabold text-green-600">{row.sold_total}</div>
                          </div>
                          <div className="text-center bg-yellow-50 rounded p-1 border border-yellow-200 cursor-pointer"
                            onClick={() => row.return_total > 0 && fetchDetail("returns", row.sale_id)}>
                            <div className="text-[9px] text-gray-400">退货</div>
                            <div className="text-[10px] font-extrabold text-yellow-600">{row.return_total}</div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 尺码 - 一排横向展示 */}
                    <div className="flex flex-wrap gap-1 mb-1.5">
                      {ALL_SIZES.map((s) => {
                        const val = Number(row[`size_${s}`]) || 0;
                        return (
                          <span key={s} className={`text-[10px] px-1.5 py-0.5 rounded border font-bold shrink-0 ${
                            val < 0 ? "bg-red-50 border-red-300 text-red-600" :
                            val > 0 ? "bg-gray-100 border-gray-300 text-gray-700" :
                            "bg-white border-gray-200 text-gray-300"
                          }`}>{s}:{val}</span>
                        );
                      })}
                    </div>

                    <div className="flex justify-between text-[10px] pt-1.5 border-t border-gray-200">
                      <div className="flex items-center gap-2">
                        {row.manufacturer && <span className="text-gray-500">{row.manufacturer}</span>}
                        <span className="text-gray-400">进价: <span className="font-bold text-gray-700">¥{fmt(row.cost_price)}</span></span>
                        <span className="text-gray-400">售价: <span className="font-bold text-red-500">¥{fmt(row.sell_price)}</span></span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-red-500">利润: ¥{fmt(row.profits)}</span>
                        {row.shelf_no && <span className="text-gray-400">{row.shelf_no}</span>}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </>
        )}

        {/* 售出表移动端 */}
        {viewMode === "sales" && (
          <>
            {filteredSales.length === 0 ? (
              <div className="text-center py-12 text-gray-400">暂无数据</div>
            ) : (
              filteredSales.map((row) => {
                const summaryRow = data.find((r) => r.sale_id === row.sale_id);
                const photo = row.photo || summaryRow?.photo || "";
                const sp = row.sell_price || 0;
                const cp = row.cost_price || 0;
                const rate = cp > 0 ? ((sp - cp) / cp) : 0;
                return (
                  <div key={row.sale_id} className="bg-white rounded-xl border-[3px] border-gray-900 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] p-2.5">
                    <div className="flex gap-3 mb-2">
                      <div className="w-48 h-48 rounded-lg border-2 border-gray-200 overflow-hidden bg-gray-100 shrink-0">
                        {photo ? <img src={photo} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Package className="h-20 w-20 text-gray-300" /></div>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-extrabold text-gray-900 truncate">{row.sale_id}</div>
                        {row.name && <div className="text-xs text-gray-500 truncate">{row.name}</div>}
                        {row.manufacturer && <div className="text-[10px] text-gray-400">{row.manufacturer}</div>}
                        <div className="mt-1 text-center bg-green-50 rounded p-1.5 border border-green-200">
                          <div className="text-[9px] text-gray-400">总售出</div>
                          <div className="text-sm font-extrabold text-green-600">{row.total}</div>
                        </div>
                        <div className="flex gap-2 mt-1 text-[10px]">
                          <span className="text-gray-400">售价: <span className="font-bold text-red-500">¥{fmt(sp)}</span></span>
                          <span className="text-gray-400">进价: <span className="font-bold text-gray-700">¥{fmt(cp)}</span></span>
                          <span className={`font-bold ${rate >= 0 ? "text-green-600" : "text-red-500"}`}>利润率: {pct(rate)}</span>
                        </div>
                        {row.last_order_time && (
                          <div className="text-[10px] text-gray-400 mt-0.5">
                            下单: {new Date(row.last_order_time).toLocaleDateString("zh-CN")}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1 mb-1.5">
                      {ALL_SIZES.map((s) => {
                        const val = Number(row[`size_${s}`]) || 0;
                        return (
                          <span key={s} className={`text-[10px] px-1.5 py-0.5 rounded border font-bold shrink-0 ${
                            val > 0 ? "bg-gray-100 border-gray-300 text-gray-700" : "bg-white border-gray-200 text-gray-300"
                          }`}>{s}:{val || "-"}</span>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </>
        )}

        {/* 退货表移动端 */}
        {viewMode === "returns" && (
          <>
            {filteredReturns.length === 0 ? (
              <div className="text-center py-12 text-gray-400">暂无数据</div>
            ) : (
              filteredReturns.map((row) => {
                const summaryRow = data.find((r) => r.sale_id === row.sale_id);
                const photo = summaryRow?.photo || "";
                const soldTotal = summaryRow?.sold_total || 0;
                const returnRate = soldTotal > 0 ? row.total / soldTotal : 0;
                return (
                  <div key={row.sale_id} className="bg-white rounded-xl border-[3px] border-gray-900 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] p-2.5">
                    <div className="flex gap-3 mb-2">
                      <div className="w-48 h-48 rounded-lg border-2 border-gray-200 overflow-hidden bg-gray-100 shrink-0">
                        {photo ? <img src={photo} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Package className="h-20 w-20 text-gray-300" /></div>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-extrabold text-gray-900 truncate">{row.sale_id}</div>
                        {summaryRow?.name && <div className="text-xs text-gray-500 truncate">{summaryRow.name}</div>}
                        {summaryRow?.manufacturer && <div className="text-[10px] text-gray-400">{summaryRow.manufacturer}</div>}
                        <div className="mt-1 text-center bg-yellow-50 rounded p-1.5 border border-yellow-200">
                          <div className="text-[9px] text-gray-400">总退货</div>
                          <div className="text-sm font-extrabold text-yellow-600">{row.total}</div>
                        </div>
                        <div className="flex gap-2 mt-1 text-[10px]">
                          <span className={`font-bold ${returnRate > 0.3 ? "text-red-500" : "text-gray-700"}`}>退货率: {pct(returnRate)}</span>
                        </div>
                        {row.last_return_time && (
                          <div className="text-[10px] text-gray-400 mt-0.5">
                            退货: {new Date(row.last_return_time).toLocaleDateString("zh-CN")}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1 mb-1.5">
                      {ALL_SIZES.map((s) => {
                        const val = Number(row[`size_${s}`]) || 0;
                        return (
                          <span key={s} className={`text-[10px] px-1.5 py-0.5 rounded border font-bold shrink-0 ${
                            val > 0 ? "bg-gray-100 border-gray-300 text-gray-700" : "bg-white border-gray-200 text-gray-300"
                          }`}>{s}:{val || "-"}</span>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </>
        )}

        {/* 入库表移动端 */}
        {viewMode === "inbound" && (
          <>
            {filteredInbound.length === 0 ? (
              <div className="text-center py-12 text-gray-400">暂无数据</div>
            ) : (
              filteredInbound.map((row) => {
                const summaryRow = data.find((r) => r.sale_id === row.sale_id);
                const photo = row.photo || summaryRow?.photo || "";
                return (
                  <div key={row.sale_id} className="bg-white rounded-xl border-[3px] border-gray-900 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] p-2.5">
                    <div className="flex gap-3 mb-2">
                      <div className="w-48 h-48 rounded-lg border-2 border-gray-200 overflow-hidden bg-gray-100 shrink-0">
                        {photo ? <img src={photo} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Package className="h-20 w-20 text-gray-300" /></div>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-extrabold text-gray-900 truncate">{row.sale_id}</div>
                        {row.name && <div className="text-xs text-gray-500 truncate">{row.name}</div>}
                        {row.manufacturer && <div className="text-[10px] text-gray-400">{row.manufacturer}</div>}
                        <div className="mt-1 text-center bg-blue-50 rounded p-1.5 border border-blue-200">
                          <div className="text-[9px] text-gray-400">总入库</div>
                          <div className="text-sm font-extrabold text-blue-600">{row.total}</div>
                        </div>
                        <div className="flex gap-2 mt-1 text-[10px]">
                          <span className="text-gray-500">进价: <span className="font-bold text-gray-700">¥{fmt(row.cost_price || 0)}</span></span>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1 mb-1.5">
                      {ALL_SIZES.map((s) => {
                        const val = Number(row[`size_${s}`]) || 0;
                        return (
                          <span key={s} className={`text-[10px] px-1.5 py-0.5 rounded border font-bold shrink-0 ${
                            val > 0 ? "bg-gray-100 border-gray-300 text-gray-700" : "bg-white border-gray-200 text-gray-300"
                          }`}>{s}:{val || "-"}</span>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </>
        )}
      </div>

      {/* 明细弹窗 */}
      {detailType && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={closeDetail}>
          <div className="bg-white rounded-2xl border-[3px] border-gray-900 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] max-w-2xl w-full max-h-[80vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b-2 border-gray-200">
              <h3 className="text-base font-extrabold">
                {detailType === "sales" ? "售卖明细" : "退货明细"} - {detailSaleId}
              </h3>
              <button onClick={closeDetail} className="flex h-8 w-8 items-center justify-center rounded-lg border-2 border-gray-900 bg-white hover:bg-gray-100">
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
                          {r.order_time || r.created_at ? new Date((r.order_time || r.created_at)!).toLocaleString("zh-CN") : "-"}
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
    </PageWrapper>
  );
}