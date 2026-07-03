"use client";

import { useState, useEffect, useMemo, useDeferredValue } from "react";
import { Search, Package, TrendingUp, TrendingDown, DollarSign, Warehouse, X, ArrowDown, Edit3, Download, Save, Check, RefreshCw, ChevronDown, Plus, Minus, ShoppingCart, AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";
import { PageWrapper } from "@/components/page-wrapper";
import { authFetch } from "@/lib/auth-fetch";

const ALL_SIZES = [80, 90, 95, 100, 105, 110, 120, 130, 140, 150, 160, 170, 180] as const;
const DEFAULT_LAYERS = [1, 2, 3, 4, 5];
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
  season?: string;
  style_category?: string;
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
  return_time?: string;
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
  // 防抖后的搜索词，避免每次按键触发全量重渲染
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 100;

  // 筛选
  const [stockFilter, setStockFilter] = useState<string>("");
  const [valueFilter, setValueFilter] = useState<string>("");
  const [errorFilter, setErrorFilter] = useState(false);
  const [uninboundFilter, setUninboundFilter] = useState(false);

  // 明细弹窗
  const [detailType, setDetailType] = useState<"sales" | "returns" | null>(null);
  const [detailSaleId, setDetailSaleId] = useState("");
  const [detailRecords, setDetailRecords] = useState<DetailRecord[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // 编辑模式
  const [salesEditMode, setSalesEditMode] = useState(false);
  const [returnsEditMode, setReturnsEditMode] = useState(false);
  const [inboundEditMode, setInboundEditMode] = useState(false);
  const [editSaveMsg, setEditSaveMsg] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // 日期筛选
  const [salesDateFilter, setSalesDateFilter] = useState("");
  const [returnsDateFilter, setReturnsDateFilter] = useState("");
  const [salesDates, setSalesDates] = useState<string[]>([]);
  const [returnsDates, setReturnsDates] = useState<string[]>([]);
  const [salesDateIds, setSalesDateIds] = useState<Set<string>>(new Set());
  const [returnsDateIds, setReturnsDateIds] = useState<Set<string>>(new Set());

  // 导出
  const [exportModal, setExportModal] = useState(false);
  const [exportFields, setExportFields] = useState<Set<string>>(new Set(["sale_id", "name", "manufacturer", "shelf_no", "cost_price", "season", "style_category", "notes", "inbound_date", "total_stock", "80", "90", "95", "100", "105", "110", "120", "130", "140", "150", "160", "170", "180"]));
  // 移动端展开卡片
  const [expandedMobileCard, setExpandedMobileCard] = useState<string | null>(null);
  // 移动端入库编辑弹窗
  const [mobileEditModal, setMobileEditModal] = useState<{ sale_id: string; photo: string; name: string; manufacturer: string; shelf_no: string; season: string; style_category: string } | null>(null);
  const [mobileShelfL1, setMobileShelfL1] = useState("");
  const [mobileShelfL2, setMobileShelfL2] = useState("");
  const [mobileShelfL3, setMobileShelfL3] = useState("");
  // 售出/退货编辑悬浮窗
  const [salesEditModal, setSalesEditModal] = useState<string | null>(null);
  const [returnsEditModal, setReturnsEditModal] = useState<string | null>(null);
  const [editSizeValues, setEditSizeValues] = useState<Record<number, number>>({});
  // 售价/退货价下拉展开
  const [expandedPriceRow, setExpandedPriceRow] = useState<string | null>(null);
  const [imgPreview, setImgPreview] = useState<string | null>(null);

  // 入库编辑下拉选项（从设置加载）
  const [editManufacturers, setEditManufacturers] = useState<string[]>(["大炳家", "小礼物", "海燕家", "曾姐姐", "程祥家", "老刘家"]);
  const [editShelfData, setEditShelfData] = useState<Record<string, number[]>>({ A: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], B: [1, 2], C: [1, 2, 3, 4, 5] });
  const [editSeasonCategories] = useState<string[]>(["春季", "夏季", "秋季", "冬季", "四季通用"]);
  const [editSizeStyles, setEditSizeStyles] = useState<string[]>(["T恤", "裤子", "裙子", "外套", "卫衣", "套装", "连体衣", "羽绒服", "衬衫", "内衣", "其他"]);
  const [editNoSizeStyles, setEditNoSizeStyles] = useState<string[]>(["母婴", "日用", "配饰"]);

  useEffect(() => { fetchSummary(); }, []);
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        if (data.manufacturers && Array.isArray(data.manufacturers)) setEditManufacturers(data.manufacturers);
        if (data.shelf_data && typeof data.shelf_data === "object") setEditShelfData(data.shelf_data as Record<string, number[]>);
        if (data.size_styles && Array.isArray(data.size_styles)) setEditSizeStyles(data.size_styles);
        if (data.no_size_styles && Array.isArray(data.no_size_styles)) setEditNoSizeStyles(data.no_size_styles);
      })
      .catch(() => {});
  }, []);

  // 搜索防抖：300ms
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  // 切换视图/筛选时重置分页
  useEffect(() => { setPage(1); }, [viewMode, stockFilter, valueFilter, errorFilter, uninboundFilter, salesDateFilter, returnsDateFilter]);

  // 日期筛选时获取对应 sale_ids
  useEffect(() => {
    if (!salesDateFilter) { setSalesDateIds(new Set()); return; }
    fetch(`/api/sales-dates?type=sales&date=${salesDateFilter}`)
      .then(r => r.json())
      .then(data => setSalesDateIds(new Set(data.sale_ids || [])))
      .catch(() => setSalesDateIds(new Set()));
  }, [salesDateFilter]);

  useEffect(() => {
    if (!returnsDateFilter) { setReturnsDateIds(new Set()); return; }
    fetch(`/api/sales-dates?type=returns&date=${returnsDateFilter}`)
      .then(r => r.json())
      .then(data => setReturnsDateIds(new Set(data.sale_ids || [])))
      .catch(() => setReturnsDateIds(new Set()));
  }, [returnsDateFilter]);

  // 生成所有货架号选项
  const editShelfOptions = useMemo(() => {
    const options: string[] = [];
    const layers = [1, 2, 3, 4, 5];
    for (const [row, nums] of Object.entries(editShelfData)) {
      for (const num of nums) {
        for (const layer of layers) {
          options.push(`${row}-${num}-${layer}`);
        }
      }
    }
    return options.sort();
  }, [editShelfData]);

  // 所有款式选项（合并含尺码和不含尺码）
  const editStyleOptions = useMemo(() => {
    return [...editSizeStyles, ...editNoSizeStyles].sort();
  }, [editSizeStyles, editNoSizeStyles]);

  const syncSummary = async () => {
    setSyncing(true);
    setEditSaveMsg("");
    try {
      const res = await authFetch("/api/sync-summary", { method: "POST" });
      const result = await res.json();
      if (result.error) {
        setEditSaveMsg("同步失败: " + result.error);
      } else {
        const diag = result.diagnostics ? ` (${result.diagnostics.join("; ")})` : "";
        setEditSaveMsg(`同步完成: 售出${result.sales_synced}款, 退货${result.returns_synced}款${diag}`);
        fetchSummary();
        fetchSalesAgg();
        fetchReturnAgg();
      }
    } catch {
      setEditSaveMsg("同步失败");
    } finally {
      setSyncing(false);
    }
  };

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
      const res = await fetch("/api/sales-summary");
      const all = await res.json();
      if (!Array.isArray(all) || all.length === 0) { setSalesData([]); return; }
      const result = all.map((row: Record<string, unknown>) => {
        const agg: Record<string, unknown> & { total: number } = {
          sale_id: (row.sale_id as string) || "",
          total: (row.total_sold as number) || 0,
          name: (row.name as string) || "",
          manufacturer: (row.manufacturer as string) || "",
          photo: (row.photo as string) || "",
          shelf_no: (row.shelf_no as string) || "",
          sell_price: 0,
          cost_price: (row.cost_price as number) || 0,
          total_revenue: (row.total_revenue as number) || 0,
          last_order_time: "",
          sell_price_info: row.sell_price_info || {},
          sales_count: row.sales_count || 0,
        };
        // 解析各尺码
        for (const s of ALL_SIZES) {
          agg[`size_${s}`] = Number(row[`size_${s}`]) || 0;
        }
        // 解析 sell_price_info 的售价
        const info = row.sell_price_info as Record<string, string> | undefined;
        if (info) {
          const prices = Object.keys(info).map(Number).filter((p) => p > 0);
          if (prices.length > 0) {
            agg.sell_price = prices[0]; // 最低售价
          }
          // 取最新下单时间
          const times = Object.values(info).filter(Boolean);
          if (times.length > 0) {
            agg.last_order_time = times.sort().reverse()[0];
          }
        }
        return agg as AggRow;
      });
      setSalesData(result);
    } catch { setSalesData([]); }
  };

  const fetchReturnAgg = async () => {
    try {
      const res = await fetch("/api/returns-summary");
      const all = await res.json();
      if (!Array.isArray(all) || all.length === 0) { setReturnData([]); return; }
      const result = all.map((row: Record<string, unknown>) => {
        const agg: Record<string, unknown> & { total: number } = {
          sale_id: (row.sale_id as string) || "",
          total: (row.total_returned as number) || 0,
          name: (row.name as string) || "",
          manufacturer: (row.manufacturer as string) || "",
          photo: (row.photo as string) || "",
          shelf_no: (row.shelf_no as string) || "",
          return_price: 0,
          total_return_amount: (row.total_return_amount as number) || 0,
          last_return_time: "",
          return_price_info: row.return_price_info || {},
          return_count: row.return_count || 0,
        };
        // 解析各尺码
        for (const s of ALL_SIZES) {
          agg[`size_${s}`] = Number(row[`size_${s}`]) || 0;
        }
        // 解析 return_price_info 的退货价
        const info = row.return_price_info as Record<string, string> | undefined;
        if (info) {
          const prices = Object.keys(info).map(Number).filter((p) => p > 0);
          if (prices.length > 0) {
            agg.return_price = prices[0]; // 最低退货价
          }
          // 取最新退货时间
          const times = Object.values(info).filter(Boolean);
          if (times.length > 0) {
            agg.last_return_time = times.sort().reverse()[0];
          }
        }
        return agg as AggRow;
      });
      setReturnData(result);
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
            season: row.season || "", style_category: row.style_category || "",
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

  const fetchSalesDates = async () => {
    try {
      const res = await fetch("/api/sales-dates?type=sales");
      const data = await res.json();
      setSalesDates(data.dates || []);
    } catch { setSalesDates([]); }
  };

  const fetchReturnsDates = async () => {
    try {
      const res = await fetch("/api/sales-dates?type=returns");
      const data = await res.json();
      setReturnsDates(data.dates || []);
    } catch { setReturnsDates([]); }
  };

  const switchView = (mode: ViewMode) => {
    setViewMode(mode);
    setSearch("");
    setStockFilter("");
    setValueFilter("");
    setErrorFilter(false);
    if (mode === "sales") { fetchSalesAgg(); fetchSalesDates(); fetchInboundAgg(); }
    if (mode === "returns") { fetchReturnAgg(); fetchReturnsDates(); }
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

  // 保存售出/退货编辑（按 sale_id + size 修改数量）
  const saveEdit = async (type: "sales" | "returns", saleId: string, size: number, quantity: number) => {
    setEditSaving(true);
    setEditSaveMsg("");
    try {
      const endpoint = type === "sales" ? "/api/sales-records" : "/api/return-records";
      const res = await fetch(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sale_id: saleId, size, quantity }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "更新失败");
      setEditSaveMsg(`已保存: ${saleId} 尺码${size} → ${quantity}`);
      // 刷新数据
      if (type === "sales") { fetchSalesAgg(); fetchSalesDates(); }
      else { fetchReturnAgg(); fetchReturnsDates(); }
      fetchSummary();
    } catch (err) {
      setEditSaveMsg(`保存失败: ${err instanceof Error ? err.message : "未知错误"}`);
    } finally {
      setEditSaving(false);
      setTimeout(() => setEditSaveMsg(""), 3000);
    }
  };

  // 保存入库编辑
  const saveInboundEdit = async (saleId: string, fields: Record<string, string | number>) => {
    setEditSaving(true);
    setEditSaveMsg("");
    try {
      const res = await fetch("/api/inbound-records", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sale_id: saleId, ...fields }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "更新失败");
      setEditSaveMsg(`已保存: ${saleId}`);
      fetchInboundAgg();
      fetchSummary();
    } catch (err) {
      setEditSaveMsg(`保存失败: ${err instanceof Error ? err.message : "未知错误"}`);
    } finally {
      setEditSaving(false);
      setTimeout(() => setEditSaveMsg(""), 3000);
    }
  };

  // 导出入库数据
  const handleExport = () => {
    const rows = filteredInbound;
    const fields = Array.from(exportFields);
    if (fields.length === 0 || rows.length === 0) return;

    const headers = fields.map((f) => {
      if (f === "sale_id") return "售卖编号";
      if (f === "name") return "商品名称";
      if (f === "manufacturer") return "厂家";
      if (f === "shelf_no") return "货架号";
      if (f === "cost_price") return "进价";
      if (f === "season") return "季节";
      if (f === "style_category") return "款式分类";
      if (f === "notes") return "备注";
      if (f === "inbound_date") return "入库日期";
      if (f === "total_stock") return "总库存";
      if (/^\d+$/.test(f)) return `尺码${f}`;
      return f;
    });

    const csvRows = [headers.join(",")];
    for (const row of rows) {
      const values = fields.map((f) => {
        if (/^\d+$/.test(f)) {
          return String(row[`size_${f}`] || 0);
        }
        if (f === "total_stock") return String(row.total || 0);
        const val = (row as Record<string, unknown>)[f];
        if (val === null || val === undefined) return "";
        const str = String(val);
        // 包含逗号或引号则转义
        return str.includes(",") || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
      });
      csvRows.push(values.join(","));
    }

    const bom = "\uFEFF";
    const blob = new Blob([bom + csvRows.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    a.href = url;
    a.download = `入库数据_${dateStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setExportModal(false);
  };

  // 获取下拉选项
  const manufacturerOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of inboundData) if (r.manufacturer) set.add(r.manufacturer);
    return Array.from(set).sort();
  }, [inboundData]);

  const seasonOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of inboundData) if ((r as Record<string, unknown>).season) set.add((r as Record<string, unknown>).season as string);
    return Array.from(set).sort();
  }, [inboundData]);

  const styleOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of inboundData) if ((r as Record<string, unknown>).style_category) set.add((r as Record<string, unknown>).style_category as string);
    return Array.from(set).sort();
  }, [inboundData]);

  const sizeKindCount = (row: SummaryRow) => ALL_SIZES.filter((s) => Number(row[`size_${s}`]) > 0).length;
  const minSizeQty = (row: SummaryRow) => {
    const vals = ALL_SIZES.map((s) => Number(row[`size_${s}`])).filter((v) => v > 0);
    return vals.length > 0 ? Math.min(...vals) : 0;
  };
  const hasErrorStock = (row: SummaryRow) => ALL_SIZES.some((s) => Number(row[`size_${s}`]) < 0);

  // ===== 筛选逻辑（使用防抖后的 debouncedSearch）=====
  const filteredSummary = useMemo(() => {
    let result = data;
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.trim().toLowerCase();
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
  }, [data, debouncedSearch, stockFilter, valueFilter, errorFilter]);

  const filteredSales = useMemo(() => {
    let result = salesData;
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.trim().toLowerCase();
      result = result.filter((r) => r.sale_id.toLowerCase().includes(q) || (r.name && r.name.toLowerCase().includes(q)));
    }
    if (salesDateFilter && salesDateIds.size > 0) {
      result = result.filter((r) => salesDateIds.has(r.sale_id));
    }
    // 未入库筛选：售出总表中存在但入库表中不存在的记录
    if (uninboundFilter) {
      const inboundIds = new Set(inboundData.map((r) => r.sale_id.toUpperCase()));
      result = result.filter((r) => !inboundIds.has(r.sale_id.toUpperCase()));
    }
    return result;
  }, [salesData, debouncedSearch, salesDateFilter, salesDateIds, uninboundFilter, inboundData]);

  const filteredReturns = useMemo(() => {
    let result = returnData;
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.trim().toLowerCase();
      result = result.filter((r) => r.sale_id.toLowerCase().includes(q));
    }
    if (returnsDateFilter && returnsDateIds.size > 0) {
      result = result.filter((r) => returnsDateIds.has(r.sale_id));
    }
    return result;
  }, [returnData, debouncedSearch, returnsDateFilter, returnsDateIds]);

  const filteredInbound = useMemo(() => {
    let result = inboundData;
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.trim().toLowerCase();
      result = result.filter((r) => r.sale_id.toLowerCase().includes(q) || (r.name && r.name.toLowerCase().includes(q)));
    }
    return result;
  }, [inboundData, debouncedSearch]);

  // ===== Map 索引：消除 data.find() 的 O(n²) 查找 =====
  const summaryBySaleId = useMemo(() => {
    const m = new Map<string, SummaryRow>();
    for (const r of data) m.set(r.sale_id, r);
    return m;
  }, [data]);

  // ===== 入库视图汇总（移出内联 reduce）=====
  const inboundTotals = useMemo(() => {
    let totalInbound = 0;
    let totalValue = 0;
    for (const r of filteredInbound) {
      totalInbound += r.total || 0;
      totalValue += (r.total || 0) * (r.cost_price || 0);
    }
    return { totalInbound, totalValue };
  }, [filteredInbound]);

  // ===== 分页数据（每页 100 条，避免一次性渲染上万 DOM 节点）=====
  // 用 useDeferredValue 延迟 page 和 viewMode，让 tab 切换/翻页按钮立即响应，
  // 表格内容在低优先级渲染，避免 2500 个带硬偏移 shadow 的单元格阻塞主线程
  const deferredPage = useDeferredValue(page);
  const deferredViewMode = useDeferredValue(viewMode);

  const pagedSummary = useMemo(() => {
    const start = (deferredPage - 1) * PAGE_SIZE;
    return filteredSummary.slice(start, start + PAGE_SIZE);
  }, [filteredSummary, deferredPage]);

  const pagedSales = useMemo(() => {
    const start = (deferredPage - 1) * PAGE_SIZE;
    return filteredSales.slice(start, start + PAGE_SIZE);
  }, [filteredSales, deferredPage]);

  const pagedReturns = useMemo(() => {
    const start = (deferredPage - 1) * PAGE_SIZE;
    return filteredReturns.slice(start, start + PAGE_SIZE);
  }, [filteredReturns, deferredPage]);

  const pagedInbound = useMemo(() => {
    const start = (deferredPage - 1) * PAGE_SIZE;
    return filteredInbound.slice(start, start + PAGE_SIZE);
  }, [filteredInbound, deferredPage]);

  const totalPages = useMemo(() => {
    switch (viewMode) {
      case "summary": return Math.max(1, Math.ceil(filteredSummary.length / PAGE_SIZE));
      case "sales": return Math.max(1, Math.ceil(filteredSales.length / PAGE_SIZE));
      case "returns": return Math.max(1, Math.ceil(filteredReturns.length / PAGE_SIZE));
      case "inbound": return Math.max(1, Math.ceil(filteredInbound.length / PAGE_SIZE));
      default: return 1;
    }
  }, [viewMode, filteredSummary.length, filteredSales.length, filteredReturns.length, filteredInbound.length]);

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
  const salesTotals = useMemo(() => {
    let totalSold = 0;
    let profit = 0;
    for (const r of filteredSales) {
      const cp = (r.cost_price as number) || 0;
      const total = r.total || 0;
      const revenue = (r.total_revenue as number) || ((r.sell_price as number) || 0) * total;
      totalSold += total;
      profit += revenue - cp * total;
    }
    let totalReturned = 0;
    let returnLoss = 0;
    for (const r of filteredReturns) {
      totalReturned += r.total || 0;
      returnLoss += (r.total_return_amount || 0);
    }
    return {
      orderCount: filteredSales.length,
      totalSold,
      totalProfit: profit,
      netProfit: profit - returnLoss,
    };
  }, [filteredSales, filteredReturns]);

  const returnTotals = useMemo(() => ({
    orderCount: filteredReturns.length,
    totalReturned: filteredReturns.reduce((s, r) => s + (r.total || 0), 0),
    loss: filteredReturns.reduce((sum, r) => sum + (r.total_return_amount || 0), 0),
  }), [filteredReturns]);

  const shelfRows = useMemo(() => getShelfRows(data), [data]);

  const fmt = (n: number) => n.toFixed(2);
  const pct = (n: number) => (n * 100).toFixed(1) + "%";

  // 跳转到入库登记页面，预填售出记录中的信息
  const router = useRouter();
  const jumpToInbound = (row: AggRow) => {
    const sizePairs: string[] = [];
    for (const s of ALL_SIZES) {
      const val = Number(row[`size_${s}`]) || 0;
      if (val > 0) sizePairs.push(`${s}:${val}`);
    }
    const params = new URLSearchParams();
    params.set("sale_id", row.sale_id);
    if (sizePairs.length > 0) params.set("sizes", sizePairs.join(","));
    router.push(`/operations/inbound?${params.toString()}`);
  };

  const viewTitle = viewMode === "summary" ? "商品管理总表" : viewMode === "sales" ? "售卖明细表" : viewMode === "returns" ? "退货明细表" : "入库登记清单";
  const viewTitleShort = viewMode === "summary" ? "总表" : viewMode === "sales" ? "售出" : viewMode === "returns" ? "退货" : "入库";
  const highlightClass = viewMode === "summary" ? "highlight-blue" : viewMode === "sales" ? "highlight-green" : viewMode === "returns" ? "highlight-yellow" : "highlight-blue";
  const titleBgClass = viewMode === "summary" ? "bg-[#4A90E2]" : viewMode === "sales" ? "bg-green-500" : viewMode === "returns" ? "bg-yellow-500" : "bg-[#4A90E2]";

  return (
    <PageWrapper>
      {/* Header + 视图切换按钮 */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-gray-900 flex-1 min-w-0">
          <span className={`lg:hidden px-2 py-0.5 rounded text-white font-extrabold ${titleBgClass}`}>{viewTitleShort}</span>
          <span className={`hidden lg:inline ${highlightClass}`}>{viewTitle}</span>
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

      {/* 统计卡片 */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3 lg:gap-4 mb-3 sm:mb-4">
        {viewMode === "summary" && (
          <>
            <div className="bg-white rounded-xl sm:rounded-2xl border-[2px] sm:border-[3px] border-gray-900 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-2.5 sm:p-3 lg:p-4">
              <div className="flex items-center gap-1.5 sm:gap-2 mb-1 sm:mb-1.5">
                <div className="w-6 h-6 sm:w-8 sm:h-8 lg:w-10 lg:h-10 rounded-lg bg-[#4A90E2]/10 flex items-center justify-center shrink-0">
                  <Warehouse className="h-3 w-3 sm:h-4 sm:w-4 lg:h-5 lg:w-5 text-[#4A90E2]" />
                </div>
                <span className="text-[10px] sm:text-xs font-bold text-gray-500">总入库</span>
              </div>
              <div className="text-lg sm:text-xl lg:text-2xl font-extrabold text-gray-900 leading-tight">{totals.inbound_total}</div>
              <div className="text-[9px] sm:text-[10px] text-gray-400 mt-0.5">件</div>
            </div>
            <div className="bg-white rounded-xl sm:rounded-2xl border-[2px] sm:border-[3px] border-gray-900 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-2.5 sm:p-3 lg:p-4">
              <div className="flex items-center gap-1.5 sm:gap-2 mb-1 sm:mb-1.5">
                <div className="w-6 h-6 sm:w-8 sm:h-8 lg:w-10 lg:h-10 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                  <Package className="h-3 w-3 sm:h-4 sm:w-4 lg:h-5 lg:w-5 text-blue-600" />
                </div>
                <span className="text-[10px] sm:text-xs font-bold text-gray-500">剩余库存</span>
              </div>
              <div className="text-lg sm:text-xl lg:text-2xl font-extrabold text-blue-600 leading-tight">{totals.remaining}</div>
              <div className="text-[9px] sm:text-[10px] text-gray-400 mt-0.5">件</div>
            </div>
            <div className="bg-white rounded-xl sm:rounded-2xl border-[2px] sm:border-[3px] border-gray-900 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-2.5 sm:p-3 lg:p-4">
              <div className="flex items-center gap-1.5 sm:gap-2 mb-1 sm:mb-1.5">
                <div className="w-6 h-6 sm:w-8 sm:h-8 lg:w-10 lg:h-10 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0">
                  <DollarSign className="h-3 w-3 sm:h-4 sm:w-4 lg:h-5 lg:w-5 text-red-500" />
                </div>
                <span className="text-[10px] sm:text-xs font-bold text-gray-500">库存价值</span>
              </div>
              <div className="text-lg sm:text-xl lg:text-2xl font-extrabold text-red-500 leading-tight">¥{fmt(totals.inventory_value)}</div>
              <div className="text-[9px] sm:text-[10px] text-gray-400 mt-0.5">成本价</div>
            </div>
          </>
        )}
        {viewMode === "sales" && (
          <>
            <div className="bg-white rounded-xl sm:rounded-2xl border-[2px] sm:border-[3px] border-gray-900 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-2.5 sm:p-3 lg:p-4">
              <div className="flex items-center gap-1.5 sm:gap-2 mb-1 sm:mb-1.5">
                <div className="w-6 h-6 sm:w-8 sm:h-8 lg:w-10 lg:h-10 rounded-lg bg-gray-500/10 flex items-center justify-center shrink-0">
                  <ShoppingCart className="h-3 w-3 sm:h-4 sm:w-4 lg:h-5 lg:w-5 text-gray-600" />
                </div>
                <span className="text-[10px] sm:text-xs font-bold text-gray-500">售出款式</span>
              </div>
              <div className="text-lg sm:text-xl lg:text-2xl font-extrabold text-gray-900 leading-tight">{salesTotals.orderCount}</div>
              <div className="text-[9px] sm:text-[10px] text-gray-400 mt-0.5">款</div>
            </div>
            <div className="bg-white rounded-xl sm:rounded-2xl border-[2px] sm:border-[3px] border-gray-900 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-2.5 sm:p-3 lg:p-4">
              <div className="flex items-center gap-1.5 sm:gap-2 mb-1 sm:mb-1.5">
                <div className="w-6 h-6 sm:w-8 sm:h-8 lg:w-10 lg:h-10 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0">
                  <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4 lg:h-5 lg:w-5 text-green-600" />
                </div>
                <span className="text-[10px] sm:text-xs font-bold text-gray-500">售出数量</span>
              </div>
              <div className="text-lg sm:text-xl lg:text-2xl font-extrabold text-green-600 leading-tight">{salesTotals.totalSold}</div>
              <div className="text-[9px] sm:text-[10px] text-gray-400 mt-0.5">件</div>
            </div>
            <div className="bg-white rounded-xl sm:rounded-2xl border-[2px] sm:border-[3px] border-gray-900 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-2.5 sm:p-3 lg:p-4">
              <div className="flex items-center gap-1.5 sm:gap-2 mb-1 sm:mb-1.5">
                <div className="w-6 h-6 sm:w-8 sm:h-8 lg:w-10 lg:h-10 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0">
                  <DollarSign className="h-3 w-3 sm:h-4 sm:w-4 lg:h-5 lg:w-5 text-red-500" />
                </div>
                <span className="text-[10px] sm:text-xs font-bold text-gray-500">总盈利</span>
              </div>
              <div className="text-lg sm:text-xl lg:text-2xl font-extrabold text-red-500 leading-tight">¥{fmt(salesTotals.totalProfit)}</div>
              <div className="text-[9px] sm:text-[10px] text-gray-400 mt-0.5">利润</div>
            </div>
          </>
        )}
        {viewMode === "returns" && (
          <>
            <div className="bg-white rounded-xl sm:rounded-2xl border-[2px] sm:border-[3px] border-gray-900 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-2.5 sm:p-3 lg:p-4">
              <div className="flex items-center gap-1.5 sm:gap-2 mb-1 sm:mb-1.5">
                <div className="w-6 h-6 sm:w-8 sm:h-8 lg:w-10 lg:h-10 rounded-lg bg-gray-500/10 flex items-center justify-center shrink-0">
                  <Package className="h-3 w-3 sm:h-4 sm:w-4 lg:h-5 lg:w-5 text-gray-600" />
                </div>
                <span className="text-[10px] sm:text-xs font-bold text-gray-500">退货款式</span>
              </div>
              <div className="text-lg sm:text-xl lg:text-2xl font-extrabold text-gray-900 leading-tight">{returnTotals.orderCount}</div>
              <div className="text-[9px] sm:text-[10px] text-gray-400 mt-0.5">款</div>
            </div>
            <div className="bg-white rounded-xl sm:rounded-2xl border-[2px] sm:border-[3px] border-gray-900 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-2.5 sm:p-3 lg:p-4">
              <div className="flex items-center gap-1.5 sm:gap-2 mb-1 sm:mb-1.5">
                <div className="w-6 h-6 sm:w-8 sm:h-8 lg:w-10 lg:h-10 rounded-lg bg-yellow-500/10 flex items-center justify-center shrink-0">
                  <TrendingDown className="h-3 w-3 sm:h-4 sm:w-4 lg:h-5 lg:w-5 text-yellow-600" />
                </div>
                <span className="text-[10px] sm:text-xs font-bold text-gray-500">退回数量</span>
              </div>
              <div className="text-lg sm:text-xl lg:text-2xl font-extrabold text-yellow-600 leading-tight">{returnTotals.totalReturned}</div>
              <div className="text-[9px] sm:text-[10px] text-gray-400 mt-0.5">件</div>
            </div>
            <div className="bg-white rounded-xl sm:rounded-2xl border-[2px] sm:border-[3px] border-gray-900 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-2.5 sm:p-3 lg:p-4">
              <div className="flex items-center gap-1.5 sm:gap-2 mb-1 sm:mb-1.5">
                <div className="w-6 h-6 sm:w-8 sm:h-8 lg:w-10 lg:h-10 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0">
                  <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4 lg:h-5 lg:w-5 text-green-600" />
                </div>
                <span className="text-[10px] sm:text-xs font-bold text-gray-500">退货率</span>
              </div>
              <div className="text-lg sm:text-xl lg:text-2xl font-extrabold text-green-600 leading-tight">
                {salesTotals.totalSold > 0 ? ((returnTotals.totalReturned / salesTotals.totalSold) * 100).toFixed(1) : 0}%
              </div>
              <div className="text-[9px] sm:text-[10px] text-gray-400 mt-0.5">占比</div>
            </div>
          </>
        )}
        {viewMode === "inbound" && (
          <>
            <div className="bg-white rounded-xl sm:rounded-2xl border-[2px] sm:border-[3px] border-gray-900 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-2.5 sm:p-3 lg:p-4">
              <div className="flex items-center gap-1.5 sm:gap-2 mb-1 sm:mb-1.5">
                <div className="w-6 h-6 sm:w-8 sm:h-8 lg:w-10 lg:h-10 rounded-lg bg-gray-500/10 flex items-center justify-center shrink-0">
                  <Package className="h-3 w-3 sm:h-4 sm:w-4 lg:h-5 lg:w-5 text-gray-600" />
                </div>
                <span className="text-[10px] sm:text-xs font-bold text-gray-500">入库款式</span>
              </div>
              <div className="text-lg sm:text-xl lg:text-2xl font-extrabold text-gray-900 leading-tight">{filteredInbound.length}</div>
              <div className="text-[9px] sm:text-[10px] text-gray-400 mt-0.5">种</div>
            </div>
            <div className="bg-white rounded-xl sm:rounded-2xl border-[2px] sm:border-[3px] border-gray-900 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-2.5 sm:p-3 lg:p-4">
              <div className="flex items-center gap-1.5 sm:gap-2 mb-1 sm:mb-1.5">
                <div className="w-6 h-6 sm:w-8 sm:h-8 lg:w-10 lg:h-10 rounded-lg bg-[#4A90E2]/10 flex items-center justify-center shrink-0">
                  <ArrowDown className="h-3 w-3 sm:h-4 sm:w-4 lg:h-5 lg:w-5 text-[#4A90E2]" />
                </div>
                <span className="text-[10px] sm:text-xs font-bold text-gray-500">总入库</span>
              </div>
              <div className="text-lg sm:text-xl lg:text-2xl font-extrabold text-[#4A90E2] leading-tight">{inboundTotals.totalInbound}</div>
              <div className="text-[9px] sm:text-[10px] text-gray-400 mt-0.5">件</div>
            </div>
            <div className="bg-white rounded-xl sm:rounded-2xl border-[2px] sm:border-[3px] border-gray-900 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-2.5 sm:p-3 lg:p-4">
              <div className="flex items-center gap-1.5 sm:gap-2 mb-1 sm:mb-1.5">
                <div className="w-6 h-6 sm:w-8 sm:h-8 lg:w-10 lg:h-10 rounded-lg bg-yellow-500/10 flex items-center justify-center shrink-0">
                  <DollarSign className="h-3 w-3 sm:h-4 sm:w-4 lg:h-5 lg:w-5 text-yellow-600" />
                </div>
                <span className="text-[10px] sm:text-xs font-bold text-gray-500">入库金额</span>
              </div>
              <div className="text-lg sm:text-xl lg:text-2xl font-extrabold text-yellow-600 leading-tight">¥{fmt(inboundTotals.totalValue)}</div>
              <div className="text-[9px] sm:text-[10px] text-gray-400 mt-0.5">成本价</div>
            </div>
          </>
        )}
      </div>

      {/* 搜索 + 筛选按钮 + 编辑/导出 */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
        {/* 搜索框 */}
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 sm:h-5 sm:w-5 text-gray-400 z-10" />
          <input
            type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索商品编号/名称..."
            className="w-full h-11 text-sm sm:text-base pl-11 pr-4 rounded-xl border-[3px] border-gray-900 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] bg-white font-bold text-gray-800 placeholder-gray-400 focus:outline-none focus:shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] transition-all"
          />
        </div>

        {/* 总表：筛选按钮 - 蓝色系 */}
        {viewMode === "summary" && (
          <div className="flex gap-2 items-center">
            <select value={stockFilter} onChange={(e) => setStockFilter(e.target.value)}
              className="h-11 text-xs sm:text-sm px-3 rounded-xl border-[3px] border-[#4A90E2] font-extrabold bg-white text-[#4A90E2] shadow-[3px_3px_0px_0px_rgba(74,144,226,0.4)] cursor-pointer hover:bg-[#4A90E2]/5 transition-all">
              <option value="">剩余库存</option>
              <option value="tail">尾货</option>
              <option value="low">不足5手</option>
              <option value="mid">5手以上</option>
              <option value="high">10手以上</option>
            </select>
            <select value={valueFilter} onChange={(e) => setValueFilter(e.target.value)}
              className="h-11 text-xs sm:text-sm px-3 rounded-xl border-[3px] border-[#4A90E2] font-extrabold bg-white text-[#4A90E2] shadow-[3px_3px_0px_0px_rgba(74,144,226,0.4)] cursor-pointer hover:bg-[#4A90E2]/5 transition-all">
              <option value="">库存价值</option>
              <option value="0-100">0-100</option>
              <option value="101-300">101-300</option>
              <option value="301-500">301-500</option>
              <option value="500+">500以上</option>
            </select>
            <button onClick={() => setErrorFilter(!errorFilter)}
              className={`h-11 inline-flex items-center text-xs sm:text-sm px-3 rounded-xl border-[3px] font-extrabold transition-all ${
                errorFilter
                  ? "bg-[#4A90E2] text-white border-[#4A90E2] shadow-[3px_3px_0px_0px_rgba(74,144,226,1)]"
                  : "border-[#4A90E2] bg-white text-[#4A90E2] hover:bg-[#4A90E2]/5 shadow-[3px_3px_0px_0px_rgba(74,144,226,0.4)]"
              }`}>错误库存</button>
          </div>
        )}

        {/* 售出：日期 + 编辑 + 同步数据 - 绿色系 */}
        {viewMode === "sales" && (
          <div className="flex gap-2 items-center">
            <select
              value={salesDateFilter}
              onChange={e => setSalesDateFilter(e.target.value)}
              className="h-11 text-xs sm:text-sm px-3 rounded-xl border-[3px] border-green-500 font-extrabold bg-white text-green-600 shadow-[3px_3px_0px_0px_rgba(34,197,94,0.4)] cursor-pointer hover:bg-green-50 transition-all"
            >
              <option value="">全部日期</option>
              {salesDates.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
            <button onClick={() => { setSalesEditMode(!salesEditMode); setEditSaveMsg(""); }}
              className={`h-11 inline-flex items-center gap-1 text-xs sm:text-sm px-3 rounded-xl border-[3px] font-extrabold transition-all ${
                salesEditMode
                  ? "bg-green-500 text-white border-green-500 shadow-[3px_3px_0px_0px_rgba(34,197,94,1)]"
                  : "border-green-500 bg-white text-green-600 hover:bg-green-50 shadow-[3px_3px_0px_0px_rgba(34,197,94,0.4)]"
              }`}>
              {salesEditMode ? <><Save className="h-4 w-4" />保存</> : <><Edit3 className="h-4 w-4" />编辑</>}
            </button>
            <button onClick={syncSummary} disabled={syncing}
              className="h-11 inline-flex items-center gap-1 text-xs sm:text-sm px-3 rounded-xl border-[3px] border-green-500 bg-white text-green-600 font-extrabold hover:bg-green-50 transition-all shadow-[3px_3px_0px_0px_rgba(34,197,94,0.4)] disabled:opacity-50">
              <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />汇总数据
            </button>
            <button onClick={() => setUninboundFilter(!uninboundFilter)}
              className={`h-11 inline-flex items-center gap-1 text-xs sm:text-sm px-3 rounded-xl border-[3px] font-extrabold transition-all ${
                uninboundFilter
                  ? "bg-red-500 text-white border-red-500 shadow-[3px_3px_0px_0px_rgba(239,68,68,1)]"
                  : "border-red-500 bg-white text-red-500 hover:bg-red-50 shadow-[3px_3px_0px_0px_rgba(239,68,68,0.4)]"
              }`}>
              <AlertTriangle className="h-4 w-4" />未入库
            </button>
          </div>
        )}

        {/* 退货：日期 + 编辑 - 黄色系 */}
        {viewMode === "returns" && (
          <div className="flex gap-2 items-center">
            <select
              value={returnsDateFilter}
              onChange={e => setReturnsDateFilter(e.target.value)}
              className="h-11 text-xs sm:text-sm px-3 rounded-xl border-[3px] border-yellow-500 font-extrabold bg-white text-yellow-600 shadow-[3px_3px_0px_0px_rgba(234,179,8,0.4)] cursor-pointer hover:bg-yellow-50 transition-all"
            >
              <option value="">全部日期</option>
              {returnsDates.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
            <button onClick={() => { setReturnsEditMode(!returnsEditMode); setEditSaveMsg(""); }}
              className={`h-11 inline-flex items-center gap-1 text-xs sm:text-sm px-3 rounded-xl border-[3px] font-extrabold transition-all ${
                returnsEditMode
                  ? "bg-yellow-500 text-white border-yellow-500 shadow-[3px_3px_0px_0px_rgba(234,179,8,1)]"
                  : "border-yellow-500 bg-white text-yellow-600 hover:bg-yellow-50 shadow-[3px_3px_0px_0px_rgba(234,179,8,0.4)]"
              }`}>
              {returnsEditMode ? <><Save className="h-4 w-4" />保存</> : <><Edit3 className="h-4 w-4" />编辑</>}
            </button>
          </div>
        )}

        {/* 入库：修改 + 导出 - 蓝色系 */}
        {viewMode === "inbound" && (
          <div className="flex gap-2 items-center">
            <button onClick={() => { setInboundEditMode(!inboundEditMode); setEditSaveMsg(""); }}
              className={`h-11 inline-flex items-center gap-1 text-xs sm:text-sm px-3 rounded-xl border-[3px] font-extrabold transition-all ${
                inboundEditMode
                  ? "bg-[#4A90E2] text-white border-[#4A90E2] shadow-[3px_3px_0px_0px_rgba(74,144,226,1)]"
                  : "border-[#4A90E2] bg-white text-[#4A90E2] hover:bg-[#4A90E2]/5 shadow-[3px_3px_0px_0px_rgba(74,144,226,0.4)]"
              }`}>
              {inboundEditMode ? <><Save className="h-4 w-4" />保存</> : <><Edit3 className="h-4 w-4" />修改</>}
            </button>
            <button onClick={() => setExportModal(true)}
              className="h-11 inline-flex items-center gap-1 text-xs sm:text-sm px-3 rounded-xl border-[3px] border-[#4A90E2] bg-white text-[#4A90E2] font-extrabold hover:bg-[#4A90E2]/5 transition-all shadow-[3px_3px_0px_0px_rgba(74,144,226,0.4)]">
              <Download className="h-4 w-4" />导出
            </button>
          </div>
        )}

        {editSaveMsg && (
          <span className={`text-xs font-bold px-2 py-1 rounded ${editSaveMsg.includes("失败") ? "bg-red-50 text-red-600" : "bg-green-50 text-green-600"}`}>
            {editSaveMsg}
          </span>
        )}
        {editSaving && (
          <span className="inline-flex items-center gap-1 text-xs text-blue-500 font-bold">
            <RefreshCw className="h-3 w-3 animate-spin" />保存中...
          </span>
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
                    <th className="px-1.5 py-2 text-center font-extrabold text-base cursor-pointer hover:bg-gray-700" title="点击查看售卖明细">售出</th>
                    <th className="px-1.5 py-2 text-center font-extrabold text-base cursor-pointer hover:bg-gray-700" title="点击查看退货明细">退货</th>
                    <th className="px-1.5 py-2 text-center font-extrabold">剩余</th>
                    {ALL_SIZES.map((s) => (<th key={s} className="px-1.5 py-2 text-center font-extrabold border-x border-gray-700">{s}</th>))}
                    <th className="px-2 py-2 text-center font-extrabold">厂家</th>
                    <th className="px-2 py-2 text-center font-extrabold">进价</th>
                    <th className="px-2 py-2 text-center font-extrabold">售价</th>
                    <th className="px-2 py-2 text-center font-extrabold">退货率</th>
                    <th className="px-2 py-2 text-center font-extrabold">利润率</th>
                    <th className="px-2 py-2 text-center font-extrabold">库存价值</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSummary.length === 0 ? (
                    <tr><td colSpan={25} className="py-8 text-center text-gray-400">暂无数据</td></tr>
                  ) : (
                    pagedSummary.map((row, idx) => {
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
                          <td className="px-1.5 py-2.5 text-center font-bold text-base text-green-600 cursor-pointer hover:underline hover:text-green-800"
                            onClick={() => row.sold_total > 0 && fetchDetail("sales", row.sale_id)} title="点击查看售卖明细">{row.sold_total}</td>
                          <td className="px-1.5 py-2.5 text-center font-bold text-base text-yellow-600 cursor-pointer hover:underline hover:text-yellow-800"
                            onClick={() => row.return_total > 0 && fetchDetail("returns", row.sale_id)} title="点击查看退货明细">{row.return_total}</td>
                          <td className="px-1.5 py-2.5 text-center font-extrabold text-blue-600">{row.remaining}</td>
                          {ALL_SIZES.map((s) => {
                            const val = Number(row[`size_${s}`]) || 0;
                            return (<td key={s} className={`px-1.5 py-2.5 text-center font-bold text-xs border-x border-gray-200 ${val < 0 ? "text-red-500 bg-red-100" : val > 0 ? "text-gray-900" : "text-gray-300"}`}>{val}</td>);
                          })}
                          <td className="px-2 py-2.5 text-center font-bold text-xs text-gray-600">{row.manufacturer || "-"}</td>
                          <td className="px-2 py-2.5 text-center font-bold text-xs text-gray-700">¥{fmt(row.cost_price)}</td>
                          <td className="px-2 py-2.5 text-center font-bold text-xs text-red-500">¥{fmt(row.sell_price)}</td>
                          <td className={`px-2 py-2.5 text-center font-bold text-xs ${row.return_total > 0 && row.sold_total > 0 && row.return_total / row.sold_total > 0.3 ? "text-red-500" : "text-gray-700"}`}>{pct(row.sold_total > 0 ? row.return_total / row.sold_total : 0)}</td>
                          <td className={`px-2 py-2.5 text-center font-bold text-xs ${(row.sell_price as number - row.cost_price as number) >= 0 ? "text-green-600" : "text-red-500"}`}>{pct(row.sell_price > 0 ? (row.sell_price as number - row.cost_price as number) / row.sell_price : 0)}</td>
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
      {deferredViewMode === "sales" && (
        <div className="hidden lg:block overflow-x-auto">
          {uninboundFilter && (
            <div className="mb-2 rounded-lg border-[2px] border-red-500 bg-red-50 px-3 py-2 text-xs font-bold text-red-600 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              以下售出记录对应的商品尚未入库，点击行可跳转到入库登记页面并自动填入信息
            </div>
          )}
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
                    pagedSales.map((row, idx) => {
                      const summaryRow = summaryBySaleId.get(row.sale_id);
                      const photo = row.photo || summaryRow?.photo || "";
                      const sp = row.sell_price || 0;
                      const cp = (summaryRow as Record<string, unknown>)?.cost_price as number || 0;
                      const rate = sp > 0 ? ((sp - cp) / sp) : 0;
                      return (
                        <tr key={row.sale_id}
                          className={`border-b border-gray-200 ${idx % 2 === 0 ? "bg-white" : "bg-gray-50"} ${uninboundFilter && !salesEditMode ? "cursor-pointer hover:bg-red-50" : ""}`}
                          onClick={uninboundFilter && !salesEditMode ? () => jumpToInbound(row) : undefined}
                        >
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
                            if (salesEditMode) {
                              return (
                                <td key={s} className="px-0.5 py-1 text-center border-x border-gray-200">
                                  <input
                                    type="number" min="0"
                                    defaultValue={val || 0}
                                    onBlur={(e) => {
                                      const newVal = Number(e.target.value) || 0;
                                      if (newVal !== val) saveEdit("sales", row.sale_id, s, newVal);
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                                    }}
                                    className="w-12 text-center text-xs font-bold border border-gray-300 rounded px-1 py-0.5 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
                                  />
                                </td>
                              );
                            }
                            return (<td key={s} className={`px-1.5 py-2.5 text-center font-bold text-xs border-x border-gray-200 ${val > 0 ? "text-gray-900" : "text-gray-300"}`}>{val || "-"}</td>);
                          })}
                          <td className="px-2 py-2.5 text-center font-bold text-xs text-red-500">¥{fmt(sp)}</td>
                          <td className="px-2 py-2.5 text-center font-bold text-xs text-gray-700">¥{fmt(cp)}</td>
                          <td className={`px-2 py-2.5 text-center font-bold text-xs ${rate >= 0 ? "text-green-600" : "text-red-500"}`}>{pct(rate)}</td>
                          <td className="px-2 py-2.5 text-center text-xs text-gray-500">
                            {salesDateFilter || (row.last_order_time ? new Date(row.last_order_time).toLocaleDateString("zh-CN") : "-")}
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
                    pagedReturns.map((row, idx) => {
                      const summaryRow = summaryBySaleId.get(row.sale_id);
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
                            if (returnsEditMode) {
                              return (
                                <td key={s} className="px-0.5 py-1 text-center border-x border-gray-200">
                                  <input
                                    type="number" min="0"
                                    defaultValue={val || 0}
                                    onBlur={(e) => {
                                      const newVal = Number(e.target.value) || 0;
                                      if (newVal !== val) saveEdit("returns", row.sale_id, s, newVal);
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                                    }}
                                    className="w-12 text-center text-xs font-bold border border-gray-300 rounded px-1 py-0.5 focus:outline-none focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500"
                                  />
                                </td>
                              );
                            }
                            return (<td key={s} className={`px-1.5 py-2.5 text-center font-bold text-xs border-x border-gray-200 ${val > 0 ? "text-gray-900" : "text-gray-300"}`}>{val || "-"}</td>);
                          })}
                          <td className={`px-2 py-2.5 text-center font-bold text-xs ${returnRate > 0.3 ? "text-red-500" : "text-gray-700"}`}>{pct(returnRate)}</td>
                          <td className="px-2 py-2.5 text-center text-xs text-gray-500">
                            {returnsDateFilter || (row.last_return_time ? new Date(row.last_return_time).toLocaleDateString("zh-CN") : "-")}
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
                    <th className="px-2 py-2 text-center font-extrabold">货架号</th>
                    <th className="px-2 py-2 text-center font-extrabold">季节</th>
                    <th className="px-2 py-2 text-center font-extrabold">款式</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInbound.length === 0 ? (
                    <tr><td colSpan={8 + ALL_SIZES.length} className="py-8 text-center text-gray-400">暂无数据</td></tr>
                  ) : (
                    pagedInbound.map((row, idx) => {
                      const summaryRow = summaryBySaleId.get(row.sale_id);
                      const photo = row.photo || summaryRow?.photo || "";
                      const shelfNo = (row as Record<string, unknown>).shelf_no as string || "";
                      const season = (row as Record<string, unknown>).season as string || "";
                      const styleCat = (row as Record<string, unknown>).style_category as string || "";
                      return (
                        <tr key={row.sale_id} className={`border-b border-gray-200 ${idx % 2 === 0 ? "bg-white" : "bg-gray-50"}`}>
                          <td className="px-2 py-2.5">
                            {inboundEditMode ? (
                              <div className="flex flex-col gap-1 items-center">
                                <HoverImage src={photo} alt="" />
                                <input
                                  type="text" defaultValue={photo}
                                  onBlur={(e) => {
                                    const newVal = e.target.value.trim();
                                    if (newVal !== photo) saveInboundEdit(row.sale_id, { photo: newVal });
                                  }}
                                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                                  placeholder="图片URL"
                                  className="w-20 text-[10px] border border-gray-300 rounded px-1 py-0.5 focus:outline-none focus:border-blue-500"
                                />
                              </div>
                            ) : (
                              <HoverImage src={photo} alt="" />
                            )}
                          </td>
                          <td className="px-2 py-2.5 font-extrabold text-gray-900">
                            <div>{row.sale_id}</div>
                            {row.name && <div className="text-xs text-gray-400 font-normal">{row.name}</div>}
                            {row.manufacturer && <div className="text-xs text-gray-300">{row.manufacturer}</div>}
                          </td>
                          <td className="px-1.5 py-2.5 text-center font-extrabold text-blue-600">{row.total}</td>
                          {ALL_SIZES.map((s) => {
                            const val = Number(row[`size_${s}`]) || 0;
                            if (inboundEditMode) {
                              return (
                                <td key={s} className="px-0.5 py-1 text-center border-x border-gray-200">
                                  <input
                                    type="number" min="0"
                                    defaultValue={val || 0}
                                    onBlur={(e) => {
                                      const newVal = Number(e.target.value) || 0;
                                      if (newVal !== val) saveInboundEdit(row.sale_id, { [`size_${s}`]: newVal });
                                    }}
                                    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                                    className="w-12 text-center text-xs font-bold border border-gray-300 rounded px-1 py-0.5 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                  />
                                </td>
                              );
                            }
                            return (<td key={s} className={`px-1.5 py-2.5 text-center font-bold text-xs border-x border-gray-200 ${val > 0 ? "text-gray-900" : "text-gray-300"}`}>{val || "-"}</td>);
                          })}
                          <td className="px-2 py-2.5 text-center font-bold text-xs text-gray-700">
                            {inboundEditMode ? (
                              <input
                                type="number" min="0" step="0.01"
                                defaultValue={row.cost_price || 0}
                                onBlur={(e) => {
                                  const newVal = Number(e.target.value) || 0;
                                  if (newVal !== (row.cost_price || 0)) saveInboundEdit(row.sale_id, { cost_price: newVal });
                                }}
                                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                                className="w-16 text-center text-xs font-bold border border-gray-300 rounded px-1 py-0.5 focus:outline-none focus:border-blue-500"
                              />
                            ) : (
                              <>¥{fmt(row.cost_price || 0)}</>
                            )}
                          </td>
                          <td className="px-2 py-2.5 text-center font-bold text-xs text-gray-600">
                            {inboundEditMode ? (
                              <select
                                defaultValue={row.manufacturer || ""}
                                onChange={(e) => {
                                  const newVal = e.target.value;
                                  if (newVal !== (row.manufacturer || "")) saveInboundEdit(row.sale_id, { manufacturer: newVal });
                                }}
                                className="w-24 text-center text-xs font-bold border border-gray-300 rounded px-1 py-0.5 focus:outline-none focus:border-blue-500"
                              >
                                <option value="">-</option>
                                {editManufacturers.map((m) => <option key={m} value={m}>{m}</option>)}
                              </select>
                            ) : (
                              row.manufacturer || "-"
                            )}
                          </td>
                          <td className="px-2 py-2.5 text-center font-bold text-xs text-gray-600">
                            {inboundEditMode ? (
                              <select
                                defaultValue={shelfNo}
                                onChange={(e) => {
                                  const newVal = e.target.value;
                                  if (newVal !== shelfNo) saveInboundEdit(row.sale_id, { shelf_no: newVal });
                                }}
                                className="w-24 text-center text-xs font-bold border border-gray-300 rounded px-1 py-0.5 focus:outline-none focus:border-blue-500"
                              >
                                <option value="">-</option>
                                {editShelfOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                              </select>
                            ) : (
                              shelfNo || "-"
                            )}
                          </td>
                          <td className="px-2 py-2.5 text-center font-bold text-xs text-gray-600">
                            {inboundEditMode ? (
                              <select
                                defaultValue={season}
                                onChange={(e) => {
                                  const newVal = e.target.value;
                                  if (newVal !== season) saveInboundEdit(row.sale_id, { season: newVal });
                                }}
                                className="w-20 text-center text-xs font-bold border border-gray-300 rounded px-1 py-0.5 focus:outline-none focus:border-blue-500"
                              >
                                <option value="">-</option>
                                {editSeasonCategories.map((s) => <option key={s} value={s}>{s}</option>)}
                              </select>
                            ) : (
                              season || "-"
                            )}
                          </td>
                          <td className="px-2 py-2.5 text-center font-bold text-xs text-gray-600">
                            {inboundEditMode ? (
                              <select
                                defaultValue={styleCat}
                                onChange={(e) => {
                                  const newVal = e.target.value;
                                  if (newVal !== styleCat) saveInboundEdit(row.sale_id, { style_category: newVal });
                                }}
                                className="w-20 text-center text-xs font-bold border border-gray-300 rounded px-1 py-0.5 focus:outline-none focus:border-blue-500"
                              >
                                <option value="">-</option>
                                {editStyleOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                              </select>
                            ) : (
                              styleCat || "-"
                            )}
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

      {/* ===== 移动端卡片 ===== */}
      <div className="lg:hidden space-y-3">
        {/* 总表移动端 */}
        {viewMode === "summary" && (
          <>
            {filteredSummary.length === 0 ? (
              <div className="text-center py-12 text-gray-400">暂无数据</div>
            ) : (
              pagedSummary.map((row) => {
                const isError = hasErrorStock(row);
                const returnRate = row.sold_total > 0 ? row.return_total / row.sold_total : 0;
                const profitRate = row.sell_price > 0 ? (row.sell_price as number - row.cost_price as number) / row.sell_price : 0;
                return (
                  <div key={row.sale_id} className={`bg-white rounded-xl border-[3px] shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] p-2.5 ${isError ? "border-red-400" : "border-gray-900"}`}>
                    <div className="flex gap-2">
                      {/* 图片区域 */}
                      <div className="w-52 h-52 rounded-lg border-2 border-gray-200 overflow-hidden bg-gray-100 shrink-0">
                        {row.photo ? <img src={row.photo} alt="" loading="lazy" className="w-full h-full object-cover cursor-pointer" onClick={() => setImgPreview(row.photo)} /> : <div className="w-full h-full flex items-center justify-center"><Package className="h-20 w-20 text-gray-300" /></div>}
                      </div>
                      {/* 右侧内容区 */}
                      <div className="flex-1 min-w-0">
                        {/* 编号 */}
                        <div className="text-sm font-extrabold text-gray-900 truncate">{row.sale_id}</div>
                        {row.name && <div className="text-xs text-gray-500 truncate">{row.name}</div>}
                        {/* 所有尺码 窄4列显示 */}
                        <div className="mt-1 grid grid-cols-4 gap-x-0.5 gap-y-0.5">
                          {ALL_SIZES.map((s) => {
                            const val = Number(row[`size_${s}`]) || 0;
                            return (
                              <span key={s} className={`text-[8px] px-1 py-1 rounded border font-bold text-center truncate ${
                                val < 0 ? "bg-red-50 border-red-300 text-red-600" :
                                val > 0 ? "bg-gray-100 border-gray-300 text-gray-700" :
                                "bg-white border-gray-200 text-gray-300"
                              }`}>{s}:{val}</span>
                            );
                          })}
                        </div>
                        {/* 售出/退货 字体放大到和商品名一样大 */}
                        <div className="flex gap-3 mt-1">
                          <div className="cursor-pointer shrink-0"
                            onClick={() => row.sold_total > 0 && fetchDetail("sales", row.sale_id)}>
                            <span className="text-xs font-extrabold text-green-600">售出 {row.sold_total}</span>
                            <span className={`text-xs font-bold ml-2 ${profitRate >= 0 ? "text-green-600" : "text-red-500"}`}>利润率 {pct(profitRate)}</span>
                          </div>
                        </div>
                        <div className="flex gap-3 mt-0.5">
                          <div className="cursor-pointer shrink-0"
                            onClick={() => row.return_total > 0 && fetchDetail("returns", row.sale_id)}>
                            <span className="text-xs font-extrabold text-yellow-600">退货 {row.return_total}</span>
                            <span className="text-xs font-bold ml-2 text-yellow-600">退货率 {pct(returnRate)}</span>
                          </div>
                        </div>
                      </div>
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
                        <span className="text-gray-400">价值 </span>
                        <span className="font-extrabold text-red-500">¥{fmt(row.inventory_value)}</span>
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
            {uninboundFilter && (
              <div className="mb-2 rounded-lg border-[2px] border-red-500 bg-red-50 px-3 py-2 text-xs font-bold text-red-600 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" />
                以下售出记录对应的商品尚未入库，点击可跳转到入库登记页面并自动填入信息
              </div>
            )}
            {filteredSales.length === 0 ? (
              <div className="text-center py-12 text-gray-400">暂无数据</div>
            ) : (
              pagedSales.map((row) => {
                const summaryRow = summaryBySaleId.get(row.sale_id);
                const photo = row.photo || summaryRow?.photo || "";
                const cp = (summaryRow as Record<string, unknown>)?.cost_price as number || 0;
                const sp = row.sell_price || 0;
                const rate = sp > 0 ? ((sp - cp) / sp) : 0;
                const remaining = (summaryRow?.remaining as number) || 0;
                // 售价信息
                const priceInfo = (row as Record<string, unknown>).sell_price_info as Record<string, string> | undefined;
                const hasMultiPrice = priceInfo && Object.keys(priceInfo).length > 1;
                const isPriceExpanded = expandedPriceRow === row.sale_id;
                return (
                  <div key={row.sale_id}>
                    <div
                      onClick={() => {
                        // 未入库筛选模式下，点击直接跳转到入库登记页面
                        if (uninboundFilter) {
                          jumpToInbound(row);
                          return;
                        }
                        // 打开编辑悬浮窗
                        const vals: Record<number, number> = {};
                        for (const s of ALL_SIZES) {
                          vals[s] = Number(row[`size_${s}`]) || 0;
                        }
                        setEditSizeValues(vals);
                        setSalesEditModal(row.sale_id);
                      }}
                      className={`bg-white rounded-xl border-[3px] border-gray-900 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] p-2.5 cursor-pointer active:scale-[0.98] transition-transform ${uninboundFilter ? "border-red-500 shadow-[3px_3px_0px_0px_rgba(239,68,68,1)]" : ""}`}
                    >
                      <div className="flex gap-2">
                        <div className="w-52 h-52 rounded-lg border-2 border-gray-200 overflow-hidden bg-gray-100 shrink-0">
                          {photo ? <img src={photo} alt="" loading="lazy" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Package className="h-20 w-20 text-gray-300" /></div>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <div className="text-sm font-extrabold text-gray-900 truncate">{row.sale_id}</div>
                            <div className="flex items-center gap-2 text-[10px] shrink-0 ml-1">
                              <span className="text-gray-400">售出</span>
                              <span className="font-extrabold text-green-600">{row.total}</span>
                              <span className="text-gray-300">|</span>
                              <span className="text-gray-400">剩余</span>
                              <span className="font-extrabold">{remaining}</span>
                            </div>
                          </div>
                          {row.name && <div className="text-xs text-gray-500 truncate">{row.name}</div>}
                          {/* 尺码 4列显示 */}
                          <div className="mt-1 grid grid-cols-4 gap-x-0.5 gap-y-0.5">
                            {ALL_SIZES.map((s) => {
                              const val = Number(row[`size_${s}`]) || 0;
                              return (
                                <span key={s} className={`text-[8px] px-1 py-1 rounded border font-bold text-center truncate ${
                                  val > 0 ? "bg-green-50 border-green-300 text-green-700" : "bg-white border-gray-200 text-gray-300"
                                }`}>{s}:{val || "-"}</span>
                              );
                            })}
                          </div>
                          {/* 售价（带方框，多价可下拉） */}
                          <div className="mt-1">
                            {hasMultiPrice ? (
                              <div className="border-2 border-red-300 rounded-lg overflow-hidden">
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); setExpandedPriceRow(isPriceExpanded ? null : row.sale_id); }}
                                  className="w-full flex items-center justify-between px-2 py-1 bg-red-50 hover:bg-red-100 transition-colors"
                                >
                                  <span className="text-[10px] font-extrabold text-red-500">售价 ¥{fmt(sp)}</span>
                                  <ChevronDown className={`h-3 w-3 text-red-400 transition-transform ${isPriceExpanded ? "rotate-180" : ""}`} />
                                </button>
                                {isPriceExpanded && priceInfo && (
                                  <div className="border-t border-red-200 bg-white divide-y divide-red-100">
                                    {Object.entries(priceInfo).map(([price, time]) => (
                                      <div key={price} className="flex justify-between px-2 py-1 text-[9px]">
                                        <span className="font-bold text-red-500">¥{price}</span>
                                        <span className="text-gray-400">{time ? new Date(time).toLocaleDateString("zh-CN") : "-"}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="w-full border-2 border-red-300 rounded-lg px-2 py-1 bg-red-50">
                                <span className="text-[10px] font-extrabold text-red-500">售价 ¥{fmt(sp)}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* 底部：进价 盈利 利润率 */}
                      <div className="flex justify-between items-center text-[10px] mt-1.5 pt-1.5 border-t border-gray-200">
                        <span className="text-gray-400">进价: <span className="font-bold text-gray-700">¥{fmt(cp)}</span></span>
                        <span className="text-gray-400">盈利: <span className="font-bold text-red-500">¥{fmt(row.total * sp)}</span></span>
                        <span className={`font-bold ${rate >= 0 ? "text-green-600" : "text-red-500"}`}>利润率: {pct(rate)}</span>
                      </div>
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
                const summaryRow = summaryBySaleId.get(row.sale_id);
                const photo = summaryRow?.photo || "";
                const soldTotal = summaryRow?.sold_total || 0;
                const returnRate = soldTotal > 0 ? row.total / soldTotal : 0;
                const remaining = (summaryRow?.remaining as number) || 0;
                const cp = (summaryRow as Record<string, unknown>)?.cost_price as number || 0;
                // 退货价信息
                const retPriceInfo = (row as Record<string, unknown>).return_price_info as Record<string, string> | undefined;
                const rp = (row as Record<string, unknown>).return_price as number || 0;
                const hasMultiPrice = retPriceInfo && Object.keys(retPriceInfo).length > 1;
                const isPriceExpanded = expandedPriceRow === row.sale_id;
                return (
                  <div key={row.sale_id}>
                    <div
                      onClick={() => {
                        const vals: Record<number, number> = {};
                        for (const s of ALL_SIZES) {
                          vals[s] = Number(row[`size_${s}`]) || 0;
                        }
                        setEditSizeValues(vals);
                        setReturnsEditModal(row.sale_id);
                      }}
                      className="bg-white rounded-xl border-[3px] border-gray-900 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] p-2.5 cursor-pointer active:scale-[0.98] transition-transform"
                    >
                      <div className="flex gap-2">
                        <div className="w-52 h-52 rounded-lg border-2 border-gray-200 overflow-hidden bg-gray-100 shrink-0">
                          {photo ? <img src={photo} alt="" loading="lazy" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Package className="h-20 w-20 text-gray-300" /></div>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <div className="text-sm font-extrabold text-gray-900 truncate">{row.sale_id}</div>
                            <div className="flex items-center gap-2 text-[10px] shrink-0 ml-1">
                              <span className="text-gray-400">退货</span>
                              <span className="font-extrabold text-yellow-600">{row.total}</span>
                              <span className="text-gray-300">|</span>
                              <span className="text-gray-400">剩余</span>
                              <span className="font-extrabold">{remaining}</span>
                            </div>
                          </div>
                          {summaryRow?.name && <div className="text-xs text-gray-500 truncate">{summaryRow.name}</div>}
                          {/* 尺码 4列显示 */}
                          <div className="mt-1 grid grid-cols-4 gap-x-0.5 gap-y-0.5">
                            {ALL_SIZES.map((s) => {
                              const val = Number(row[`size_${s}`]) || 0;
                              return (
                                <span key={s} className={`text-[8px] px-1 py-1 rounded border font-bold text-center truncate ${
                                  val > 0 ? "bg-yellow-50 border-yellow-300 text-yellow-700" : "bg-white border-gray-200 text-gray-300"
                                }`}>{s}:{val || "-"}</span>
                              );
                            })}
                          </div>
                          {/* 退货价（带方框，多价可下拉） */}
                          <div className="mt-1">
                            {hasMultiPrice ? (
                              <div className="border-2 border-yellow-400 rounded-lg overflow-hidden">
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); setExpandedPriceRow(isPriceExpanded ? null : row.sale_id); }}
                                  className="w-full flex items-center justify-between px-2 py-1 bg-yellow-50 hover:bg-yellow-100 transition-colors"
                                >
                                  <span className="text-[10px] font-extrabold text-yellow-600">退货价 ¥{fmt(rp)}</span>
                                  <ChevronDown className={`h-3 w-3 text-yellow-500 transition-transform ${isPriceExpanded ? "rotate-180" : ""}`} />
                                </button>
                                {isPriceExpanded && retPriceInfo && (
                                  <div className="border-t border-yellow-200 bg-white divide-y divide-yellow-100">
                                    {Object.entries(retPriceInfo).map(([price, time]) => (
                                      <div key={price} className="flex justify-between px-2 py-1 text-[9px]">
                                        <span className="font-bold text-yellow-600">¥{price}</span>
                                        <span className="text-gray-400">{time ? new Date(time).toLocaleDateString("zh-CN") : "-"}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="w-full border-2 border-yellow-400 rounded-lg px-2 py-1 bg-yellow-50">
                                <span className="text-[10px] font-extrabold text-yellow-600">退货价 ¥{fmt(rp)}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* 底部：进价 退货率 */}
                      <div className="flex justify-between items-center text-[10px] mt-1.5 pt-1.5 border-t border-gray-200">
                        <span className="text-gray-400">进价: <span className="font-bold text-gray-700">¥{fmt(cp)}</span></span>
                        <span className="font-bold text-yellow-600">退货率: {pct(returnRate)}</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </>
        )}

        {/* 入库表移动端 */}
        {deferredViewMode === "inbound" && (
          <>
            {filteredInbound.length === 0 ? (
              <div className="text-center py-12 text-gray-400">暂无数据</div>
            ) : (
              pagedInbound.map((row) => {
                const summaryRow = summaryBySaleId.get(row.sale_id);
                const photo = row.photo || summaryRow?.photo || "";
                const curSeason = (row as Record<string, unknown>).season as string || (summaryRow as Record<string, unknown>)?.season as string || "";
                const curStyle = (row as Record<string, unknown>).style_category as string || (summaryRow as Record<string, unknown>)?.style_category as string || "";
                const curMfr = (row as Record<string, unknown>).manufacturer as string || (summaryRow as Record<string, unknown>)?.manufacturer as string || "";
                const curShelf = (row as Record<string, unknown>).shelf_no as string || (summaryRow as Record<string, unknown>)?.shelf_no as string || "";
                const curName = row.name || (summaryRow as Record<string, unknown>)?.name as string || "";
                return (
                  <div key={row.sale_id}>
                    <div
                      onClick={() => {
                        // 解析货架号 - 兼容 "B02-4" 和 "B-2-4" 两种格式
                        let l1 = "", l2 = "", l3 = "";
                        if (curShelf) {
                          const parts = curShelf.split("-");
                          if (parts.length >= 2) {
                            const zoneMatch = parts[0].match(/^([A-Za-z]+)(\d+)/);
                            if (zoneMatch) {
                              l1 = zoneMatch[1];
                              l2 = String(parseInt(zoneMatch[2], 10));
                              l3 = parts[1];
                            } else {
                              l1 = parts[0];
                              l2 = parts[1];
                              l3 = parts[2] || "";
                            }
                          }
                        }
                        setMobileShelfL1(l1);
                        setMobileShelfL2(l2);
                        setMobileShelfL3(l3);
                        setMobileEditModal({
                          sale_id: row.sale_id,
                          photo,
                          name: curName,
                          manufacturer: curMfr,
                          shelf_no: curShelf,
                          season: curSeason,
                          style_category: curStyle,
                        });
                      }}
                      className="bg-white rounded-xl border-[3px] border-gray-900 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] p-2.5 cursor-pointer active:scale-[0.98] transition-transform"
                    >
                      <div className="flex gap-2 mb-2">
                        <div className="w-52 h-52 rounded-lg border-2 border-gray-200 overflow-hidden bg-gray-100 shrink-0">
                          {photo ? <img src={photo} alt="" loading="lazy" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Package className="h-20 w-20 text-gray-300" /></div>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1 flex-wrap">
                            <span className="text-sm font-extrabold text-gray-900 truncate">{row.sale_id}</span>
                            {curSeason && <span className="text-[9px] px-1 py-0.5 rounded bg-purple-100 text-purple-700 font-bold shrink-0">{curSeason}</span>}
                            {curStyle && <span className="text-[9px] px-1 py-0.5 rounded bg-orange-100 text-orange-700 font-bold shrink-0">{curStyle}</span>}
                          </div>
                          {curName && <div className="text-xs text-gray-500 truncate">{curName}</div>}
                          {/* 尺码 4列显示 */}
                          <div className="mt-1 grid grid-cols-4 gap-x-0.5 gap-y-0.5">
                            {ALL_SIZES.map((s) => {
                              const val = Number(row[`size_${s}`]) || 0;
                              return (
                                <span key={s} className={`text-[8px] px-1 py-1 rounded border font-bold text-center truncate ${
                                  val > 0 ? "bg-gray-100 border-gray-300 text-gray-700" : "bg-white border-gray-200 text-gray-300"
                                }`}>{s}:{val || "-"}</span>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                      {/* 总入库和进价 - 无框 */}
                      <div className="flex justify-between items-center text-[10px]">
                        <div>
                          <span className="text-gray-400">总入库: </span>
                          <span className="font-extrabold text-blue-600">{row.total}</span>
                        </div>
                        <div className="flex gap-2">
                          <span className="text-gray-500">进价: <span className="font-bold text-gray-700">¥{fmt(row.cost_price || 0)}</span></span>
                          {curMfr && <span className="text-gray-400">{curMfr}</span>}
                          {curShelf && <span className="text-gray-400">{curShelf}</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </>
        )}
      </div>

      {/* 分页控制 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 sm:gap-3 mt-4 mb-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="h-10 px-4 rounded-xl border-[3px] border-gray-900 bg-white font-extrabold text-gray-900 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 transition-all"
          >
            上一页
          </button>
          <div className="h-10 px-4 flex items-center rounded-xl border-[3px] border-gray-900 bg-gray-900 text-white font-extrabold shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
            {page} / {totalPages}
          </div>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="h-10 px-4 rounded-xl border-[3px] border-gray-900 bg-white font-extrabold text-gray-900 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 transition-all"
          >
            下一页
          </button>
        </div>
      )}

      {/* 移动端入库编辑弹窗 */}
      {mobileEditModal && (
        <div className="fixed inset-0 z-[100] bg-black/60 flex items-end sm:items-center justify-center" onClick={() => setMobileEditModal(null)}>
          <div
            className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto p-4 shadow-[0_-8px_30px_rgba(0,0,0,0.3)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-extrabold text-gray-900">编辑 {mobileEditModal.sale_id}</h3>
              <button onClick={() => setMobileEditModal(null)} className="p-1 rounded-lg hover:bg-gray-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* 图片 */}
            <div className="flex justify-center mb-3">
              <div className="w-44 h-44 rounded-lg border-2 border-gray-200 overflow-hidden bg-gray-100">
                {mobileEditModal.photo ? <img src={mobileEditModal.photo} alt="" className="w-full h-full object-cover cursor-pointer" onClick={(e) => { e.stopPropagation(); setImgPreview(mobileEditModal.photo); }} /> : <div className="w-full h-full flex items-center justify-center"><Package className="h-16 w-16 text-gray-300" /></div>}
              </div>
            </div>

            <div className="space-y-2.5">
              {/* 厂家 */}
              <div>
                <label className="text-xs font-extrabold text-gray-500 block mb-0.5">厂家</label>
                <select
                  value={mobileEditModal.manufacturer}
                  onChange={(e) => setMobileEditModal({ ...mobileEditModal, manufacturer: e.target.value })}
                  className="w-full text-sm font-bold border-2 border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
                >
                  <option value="">-</option>
                  {editManufacturers.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>

              {/* 货架号 - 三级选择 */}
              <div>
                <label className="text-xs font-extrabold text-gray-500 block mb-0.5">货架号</label>
                <div className="flex gap-1.5">
                  <select
                    value={mobileShelfL1}
                    onChange={(e) => { setMobileShelfL1(e.target.value); setMobileShelfL2(""); setMobileShelfL3(""); }}
                    className="flex-1 text-sm font-bold border-2 border-gray-300 rounded-lg px-2 py-2 focus:outline-none focus:border-blue-500"
                  >
                    <option value="">排</option>
                    {Object.keys(editShelfData).map((k) => <option key={k} value={k}>{k}</option>)}
                  </select>
                  <select
                    value={mobileShelfL2}
                    onChange={(e) => { setMobileShelfL2(e.target.value); setMobileShelfL3(""); }}
                    disabled={!mobileShelfL1}
                    className="flex-1 text-sm font-bold border-2 border-gray-300 rounded-lg px-2 py-2 focus:outline-none focus:border-blue-500 disabled:opacity-40"
                  >
                    <option value="">号</option>
                    {mobileShelfL1 && (editShelfData[mobileShelfL1] || []).map((n) => <option key={n} value={String(n)}>{n}</option>)}
                  </select>
                  <select
                    value={mobileShelfL3}
                    onChange={(e) => setMobileShelfL3(e.target.value)}
                    disabled={!mobileShelfL2}
                    className="flex-1 text-sm font-bold border-2 border-gray-300 rounded-lg px-2 py-2 focus:outline-none focus:border-blue-500 disabled:opacity-40"
                  >
                    <option value="">层</option>
                    {DEFAULT_LAYERS.map((n) => <option key={n} value={String(n)}>{n}</option>)}
                  </select>
                </div>
                {mobileShelfL1 && mobileShelfL2 && mobileShelfL3 && (
                  <p className="text-[10px] text-gray-500 mt-1 font-bold">
                    {mobileShelfL1}-{mobileShelfL2}-{mobileShelfL3}（{mobileShelfL1}货架第{mobileShelfL3}层）
                  </p>
                )}
              </div>

              {/* 季节 */}
              <div>
                <label className="text-xs font-extrabold text-gray-500 block mb-0.5">季节</label>
                <select
                  value={mobileEditModal.season}
                  onChange={(e) => setMobileEditModal({ ...mobileEditModal, season: e.target.value })}
                  className="w-full text-sm font-bold border-2 border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
                >
                  <option value="">-</option>
                  {editSeasonCategories.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              {/* 款式 */}
              <div>
                <label className="text-xs font-extrabold text-gray-500 block mb-0.5">款式</label>
                <select
                  value={mobileEditModal.style_category}
                  onChange={(e) => setMobileEditModal({ ...mobileEditModal, style_category: e.target.value })}
                  className="w-full text-sm font-bold border-2 border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
                >
                  <option value="">-</option>
                  <optgroup label="── 含尺码 ──">
                    {editSizeStyles.map((s) => <option key={s} value={s}>{s}</option>)}
                  </optgroup>
                  <optgroup label="── 不含尺码 ──">
                    {editNoSizeStyles.map((s) => <option key={s} value={s}>{s}</option>)}
                  </optgroup>
                </select>
              </div>
            </div>

            {/* 保存按钮 */}
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setMobileEditModal(null)}
                className="flex-1 py-2.5 rounded-xl border-2 border-gray-300 bg-white text-gray-700 font-extrabold text-sm hover:bg-gray-50 transition-all"
              >
                取消
              </button>
              <button
                onClick={async () => {
                  const shelfNo = mobileShelfL1 && mobileShelfL2 && mobileShelfL3
                    ? `${mobileShelfL1}-${mobileShelfL2}-${mobileShelfL3}`
                    : mobileEditModal.shelf_no;
                  try {
                    await saveInboundEdit(mobileEditModal.sale_id, {
                      manufacturer: mobileEditModal.manufacturer,
                      shelf_no: shelfNo,
                      season: mobileEditModal.season,
                      style_category: mobileEditModal.style_category,
                    });
                    setMobileEditModal(null);
                  } catch {
                    alert("保存失败");
                  }
                }}
                className="flex-1 py-2.5 rounded-xl border-2 border-gray-900 bg-gray-900 text-white font-extrabold text-sm hover:bg-gray-800 transition-all"
              >
                保存修改
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 移动端售出编辑悬浮窗 */}
      {salesEditModal && (() => {
        const row = filteredSales.find((r) => r.sale_id === salesEditModal);
        if (!row) return null;
        const summaryRow = summaryBySaleId.get(salesEditModal);
        const photo = row.photo || summaryRow?.photo || "";
        return (
          <div className="fixed inset-0 z-[100] bg-black/60 flex items-end sm:items-center justify-center" onClick={() => setSalesEditModal(null)}>
            <div
              className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto p-4 shadow-[0_-8px_30px_rgba(0,0,0,0.3)]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-extrabold text-gray-900">编辑售出 {row.sale_id}</h3>
                <button onClick={() => setSalesEditModal(null)} className="p-1 rounded-lg hover:bg-gray-100">
                  <X className="h-5 w-5" />
                </button>
              </div>
              {/* 商品大图 */}
              <div className="flex justify-center mb-3">
                <div className="w-40 h-40 rounded-xl border-2 border-gray-200 overflow-hidden bg-gray-100">
                  {photo ? <img src={photo} alt="" className="w-full h-full object-cover cursor-pointer" onClick={(e) => { e.stopPropagation(); setImgPreview(photo); }} /> : <div className="w-full h-full flex items-center justify-center"><Package className="h-16 w-16 text-gray-300" /></div>}
                </div>
              </div>
              {/* 尺码输入 */}
              <div className="grid grid-cols-4 gap-2">
                {ALL_SIZES.map((s) => {
                  const val = editSizeValues[s] || 0;
                  return (
                    <div key={s} className="rounded-xl border-[3px] border-gray-900 bg-white p-1">
                      <div className={`text-center text-[10px] font-extrabold mb-0.5 ${val > 0 ? "text-gray-900" : "text-gray-300"}`}>{s}</div>
                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setEditSizeValues({ ...editSizeValues, [s]: Math.max(0, val - 1) }); }}
                          className="flex h-5 w-5 items-center justify-center rounded-md border-[2px] border-gray-900 bg-[#FF6B7A] text-white active:scale-90 transition-transform shrink-0"
                        >
                          <Minus className="h-2.5 w-2.5" />
                        </button>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={val}
                          onChange={(e) => {
                            const v = parseInt(e.target.value) || 0;
                            setEditSizeValues({ ...editSizeValues, [s]: Math.max(0, v) });
                          }}
                          className={`w-full text-center text-xs font-extrabold border-none outline-none bg-transparent ${val > 0 ? "text-gray-900" : "text-gray-300"}`}
                        />
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setEditSizeValues({ ...editSizeValues, [s]: val + 1 }); }}
                          className="flex h-5 w-5 items-center justify-center rounded-md border-[2px] border-gray-900 bg-[#4CD964] text-white active:scale-90 transition-transform shrink-0"
                        >
                          <Plus className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => setSalesEditModal(null)}
                  className="flex-1 py-2.5 rounded-xl border-2 border-gray-300 bg-white text-gray-700 font-extrabold text-sm hover:bg-gray-50 transition-all"
                >
                  取消
                </button>
                <button
                  onClick={async () => {
                    for (const s of ALL_SIZES) {
                      const newVal = editSizeValues[s] || 0;
                      const oldVal = Number(row[`size_${s}`]) || 0;
                      if (newVal !== oldVal) {
                        await saveEdit("sales", row.sale_id, s, newVal);
                      }
                    }
                    setSalesEditModal(null);
                  }}
                  className="flex-1 py-2.5 rounded-xl border-2 border-gray-900 bg-gray-900 text-white font-extrabold text-sm hover:bg-gray-800 transition-all"
                >
                  保存修改
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 移动端退货编辑悬浮窗 */}
      {returnsEditModal && (() => {
        const row = filteredReturns.find((r) => r.sale_id === returnsEditModal);
        if (!row) return null;
        const summaryRow = summaryBySaleId.get(returnsEditModal);
        const photo = summaryRow?.photo || "";
        return (
          <div className="fixed inset-0 z-[100] bg-black/60 flex items-end sm:items-center justify-center" onClick={() => setReturnsEditModal(null)}>
            <div
              className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto p-4 shadow-[0_-8px_30px_rgba(0,0,0,0.3)]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-extrabold text-gray-900">编辑退货 {row.sale_id}</h3>
                <button onClick={() => setReturnsEditModal(null)} className="p-1 rounded-lg hover:bg-gray-100">
                  <X className="h-5 w-5" />
                </button>
              </div>
              {/* 商品大图 */}
              <div className="flex justify-center mb-3">
                <div className="w-40 h-40 rounded-xl border-2 border-gray-200 overflow-hidden bg-gray-100">
                  {photo ? <img src={photo} alt="" className="w-full h-full object-cover cursor-pointer" onClick={(e) => { e.stopPropagation(); setImgPreview(photo); }} /> : <div className="w-full h-full flex items-center justify-center"><Package className="h-16 w-16 text-gray-300" /></div>}
                </div>
              </div>
              {/* 尺码输入 */}
              <div className="grid grid-cols-4 gap-2">
                {ALL_SIZES.map((s) => {
                  const val = editSizeValues[s] || 0;
                  return (
                    <div key={s} className="rounded-xl border-[3px] border-gray-900 bg-white p-1">
                      <div className={`text-center text-[10px] font-extrabold mb-0.5 ${val > 0 ? "text-gray-900" : "text-gray-300"}`}>{s}</div>
                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setEditSizeValues({ ...editSizeValues, [s]: Math.max(0, val - 1) }); }}
                          className="flex h-5 w-5 items-center justify-center rounded-md border-[2px] border-gray-900 bg-[#FF6B7A] text-white active:scale-90 transition-transform shrink-0"
                        >
                          <Minus className="h-2.5 w-2.5" />
                        </button>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={val}
                          onChange={(e) => {
                            const v = parseInt(e.target.value) || 0;
                            setEditSizeValues({ ...editSizeValues, [s]: Math.max(0, v) });
                          }}
                          className={`w-full text-center text-xs font-extrabold border-none outline-none bg-transparent ${val > 0 ? "text-gray-900" : "text-gray-300"}`}
                        />
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setEditSizeValues({ ...editSizeValues, [s]: val + 1 }); }}
                          className="flex h-5 w-5 items-center justify-center rounded-md border-[2px] border-gray-900 bg-[#4CD964] text-white active:scale-90 transition-transform shrink-0"
                        >
                          <Plus className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => setReturnsEditModal(null)}
                  className="flex-1 py-2.5 rounded-xl border-2 border-gray-300 bg-white text-gray-700 font-extrabold text-sm hover:bg-gray-50 transition-all"
                >
                  取消
                </button>
                <button
                  onClick={async () => {
                    for (const s of ALL_SIZES) {
                      const newVal = editSizeValues[s] || 0;
                      const oldVal = Number(row[`size_${s}`]) || 0;
                      if (newVal !== oldVal) {
                        await saveEdit("returns", row.sale_id, s, newVal);
                      }
                    }
                    setReturnsEditModal(null);
                  }}
                  className="flex-1 py-2.5 rounded-xl border-2 border-gray-900 bg-gray-900 text-white font-extrabold text-sm hover:bg-gray-800 transition-all"
                >
                  保存修改
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 导出弹窗 */}
      {exportModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setExportModal(false)}>
          <div className="bg-white rounded-2xl border-[3px] border-gray-900 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] max-w-lg w-full max-h-[80vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b-2 border-gray-200">
              <h3 className="text-base font-extrabold">导出入库数据</h3>
              <button onClick={() => setExportModal(false)} className="flex h-8 w-8 items-center justify-center rounded-lg border-2 border-gray-900 bg-white hover:bg-gray-100">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              <p className="text-xs text-gray-500 mb-3">选择要导出的字段和范围（当前筛选结果：{filteredInbound.length} 条记录）</p>
              <div className="grid grid-cols-3 gap-2 mb-4">
                {[
                  { key: "sale_id", label: "售卖编号" },
                  { key: "name", label: "商品名称" },
                  { key: "manufacturer", label: "厂家" },
                  { key: "shelf_no", label: "货架号" },
                  { key: "cost_price", label: "进价" },
                  { key: "season", label: "季节" },
                  { key: "style_category", label: "款式分类" },
                  { key: "notes", label: "备注" },
                  { key: "inbound_date", label: "入库日期" },
                  { key: "total_stock", label: "总库存" },
                  ...ALL_SIZES.map((s) => ({ key: String(s), label: `尺码${s}` })),
                ].map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-1.5 text-xs cursor-pointer hover:bg-gray-50 rounded px-1.5 py-1">
                    <input
                      type="checkbox"
                      checked={exportFields.has(key)}
                      onChange={() => {
                        setExportFields((prev) => {
                          const next = new Set(prev);
                          if (next.has(key)) next.delete(key);
                          else next.add(key);
                          return next;
                        });
                      }}
                      className="rounded border-gray-300"
                    />
                    {label}
                  </label>
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setExportFields(new Set(["sale_id", "name", "manufacturer", "shelf_no", "cost_price", "season", "style_category", "notes", "inbound_date", "total_stock", ...ALL_SIZES.map(String)]))}
                  className="text-xs px-2 py-1 rounded-lg border-2 border-gray-300 font-bold hover:bg-gray-50">全选</button>
                <button onClick={() => setExportFields(new Set())}
                  className="text-xs px-2 py-1 rounded-lg border-2 border-gray-300 font-bold hover:bg-gray-50">全不选</button>
                <div className="flex-1" />
                <button onClick={handleExport}
                  disabled={exportFields.size === 0 || filteredInbound.length === 0}
                  className="text-xs px-4 py-1.5 rounded-lg border-[2px] border-purple-500 bg-purple-500 text-white font-extrabold hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed">
                  导出 CSV
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 下拉选项 datalist */}
      <datalist id="manufacturer-list">
        {manufacturerOptions.map((v) => <option key={v} value={v} />)}
      </datalist>
      <datalist id="shelf-list">
        {shelfRows.map((v) => <option key={v} value={v} />)}
      </datalist>
      <datalist id="season-list">
        {seasonOptions.map((v) => <option key={v} value={v} />)}
      </datalist>
      <datalist id="style-list">
        {styleOptions.map((v) => <option key={v} value={v} />)}
      </datalist>

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
          </div>
        </div>
      )}
    </PageWrapper>
  );
}