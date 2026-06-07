"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { ArrowLeft, Search, Package, Download, Trash2, Check, X, Users, Link2 } from "lucide-react";
import Link from "next/link";
import { PageWrapper } from "@/components/page-wrapper";

const ALL_SIZES = [80, 90, 95, 100, 105, 110, 120, 130, 140, 150, 160, 170, 180] as const;

interface SummaryProduct {
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
  [key: string]: unknown;
}

const SELECTED_KEY = "live_selected_products";

function getSelectedFromStorage(): string[] {
  try {
    const raw = localStorage.getItem(SELECTED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveSelectedToStorage(ids: string[]) {
  try {
    localStorage.setItem(SELECTED_KEY, JSON.stringify(ids));
  } catch { /* ignore */ }
}

const fmt = (n: number) => n.toFixed(2);
const pct = (n: number) => (n * 100).toFixed(1) + "%";

export default function LiveSelectPage() {
  const [tab, setTab] = useState<"select" | "selected">("select");
  const [products, setProducts] = useState<SummaryProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);

  // 筛选
  const [soldFilter, setSoldFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState("all");
  const [valueFilter, setValueFilter] = useState("all");

  // 导出弹窗
  const [showExport, setShowExport] = useState(false);
  const [exportFields, setExportFields] = useState({
    name: true,
    sale_id: true,
    sell_price: true,
    cost_price: true,
    remaining: true,
    sold_total: true,
    profit: true,
    inventory_value: true,
    manufacturer: false,
    shelf_no: false,
  });

  // 其他成员的选品
  const [memberSelections, setMemberSelections] = useState<Array<{ member_name: string; sale_ids: string[]; count: number }>>([]);
  const [memberName, setMemberName] = useState<string>("");
  const memberNameRef = useRef<string>("");

  useEffect(() => {
    const name = localStorage.getItem("member_name") || "未知设备";
    const role = localStorage.getItem("member_role") || "";
    setMemberName(name);
    memberNameRef.current = name;
    setIsAdmin(role === "admin");
    setSelectedIds(getSelectedFromStorage());
    fetchProducts();
    fetchMemberSelections();

    // 每 5 秒轮询同步其他人的选品
    const interval = setInterval(() => {
      fetchMemberSelections();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // 同步选品到服务器
  const syncToServer = async (ids: string[]) => {
    const name = memberNameRef.current || "未知设备";
    try {
      await fetch("/api/live-selections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ member_name: name, sale_ids: ids }),
      });
      fetchMemberSelections();
    } catch (err) {
      console.error("Sync selections error:", err);
    }
  };

  const fetchMemberSelections = async () => {
    try {
      const res = await fetch("/api/live-selections");
      const data = await res.json();
      if (data.members) {
        setMemberSelections(data.members.filter((m: { member_name: string }) => m.member_name !== memberName));
      }
    } catch (err) {
      console.error("Fetch member selections error:", err);
    }
  };

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/summary");
      const data = await res.json();
      const filtered = (Array.isArray(data) ? data : [])
        .filter((p: SummaryProduct) => (p.sell_price || 0) > 0)
        .map((p: SummaryProduct) => ({
          ...p,
          remaining: Number(p.remaining) || 0,
          sell_price: Number(p.sell_price) || 0,
          cost_price: Number(p.cost_price) || 0,
          inbound_total: Number(p.inbound_total) || 0,
          sold_total: Number(p.sold_total) || 0,
          return_total: Number(p.return_total) || 0,
          inventory_value: (Number(p.remaining) || 0) * (Number(p.cost_price) || 0),
        }));
      setProducts(filtered);
    } catch (err) {
      console.error("Fetch products error:", err);
    } finally {
      setLoading(false);
    }
  };

  const filteredProducts = useMemo(() => {
    let result = products;

    if (search) {
      const s = search.toLowerCase();
      result = result.filter((p) =>
        (p.name || "").toLowerCase().includes(s) ||
        (p.sale_id || "").toLowerCase().includes(s)
      );
    }

    if (soldFilter === "hasStock") {
      result = result.filter((p) => p.remaining > 0);
    } else if (soldFilter === "soldOut") {
      result = result.filter((p) => p.remaining <= 0);
    }

    if (stockFilter === "low") {
      result = result.filter((p) => p.remaining > 0 && p.remaining <= 10);
    } else if (stockFilter === "normal") {
      result = result.filter((p) => p.remaining > 10 && p.remaining <= 50);
    } else if (stockFilter === "high") {
      result = result.filter((p) => p.remaining > 50);
    }

    if (valueFilter === "low") {
      result = result.filter((p) => p.inventory_value > 0 && p.inventory_value <= 1000);
    } else if (valueFilter === "mid") {
      result = result.filter((p) => p.inventory_value > 1000 && p.inventory_value <= 5000);
    } else if (valueFilter === "high") {
      result = result.filter((p) => p.inventory_value > 5000);
    }

    return result;
  }, [products, search, soldFilter, stockFilter, valueFilter]);

  const selectedProducts = useMemo(() => {
    return products.filter((p) => selectedIds.includes(p.sale_id));
  }, [products, selectedIds]);

  // 所有用户已选的商品（用于已选栏展示）
  const allSelectedProducts = useMemo(() => {
    const allIds = new Set<string>();
    for (const m of memberSelections) {
      for (const sid of m.sale_ids) {
        allIds.add(sid);
      }
    }
    // 也加入当前用户的选品
    for (const sid of selectedIds) {
      allIds.add(sid);
    }
    return products.filter((p) => allIds.has(p.sale_id));
  }, [products, selectedIds, memberSelections]);

  const toggleSelect = (saleId: string) => {
    if (!isAdmin) {
      alert("仅管理员可以选品");
      return;
    }
    setSelectedIds((prev) => {
      const next = prev.includes(saleId)
        ? prev.filter((id) => id !== saleId)
        : [...prev, saleId];
      saveSelectedToStorage(next);
      syncToServer(next);
      return next;
    });
  };

  // 清空自己选品
  const clearAll = () => {
    if (!isAdmin) return;
    const name = memberNameRef.current || "未知设备";
    // 只清空自己的选品
    fetch("/api/live-selections", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ member_name: name }),
    }).then(() => {
      setSelectedIds([]);
      saveSelectedToStorage([]);
      fetchMemberSelections();
    });
  };

  const handleExport = () => {
    if (selectedProducts.length === 0) {
      alert("没有已选商品");
      return;
    }

    const fields = [
      { key: "name", label: "商品名称", enabled: exportFields.name },
      { key: "sale_id", label: "商品编号", enabled: exportFields.sale_id },
      { key: "sell_price", label: "售价", enabled: exportFields.sell_price },
      { key: "cost_price", label: "进价", enabled: exportFields.cost_price },
      { key: "remaining", label: "剩余库存", enabled: exportFields.remaining },
      { key: "sold_total", label: "已售数量", enabled: exportFields.sold_total },
      { key: "profit", label: "利润", enabled: exportFields.profit },
      { key: "inventory_value", label: "库存价值", enabled: exportFields.inventory_value },
      { key: "manufacturer", label: "厂家", enabled: exportFields.manufacturer },
      { key: "shelf_no", label: "货架号", enabled: exportFields.shelf_no },
    ].filter((f) => f.enabled);

    const header = fields.map((f) => f.label).join(",");
    const rows = selectedProducts.map((p) =>
      fields.map((f) => {
        const val = p[f.key as keyof SummaryProduct];
        if (typeof val === "string" && val.includes(",")) return `"${val}"`;
        return val ?? "";
      }).join(",")
    );
    const csv = [header, ...rows].join("\n");

    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `直播选品_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExport(false);
  };

  // 做链接：复制已选品数据并打开抖店后台
  const handleCreateLink = () => {
    if (selectedProducts.length === 0) {
      alert("没有已选商品");
      return;
    }

    // 构造规格数据：编号作为规格名，库存数量
    const specs = selectedProducts.map((p) => `${p.sale_id}:库存${p.remaining}`);
    const specText = specs.join("\n");

    // 复制到剪贴板
    navigator.clipboard.writeText(specText).then(() => {
      // 打开抖店后台
      window.open("https://fxg.jinritemai.com/", "_blank");
      alert(`已复制 ${selectedProducts.length} 个商品规格到剪贴板，请在抖店后台粘贴使用。\n\n格式：编号:库存数量`);
    }).catch(() => {
      // 如果剪贴板失败，仍然打开抖店
      window.open("https://fxg.jinritemai.com/", "_blank");
      alert(`已选 ${selectedProducts.length} 个商品，请在抖店后台手动创建复合链接。\n\n规格数据：\n${specText}`);
    });
  };

  const formatMoney = (v: number | null | undefined) => {
    const num = v ?? 0;
    return `¥${num.toLocaleString("zh-CN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  };

  // 管理员颜色映射
  const ADMIN_COLORS = [
    { bg: "bg-[#FF6B7A]", border: "border-[#FF6B7A]", text: "text-white" },
    { bg: "bg-[#4A90E2]", border: "border-[#4A90E2]", text: "text-white" },
    { bg: "bg-[#FFC93C]", border: "border-[#FFC93C]", text: "text-gray-900" },
    { bg: "bg-[#4CD964]", border: "border-[#4CD964]", text: "text-white" },
    { bg: "bg-[#9B59B6]", border: "border-[#9B59B6]", text: "text-white" },
    { bg: "bg-[#FF8C42]", border: "border-[#FF8C42]", text: "text-white" },
    { bg: "bg-[#00BCD4]", border: "border-[#00BCD4]", text: "text-white" },
    { bg: "bg-[#E91E63]", border: "border-[#E91E63]", text: "text-white" },
  ];

  const getAdminColor = (name: string) => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return ADMIN_COLORS[Math.abs(hash) % ADMIN_COLORS.length];
  };

  // 所有选品总数
  const totalSelectedCount = useMemo(() => {
    const allIds = new Set<string>();
    for (const m of memberSelections) {
      for (const sid of m.sale_ids) {
        allIds.add(sid);
      }
    }
    return allIds.size;
  }, [memberSelections]);

  // 构建 商品→选品人 映射
  const saleSelections = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const m of memberSelections) {
      for (const sid of m.sale_ids) {
        if (!map[sid]) map[sid] = [];
        map[sid].push(m.member_name);
      }
    }
    return map;
  }, [memberSelections]);

  // 商品卡片组件 - 复刻移动端管理栏总表布局
  const ProductCard = ({ product, isSelected, selectors }: { product: SummaryProduct; isSelected: boolean; selectors: string[] }) => {
    const returnRate = product.sold_total > 0 ? product.return_total / product.sold_total : 0;
    const profitRate = product.sell_price > 0 ? (product.sell_price - product.cost_price) / product.sell_price : 0;

    return (
      <div className="bg-white rounded-xl border-[3px] shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] p-2.5 border-gray-900 relative">
        {/* 选品人角标 - 右上角 */}
        {selectors.length > 0 && (
          <div className="absolute -top-1.5 -right-1.5 flex flex-col gap-0.5 z-10">
            {selectors.map((name) => {
              const c = getAdminColor(name);
              return (
                <span key={name} className={`text-[9px] px-1.5 py-0.5 rounded-full border-2 ${c.bg} ${c.text} font-extrabold shadow-md whitespace-nowrap`}>
                  {name}已选品
                </span>
              );
            })}
          </div>
        )}
        <div className="flex gap-2">
          {/* 图片区域 */}
          <div className="w-52 h-52 rounded-lg border-2 border-gray-200 overflow-hidden bg-gray-100 shrink-0">
            {product.photo ? (
              <img src={product.photo} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Package className="h-20 w-20 text-gray-300" />
              </div>
            )}
          </div>
          {/* 右侧内容区 */}
          <div className="flex-1 min-w-0">
            {/* 编号 */}
            <div className="text-sm font-extrabold text-gray-900 truncate">{product.sale_id}</div>
            {product.name && <div className="text-xs text-gray-500 truncate">{product.name}</div>}
            {/* 货架号 */}
            {product.shelf_no && (
              <div className="text-[10px] text-gray-400 mt-0.5">货架: {product.shelf_no}</div>
            )}
            {/* 所有尺码 窄4列显示 */}
            <div className="mt-1 grid grid-cols-4 gap-x-0.5 gap-y-0.5">
              {ALL_SIZES.map((s) => {
                const val = Number(product[`size_${s}`]) || 0;
                return (
                  <span key={s} className={`text-[8px] px-1 py-1 rounded border font-bold text-center truncate ${
                    val < 0 ? "bg-red-50 border-red-300 text-red-600" :
                    val > 0 ? "bg-gray-100 border-gray-300 text-gray-700" :
                    "bg-white border-gray-200 text-gray-300"
                  }`}>{s}:{val}</span>
                );
              })}
            </div>
            {/* 售出/利润率 */}
            <div className="flex gap-3 mt-1">
              <div className="shrink-0">
                <span className="text-xs font-extrabold text-green-600">售出 {product.sold_total}</span>
                <span className={`text-xs font-bold ml-2 ${profitRate >= 0 ? "text-green-600" : "text-red-500"}`}>利润率 {pct(profitRate)}</span>
              </div>
            </div>
            {/* 退货/退货率 */}
            <div className="flex gap-3 mt-0.5">
              <div className="shrink-0">
                <span className="text-xs font-extrabold text-yellow-600">退货 {product.return_total}</span>
                <span className="text-xs font-bold ml-2 text-yellow-600">退货率 {pct(returnRate)}</span>
              </div>
            </div>
          </div>
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

        {/* 选品/取消选品按钮 */}
        {isSelected ? (
          <button
            onClick={() => toggleSelect(product.sale_id)}
            className="w-full mt-2 py-1.5 rounded-lg border-[2px] border-gray-400 text-xs font-extrabold bg-gray-300 text-gray-500 transition-all"
          >
            <span className="flex items-center justify-center gap-1">
              <X className="h-3 w-3" />取消选品
            </span>
          </button>
        ) : selectors.length > 0 ? (
          <button
            onClick={() => toggleSelect(product.sale_id)}
            className="w-full mt-2 py-1.5 rounded-lg border-[2px] border-gray-400 text-xs font-extrabold bg-gray-200 text-gray-400 transition-all"
          >
            <span className="flex items-center justify-center gap-1">
              <Check className="h-3 w-3" />已选品
            </span>
          </button>
        ) : (
          <button
            onClick={() => toggleSelect(product.sale_id)}
            className="w-full mt-2 py-1.5 rounded-lg border-[2px] border-gray-900 text-xs font-extrabold bg-[#4A90E2] text-white hover:bg-[#3A80D2] transition-all"
          >
            <span className="flex items-center justify-center gap-1">
              <Check className="h-3 w-3" />选品
            </span>
          </button>
        )}
      </div>
    );
  };

  return (
    <PageWrapper>
      {/* Header + Tabs (参照打包找货样式) */}
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
        
        {/* Tabs inline */}
        <div className="flex gap-1.5 sm:gap-2 ml-1">
          <button
            onClick={() => setTab("select")}
            className={`flex items-center gap-1 px-3 py-1.5 sm:px-5 sm:py-2 rounded-lg sm:rounded-xl border-[2px] sm:border-[3px] border-gray-900 font-extrabold text-xs sm:text-sm transition-all relative ${
              tab === "select" ? "bg-[#FFC93C] text-gray-900 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]" : "bg-white text-gray-700 hover:bg-gray-100"
            }`}
          >
            <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span>选品</span>
            {selectedIds.length > 0 && (
              <span className="inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-[#FF6B7A] text-white text-[9px] font-extrabold leading-none ml-0.5">
                {selectedIds.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab("selected")}
            className={`flex items-center gap-1 px-3 py-1.5 sm:px-5 sm:py-2 rounded-lg sm:rounded-xl border-[2px] sm:border-[3px] border-gray-900 font-extrabold text-xs sm:text-sm transition-all relative ${
              tab === "selected" ? "bg-[#4CD964] text-gray-900 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]" : "bg-white text-gray-700 hover:bg-gray-100"
            }`}
          >
            <Download className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span>已选</span>
            {totalSelectedCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-[#FF6B7A] text-white text-[9px] font-extrabold leading-none">
                {totalSelectedCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* 选品 Tab */}
      {tab === "select" && (
        <>
          {/* 筛选栏 */}
          <div className="bg-white rounded-xl border-[3px] border-gray-900 shadow-[3px_3px_0px_0px_rgba(0,0,0,0.3)] p-3 lg:p-4 mb-4">
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 z-10" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索商品名称或编号..."
                className="neo-input w-full text-sm pl-10 py-2"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-bold text-gray-500 mr-1">售卖:</span>
                {[
                  { value: "all", label: "全部" },
                  { value: "hasStock", label: "有库存" },
                  { value: "soldOut", label: "已售罄" },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setSoldFilter(opt.value)}
                    className={`text-[10px] px-2 py-1 rounded border-[1.5px] font-bold transition-all ${
                      soldFilter === opt.value
                        ? "border-gray-900 bg-gray-900 text-white"
                        : "border-gray-300 bg-white text-gray-500 hover:border-gray-500"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1">
                <span className="text-[10px] font-bold text-gray-500 mr-1">库存:</span>
                {[
                  { value: "all", label: "全部" },
                  { value: "low", label: "低(≤10)" },
                  { value: "normal", label: "中(11-50)" },
                  { value: "high", label: "高(>50)" },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setStockFilter(opt.value)}
                    className={`text-[10px] px-2 py-1 rounded border-[1.5px] font-bold transition-all ${
                      stockFilter === opt.value
                        ? "border-gray-900 bg-gray-900 text-white"
                        : "border-gray-300 bg-white text-gray-500 hover:border-gray-500"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1">
                <span className="text-[10px] font-bold text-gray-500 mr-1">价值:</span>
                {[
                  { value: "all", label: "全部" },
                  { value: "low", label: "低(≤1k)" },
                  { value: "mid", label: "中(1k-5k)" },
                  { value: "high", label: "高(>5k)" },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setValueFilter(opt.value)}
                    className={`text-[10px] px-2 py-1 rounded border-[1.5px] font-bold transition-all ${
                      valueFilter === opt.value
                        ? "border-gray-900 bg-gray-900 text-white"
                        : "border-gray-300 bg-white text-gray-500 hover:border-gray-500"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 商品列表 */}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-10 w-10 border-4 border-gray-200 border-t-[#4A90E2]" />
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Package className="h-12 w-12 text-gray-300" />
              <p className="font-bold text-gray-500 text-sm">暂无匹配商品</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {filteredProducts.map((product) => (
                <ProductCard
                  key={product.sale_id}
                  product={product}
                  isSelected={selectedIds.includes(product.sale_id)}
                  selectors={saleSelections[product.sale_id] || []}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* 已选 Tab */}
      {tab === "selected" && (
        <>
          <div className="flex items-center gap-2 mb-4">
            <div className="flex-1 text-sm font-bold text-gray-700">
              已选 <span className="text-[#FF6B7A]">{totalSelectedCount}</span> 款商品
            </div>
            <button
              onClick={handleCreateLink}
              disabled={selectedProducts.length === 0}
              className="inline-flex items-center gap-1 text-xs px-3 py-2 rounded-lg border-[2px] border-[#FFC93C] bg-[#FFC93C] text-gray-900 font-extrabold hover:bg-[#E5B528] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Link2 className="h-3 w-3" />做链接
            </button>
            <button
              onClick={() => setShowExport(true)}
              disabled={selectedProducts.length === 0}
              className="inline-flex items-center gap-1 text-xs px-3 py-2 rounded-lg border-[2px] border-[#4A90E2] bg-[#4A90E2] text-white font-extrabold hover:bg-[#3A80D2] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="h-3 w-3" />导出
            </button>
            <button
              onClick={clearAll}
              disabled={selectedProducts.length === 0}
              className="inline-flex items-center gap-1 text-xs px-3 py-2 rounded-lg border-[2px] border-[#FF6B7A] bg-[#FF6B7A] text-white font-extrabold hover:bg-[#E55A6A] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Trash2 className="h-3 w-3" />清空
            </button>
          </div>

          {allSelectedProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Package className="h-12 w-12 text-gray-300" />
              <p className="font-bold text-gray-500 text-sm">暂无已选商品</p>
              <p className="text-xs text-gray-400">去选品栏添加商品吧</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {allSelectedProducts.map((product) => (
                <ProductCard
                  key={product.sale_id}
                  product={product}
                  isSelected={selectedIds.includes(product.sale_id)}
                  selectors={saleSelections[product.sale_id] || []}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* 其他人选品情况 */}
      {memberSelections.length > 0 && (
        <div className="mt-6 bg-white rounded-xl border-[3px] border-gray-900 shadow-[3px_3px_0px_0px_rgba(0,0,0,0.3)] p-4">
          <div className="flex items-center gap-2 mb-3">
            <Users className="h-4 w-4 text-[#4A90E2]" />
            <h3 className="text-sm font-extrabold text-gray-900">其他人选品情况</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {memberSelections.map((m) => (
              <div
                key={m.member_name}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border-[2px] border-gray-300 bg-gray-50"
              >
                <span className="text-xs font-bold text-gray-700">{m.member_name}</span>
                <span className="inline-flex items-center justify-center h-5 min-w-5 px-1 rounded-full bg-[#FF6B7A] text-white text-[10px] font-extrabold">
                  {m.count}
                </span>
                <span className="text-[10px] text-gray-400">款</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 导出弹窗 */}
      {showExport && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowExport(false)}>
          <div
            className="bg-white rounded-2xl border-[3px] border-gray-900 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b-2 border-gray-200">
              <h3 className="text-base font-extrabold text-gray-900">自定义导出</h3>
              <button
                onClick={() => setShowExport(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border-2 border-gray-900 bg-white hover:bg-gray-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-4 max-h-[60vh] overflow-y-auto">
              <p className="text-xs text-gray-500 mb-3">选择要导出的字段：</p>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(exportFields).map(([key, value]) => {
                  const labels: Record<string, string> = {
                    name: "商品名称",
                    sale_id: "商品编号",
                    sell_price: "售价",
                    cost_price: "进价",
                    remaining: "剩余库存",
                    sold_total: "已售数量",
                    profit: "利润",
                    inventory_value: "库存价值",
                    manufacturer: "厂家",
                    shelf_no: "货架号",
                  };
                  return (
                    <label key={key} className="flex items-center gap-2 text-xs font-bold text-gray-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={value}
                        onChange={() =>
                          setExportFields((prev) => ({ ...prev, [key]: !prev[key as keyof typeof prev] }))
                        }
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      {labels[key] || key}
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="p-4 border-t-2 border-gray-200 flex gap-2">
              <button
                onClick={() => setShowExport(false)}
                className="flex-1 py-2.5 rounded-xl border-[2px] border-gray-300 bg-white text-gray-700 font-extrabold text-sm hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleExport}
                disabled={!Object.values(exportFields).some(Boolean)}
                className="flex-1 py-2.5 rounded-xl border-[2px] border-[#4A90E2] bg-[#4A90E2] text-white font-extrabold text-sm hover:bg-[#3A80D2] disabled:opacity-50"
              >
                导出 CSV
              </button>
            </div>
          </div>
        </div>
      )}
    </PageWrapper>
  );
}