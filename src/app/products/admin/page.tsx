"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Pause,
  Play,
  Package,
  ShoppingCart,
  Video,
  Plus,
  Trash2,
  Save,
  Loader2,
  ArrowLeft,
  QrCode,
  ExternalLink,
  Search,
  Check,
  X,
  SlidersHorizontal,
  Filter,
} from "lucide-react";
import { PageWrapper } from "@/components/page-wrapper";
import Link from "next/link";

const ALL_SIZES = [80, 90, 95, 100, 105, 110, 120, 130, 140, 150, 160, 170, 180] as const;

interface SummaryProduct {
  sale_id: string;
  name: string;
  photo: string;
  sell_price: number;
  cost_price: number;
  remaining: number;
  sold_total: number;
  return_total: number;
  inbound_total: number;
  inventory_value: number;
  manufacturer: string;
  shelf_no: string;
  [key: string]: unknown;
}

interface WebOrder {
  id: number;
  customer: string;
  address: string;
  recipient: string;
  recipient_phone: string;
  sale_id: string;
  size: number;
  quantity: number;
  sell_price: number;
  total_price: number;
  created_at: string;
}

interface DouyinLink {
  id: number;
  name: string;
  live_url: string;
  qr_code: string;
}

type Tab = "pause" | "display" | "orders" | "douyin";

export default function AdminProductsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("pause");
  const [loading, setLoading] = useState(true);

  // 暂停售卖
  const [isPaused, setIsPaused] = useState(false);
  const [savingPause, setSavingPause] = useState(false);
  const [pauseText, setPauseText] = useState("");
  const [savingPauseText, setSavingPauseText] = useState(false);

  // 商品展示
  const [products, setProducts] = useState<SummaryProduct[]>([]);
  const [displayList, setDisplayList] = useState<string[]>([]);
  const [savingDisplay, setSavingDisplay] = useState(false);

  // 商品展示筛选
  const [displaySearch, setDisplaySearch] = useState("");
  const [displaySoldFilter, setDisplaySoldFilter] = useState("all");
  const [displayStockFilter, setDisplayStockFilter] = useState("all");
  const [displayValueFilter, setDisplayValueFilter] = useState("all");
  const [displayErrorFilter, setDisplayErrorFilter] = useState("all");
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [imgPreview, setImgPreview] = useState<string | null>(null);

  // 售卖详情
  const [orders, setOrders] = useState<WebOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  // 抖音直播
  const [douyinLinks, setDouyinLinks] = useState<DouyinLink[]>([]);
  const [newLink, setNewLink] = useState({ name: "", live_url: "", qr_code: "" });
  const [savingDouyin, setSavingDouyin] = useState(false);

  useEffect(() => {
    const role = localStorage.getItem("member_role");
    if (role !== "admin") {
      window.location.href = "/products";
      return;
    }
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [summaryRes, settingsRes, douyinRes] = await Promise.all([
        fetch("/api/summary"),
        fetch("/api/settings"),
        fetch("/api/douyin-links"),
      ]);

      const summaryData = await summaryRes.json();
      const settingsData = await settingsRes.json();
      const douyinData = await douyinRes.json();

      const filtered = (Array.isArray(summaryData) ? summaryData : [])
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
      setIsPaused(settingsData?.pause_selling === true);
      setPauseText(settingsData?.pause_text || "");
      setDisplayList(Array.isArray(settingsData?.product_display_list) ? settingsData.product_display_list : []);
      setDouyinLinks(Array.isArray(douyinData) ? douyinData : []);
    } catch (err) {
      console.error("Fetch data error:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchOrders = async () => {
    setOrdersLoading(true);
    try {
      const res = await fetch("/api/web-orders");
      const data = await res.json();
      setOrders(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Fetch orders error:", err);
    } finally {
      setOrdersLoading(false);
    }
  };

  // 切换暂停售卖
  const togglePause = async () => {
    setSavingPause(true);
    try {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pause_selling: !isPaused }),
      });
      setIsPaused(!isPaused);
    } catch (err) {
      console.error("Toggle pause error:", err);
    } finally {
      setSavingPause(false);
    }
  };

  const savePauseText = async () => {
    setSavingPauseText(true);
    try {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pause_text: pauseText }),
      });
      alert("保存成功");
    } catch (err) {
      console.error("Save pause text error:", err);
    } finally {
      setSavingPauseText(false);
    }
  };

  // 切换商品展示
  const toggleProductDisplay = (saleId: string) => {
    setDisplayList((prev) => {
      if (prev.includes(saleId)) {
        return prev.filter((id) => id !== saleId);
      }
      return [...prev, saleId];
    });
  };

  const hasActiveFilters = displaySearch || displaySoldFilter !== "all" || displayStockFilter !== "all" || displayValueFilter !== "all" || displayErrorFilter !== "all";

  const selectAll = () => {
    const target = hasActiveFilters ? filteredDisplayProducts : products;
    setDisplayList(target.map((p) => p.sale_id));
  };

  const deselectAll = () => {
    if (hasActiveFilters) {
      setDisplayList((prev) => {
        const filteredIds = new Set(filteredDisplayProducts.map((p) => p.sale_id));
        return prev.filter((id) => !filteredIds.has(id));
      });
    } else {
      setDisplayList([]);
    }
  };

  const saveDisplay = async () => {
    setSavingDisplay(true);
    try {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_display_list: displayList }),
      });
      alert("保存成功");
    } catch (err) {
      console.error("Save display error:", err);
    } finally {
      setSavingDisplay(false);
    }
  };

  // 抖音链接管理
  const addDouyinLink = async () => {
    if (!newLink.name || !newLink.live_url) return;
    setSavingDouyin(true);
    try {
      const res = await fetch("/api/douyin-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newLink),
      });
      if (res.ok) {
        setNewLink({ name: "", live_url: "", qr_code: "" });
        const data = await res.json();
        setDouyinLinks((prev) => [data, ...prev]);
      }
    } catch (err) {
      console.error("Add douyin link error:", err);
    } finally {
      setSavingDouyin(false);
    }
  };

  const deleteDouyinLink = async (id: number) => {
    try {
      await fetch(`/api/douyin-links?id=${id}`, { method: "DELETE" });
      setDouyinLinks((prev) => prev.filter((l) => l.id !== id));
    } catch (err) {
      console.error("Delete douyin link error:", err);
    }
  };

  const formatMoney = (v: number) => {
    return `¥${v.toLocaleString("zh-CN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  };

  const fmt = (n: number) => n.toFixed(2);
  const pct = (n: number) => (n * 100).toFixed(1) + "%";

  // 过滤展示商品
  const filteredDisplayProducts = products.filter((p) => {
    if (displaySearch) {
      const s = displaySearch.toLowerCase();
      if (!(p.name || "").toLowerCase().includes(s) && !(p.sale_id || "").toLowerCase().includes(s)) return false;
    }
    if (displaySoldFilter === "hasStock" && p.remaining <= 0) return false;
    if (displaySoldFilter === "soldOut" && p.remaining > 0) return false;
    if (displayStockFilter === "low" && (p.remaining <= 0 || p.remaining > 10)) return false;
    if (displayStockFilter === "normal" && (p.remaining <= 10 || p.remaining > 50)) return false;
    if (displayStockFilter === "high" && p.remaining <= 50) return false;
    if (displayValueFilter === "low" && (p.inventory_value <= 0 || p.inventory_value > 1000)) return false;
    if (displayValueFilter === "mid" && (p.inventory_value <= 1000 || p.inventory_value > 5000)) return false;
    if (displayValueFilter === "high" && p.inventory_value <= 5000) return false;
    if (displayErrorFilter === "negative") {
      const hasNegative = ALL_SIZES.some((s) => Number(p[`size_${s}`]) < 0);
      if (!hasNegative) return false;
    }
    return true;
  });

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "-";
    const d = new Date(dateStr);
    return d.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  };

  const tabs: { key: Tab; label: string; labelMobile: string; icon: React.ReactNode }[] = [
    { key: "pause", label: "暂停售卖", labelMobile: "暂停", icon: <Pause className="h-4 w-4" /> },
    { key: "display", label: "商品展示", labelMobile: "展示", icon: <Package className="h-4 w-4" /> },
    { key: "orders", label: "售卖详情", labelMobile: "详情", icon: <ShoppingCart className="h-4 w-4" /> },
    { key: "douyin", label: "直播抖音", labelMobile: "抖音", icon: <Video className="h-4 w-4" /> },
  ];

  if (loading) {
    return (
      <PageWrapper>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/products"
          className="flex items-center gap-1 px-3 py-2 rounded-xl border-[3px] border-gray-900 bg-white font-bold text-xs shadow-[3px_3px_0px_0px_rgba(0,0,0,0.3)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,0.3)] hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          返回
        </Link>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900">
          <span className="highlight-blue">商品后台</span>
        </h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => {
              setActiveTab(tab.key);
              if (tab.key === "orders") fetchOrders();
            }}
            className={`flex items-center gap-1 px-2.5 py-2 sm:px-4 rounded-lg sm:rounded-xl border-[2px] sm:border-[3px] font-bold text-[10px] sm:text-xs lg:text-sm transition-all flex-1 sm:flex-none justify-center ${
              activeTab === tab.key
                ? "border-gray-900 bg-gray-900 text-white shadow-[3px_3px_0px_0px_rgba(0,0,0,0.3)]"
                : "border-gray-300 bg-white text-gray-600 hover:border-gray-900"
            }`}
          >
            {tab.icon}
            <span className="sm:hidden">{tab.labelMobile}</span>
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <motion.div key={activeTab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="min-h-[400px]">
        {/* 暂停售卖 */}
        {activeTab === "pause" && (
          <div className="rounded-xl border-[3px] border-gray-900 bg-white p-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            <h2 className="text-lg font-extrabold text-gray-900 mb-4">暂停售卖设置</h2>
            <p className="text-sm text-gray-500 mb-4">
              开启暂停售卖后，商品页面将显示警戒线，顾客无法选购商品，并显示自定义提示文字
            </p>
            <div className="flex items-center gap-4 mb-4">
              <button
                onClick={togglePause}
                disabled={savingPause}
                className={`flex items-center gap-2 px-6 py-3 rounded-xl border-[3px] border-gray-900 font-extrabold text-sm shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] transition-all ${
                  isPaused ? "bg-[#4CD964] text-white" : "bg-[#FF6B7A] text-white"
                }`}
              >
                {isPaused ? (
                  <>
                    <Play className="h-4 w-4" />
                    恢复售卖
                  </>
                ) : (
                  <>
                    <Pause className="h-4 w-4" />
                    暂停售卖
                  </>
                )}
              </button>
              <span className={`text-sm font-bold ${isPaused ? "text-[#FF6B7A]" : "text-[#4CD964]"}`}>
                {isPaused ? "当前状态：已暂停" : "当前状态：正常售卖"}
              </span>
            </div>

            {/* 自定义暂停显示文字 */}
            <div className="mt-4 pt-4 border-t-2 border-gray-200">
              <h3 className="text-sm font-extrabold text-gray-900 mb-2">自定义暂停提示文字</h3>
              <p className="text-xs text-gray-500 mb-2">
                暂停售卖时，商品页面顶部将显示此处配置的文字内容
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={pauseText}
                  onChange={(e) => setPauseText(e.target.value)}
                  placeholder="例如：正在直播，请去直播间下单哦"
                  className="neo-input flex-1 text-sm py-2"
                />
                <button
                  onClick={savePauseText}
                  disabled={savingPauseText}
                  className="flex items-center gap-1 px-4 py-2 rounded-xl border-[3px] border-gray-900 bg-[#4A90E2] text-white font-bold text-xs shadow-[3px_3px_0px_0px_rgba(0,0,0,0.3)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,0.3)] hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
                >
                  {savingPauseText ? "保存中..." : "保存"}
                </button>
              </div>
            </div>

            {isPaused && douyinLinks.length > 0 && (
              <div className="mt-6 pt-4 border-t-2 border-gray-200">
                <h3 className="text-sm font-extrabold text-gray-900 mb-2">暂停时展示的抖音链接</h3>
                <div className="space-y-2">
                  {douyinLinks.map((link) => (
                    <div key={link.id} className="flex items-center gap-2 bg-gray-50 rounded-lg p-2 border-2 border-gray-200">
                      <span className="text-sm font-bold">{link.name}</span>
                      <a href={link.live_url} target="_blank" rel="noopener noreferrer" className="text-xs text-[#4A90E2] hover:underline flex items-center gap-1">
                        <ExternalLink className="h-3 w-3" />直播链接
                      </a>
                      {link.qr_code && (
                        <span className="text-xs text-gray-400">分享码已设置</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 商品展示 */}
        {activeTab === "display" && (
          <div className="rounded-xl border-[3px] border-gray-900 bg-white p-4 lg:p-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <div>
                <h2 className="text-lg font-extrabold text-gray-900">商品展示管理</h2>
                <p className="text-xs text-gray-500 mt-1">
                  选择要在商品栏中展示的商品。不选则显示全部。已选 {displayList.length} / {products.length}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={selectAll} className="text-xs font-bold text-[#4A90E2] hover:underline px-2">全展示</button>
                <button onClick={deselectAll} className="text-xs font-bold text-[#FF6B7A] hover:underline px-2">取消全展示</button>
                <button
                  onClick={saveDisplay}
                  disabled={savingDisplay}
                  className="flex items-center gap-1 px-4 py-2 rounded-xl border-[3px] border-gray-900 bg-[#4CD964] text-white font-bold text-xs shadow-[3px_3px_0px_0px_rgba(0,0,0,0.3)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,0.3)] hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
                >
                  <Save className="h-3.5 w-3.5" />
                  {savingDisplay ? "保存中..." : "保存"}
                </button>
              </div>
            </div>

            {/* 筛选栏 - 搜索框 + 筛选下拉按钮 */}
            <div className="mb-4">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 z-10" />
                  <input
                    type="text"
                    value={displaySearch}
                    onChange={(e) => setDisplaySearch(e.target.value)}
                    placeholder="搜索商品名称或编号..."
                    className="neo-input w-full text-sm pl-10 py-2 border-[2px]"
                  />
                </div>
                <div className="relative">
                  <button
                    onClick={() => setShowFilterDropdown(!showFilterDropdown)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border-[2px] border-gray-900 font-bold text-xs transition-all ${
                      showFilterDropdown || displaySoldFilter !== "all" || displayStockFilter !== "all" || displayValueFilter !== "all" || displayErrorFilter !== "all"
                        ? "bg-gray-900 text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,0.3)]"
                        : "bg-white text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    筛选
                    {(displaySoldFilter !== "all" || displayStockFilter !== "all" || displayValueFilter !== "all" || displayErrorFilter !== "all") && (
                      <span className="inline-flex items-center justify-center h-3.5 min-w-3.5 px-1 rounded-full bg-[#FF6B7A] text-white text-[8px] font-extrabold leading-none">
                        !
                      </span>
                    )}
                  </button>
                  {/* 筛选下拉面板 */}
                  {showFilterDropdown && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowFilterDropdown(false)} />
                      <div className="absolute right-0 top-full mt-2 z-20 w-80 bg-white rounded-xl border-[3px] border-gray-900 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-4">
                        {/* 售卖状态 */}
                        <div className="mb-3">
                          <span className="text-[10px] font-bold text-gray-500 mb-1.5 block">售卖状态</span>
                          <div className="flex flex-wrap gap-1.5">
                            {[
                              { value: "all", label: "全部" },
                              { value: "hasStock", label: "有库存" },
                              { value: "soldOut", label: "已售罄" },
                            ].map((opt) => (
                              <button
                                key={opt.value}
                                onClick={() => setDisplaySoldFilter(opt.value)}
                                className={`text-[10px] px-2 py-1 rounded border-[1.5px] font-bold transition-all ${
                                  displaySoldFilter === opt.value
                                    ? "border-gray-900 bg-gray-900 text-white"
                                    : "border-gray-300 bg-white text-gray-500 hover:border-gray-500"
                                }`}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* 剩余库存 */}
                        <div className="mb-3">
                          <span className="text-[10px] font-bold text-gray-500 mb-1.5 block">剩余库存</span>
                          <div className="flex flex-wrap gap-1.5">
                            {[
                              { value: "all", label: "全部" },
                              { value: "low", label: "低(≤10)" },
                              { value: "normal", label: "中(11-50)" },
                              { value: "high", label: "高(>50)" },
                            ].map((opt) => (
                              <button
                                key={opt.value}
                                onClick={() => setDisplayStockFilter(opt.value)}
                                className={`text-[10px] px-2 py-1 rounded border-[1.5px] font-bold transition-all ${
                                  displayStockFilter === opt.value
                                    ? "border-gray-900 bg-gray-900 text-white"
                                    : "border-gray-300 bg-white text-gray-500 hover:border-gray-500"
                                }`}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* 库存价值 */}
                        <div className="mb-3">
                          <span className="text-[10px] font-bold text-gray-500 mb-1.5 block">库存价值</span>
                          <div className="flex flex-wrap gap-1.5">
                            {[
                              { value: "all", label: "全部" },
                              { value: "low", label: "低(≤1k)" },
                              { value: "mid", label: "中(1k-5k)" },
                              { value: "high", label: "高(>5k)" },
                            ].map((opt) => (
                              <button
                                key={opt.value}
                                onClick={() => setDisplayValueFilter(opt.value)}
                                className={`text-[10px] px-2 py-1 rounded border-[1.5px] font-bold transition-all ${
                                  displayValueFilter === opt.value
                                    ? "border-gray-900 bg-gray-900 text-white"
                                    : "border-gray-300 bg-white text-gray-500 hover:border-gray-500"
                                }`}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* 错误库存 */}
                        <div className="mb-3">
                          <span className="text-[10px] font-bold text-gray-500 mb-1.5 block">错误库存</span>
                          <div className="flex flex-wrap gap-1.5">
                            {[
                              { value: "all", label: "全部" },
                              { value: "negative", label: "负库存" },
                            ].map((opt) => (
                              <button
                                key={opt.value}
                                onClick={() => setDisplayErrorFilter(opt.value)}
                                className={`text-[10px] px-2 py-1 rounded border-[1.5px] font-bold transition-all ${
                                  displayErrorFilter === opt.value
                                    ? "border-gray-900 bg-gray-900 text-white"
                                    : "border-gray-300 bg-white text-gray-500 hover:border-gray-500"
                                }`}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* 重置按钮 */}
                        <button
                          onClick={() => {
                            setDisplaySoldFilter("all");
                            setDisplayStockFilter("all");
                            setDisplayValueFilter("all");
                            setDisplayErrorFilter("all");
                          }}
                          className="w-full mt-2 py-1.5 rounded-lg border-[2px] border-gray-300 text-[10px] font-bold text-gray-500 hover:border-gray-500 hover:text-gray-700 transition-all"
                        >
                          重置所有筛选
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* 商品卡片列表 - 复用管理栏总表布局 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 max-h-[600px] overflow-y-auto">
              {filteredDisplayProducts.map((product) => {
                const isDisplayed = displayList.length === 0 || displayList.includes(product.sale_id);
                const returnRate = product.sold_total > 0 ? product.return_total / product.sold_total : 0;
                const profitRate = product.sell_price > 0 ? (product.sell_price - product.cost_price) / product.sell_price : 0;

                return (
                  <div key={product.sale_id} className="bg-white rounded-xl border-[3px] shadow-[3px_3px_0px_0px_rgba(0,0,0,0.3)] p-2.5 border-gray-300">
                    <div className="flex gap-2">
                      {/* 图片区域 */}
                      <div className="w-52 h-52 rounded-lg border-2 border-gray-200 overflow-hidden bg-gray-100 shrink-0">
                        {product.photo ? (
                          <img src={product.photo} alt="" className="w-full h-full object-cover cursor-pointer" onClick={() => setImgPreview(product.photo)} />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Package className="h-20 w-20 text-gray-300" />
                          </div>
                        )}
                      </div>
                      {/* 右侧内容区 */}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-extrabold text-gray-900 truncate">{product.sale_id}</div>
                        {product.name && <div className="text-xs text-gray-500 truncate">{product.name}</div>}
                        {product.shelf_no && (
                          <div className="text-[10px] text-gray-400 mt-0.5">货架: {product.shelf_no}</div>
                        )}
                        {/* 所有尺码 */}
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
                    {/* 入库/剩余/价值 */}
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
                    {/* 展示/取消展示按钮 */}
                    <button
                      onClick={() => toggleProductDisplay(product.sale_id)}
                      className={`w-full mt-2 py-1.5 rounded-lg border-[2px] border-gray-900 text-xs font-extrabold transition-all ${
                        isDisplayed
                          ? "bg-gray-300 text-gray-500 border-gray-400"
                          : "bg-[#4A90E2] text-white hover:bg-[#3A80D2]"
                      }`}
                    >
                      {isDisplayed ? (
                        <span className="flex items-center justify-center gap-1">
                          <X className="h-3 w-3" />取消展示
                        </span>
                      ) : (
                        <span className="flex items-center justify-center gap-1">
                          <Check className="h-3 w-3" />展示商品
                        </span>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 售卖详情 */}
        {activeTab === "orders" && (
          <div className="rounded-xl border-[3px] border-gray-900 bg-white p-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-extrabold text-gray-900">网页下单记录</h2>
              <button
                onClick={fetchOrders}
                className="text-xs font-bold text-[#4A90E2] hover:underline"
              >
                刷新
              </button>
            </div>

            {ordersLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : orders.length === 0 ? (
              <div className="text-center py-10 text-gray-400 text-sm">暂无下单记录</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b-2 border-gray-200">
                      <th className="text-left py-2 px-2 font-extrabold">时间</th>
                      <th className="text-left py-2 px-2 font-extrabold">顾客</th>
                      <th className="text-left py-2 px-2 font-extrabold">商品编号</th>
                      <th className="text-center py-2 px-2 font-extrabold">尺码</th>
                      <th className="text-center py-2 px-2 font-extrabold">数量</th>
                      <th className="text-right py-2 px-2 font-extrabold">售价</th>
                      <th className="text-right py-2 px-2 font-extrabold">金额</th>
                      <th className="text-left py-2 px-2 font-extrabold">收件人</th>
                      <th className="text-left py-2 px-2 font-extrabold">电话</th>
                      <th className="text-left py-2 px-2 font-extrabold">地址</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => (
                      <tr key={order.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-2 px-2 text-gray-500">{formatDate(order.created_at)}</td>
                        <td className="py-2 px-2 font-bold">{order.customer}</td>
                        <td className="py-2 px-2 font-mono text-gray-500">{order.sale_id}</td>
                        <td className="py-2 px-2 text-center font-bold">{order.size}码</td>
                        <td className="py-2 px-2 text-center font-bold">{order.quantity}</td>
                        <td className="py-2 px-2 text-right text-[#FF6B7A] font-bold">{formatMoney(order.sell_price)}</td>
                        <td className="py-2 px-2 text-right text-[#FF6B7A] font-bold">{formatMoney(order.total_price)}</td>
                        <td className="py-2 px-2">{order.recipient}</td>
                        <td className="py-2 px-2">{order.recipient_phone}</td>
                        <td className="py-2 px-2 text-gray-500 max-w-[150px] truncate">{order.address}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* 直播抖音 */}
        {activeTab === "douyin" && (
          <div className="rounded-xl border-[3px] border-gray-900 bg-white p-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            <h2 className="text-lg font-extrabold text-gray-900 mb-4">抖音直播管理</h2>
            <p className="text-xs text-gray-500 mb-4">
              添加抖音直播号，暂停售卖时会在商品页面展示跳转链接和分享码
            </p>

            {/* 新增链接表单 */}
            <div className="bg-gray-50 rounded-xl border-2 border-gray-200 p-4 mb-4">
              <h3 className="text-sm font-extrabold text-gray-900 mb-3">添加抖音直播号</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                <div>
                  <label className="text-[10px] font-bold text-gray-500 mb-1 block">直播号名称</label>
                  <input
                    type="text"
                    value={newLink.name}
                    onChange={(e) => setNewLink({ ...newLink, name: e.target.value })}
                    placeholder="例如: 大炳家"
                    className="neo-input w-full text-xs py-1.5"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-500 mb-1 block">直播链接</label>
                  <input
                    type="text"
                    value={newLink.live_url}
                    onChange={(e) => setNewLink({ ...newLink, live_url: e.target.value })}
                    placeholder="https://..."
                    className="neo-input w-full text-xs py-1.5"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-500 mb-1 block">分享码图片链接</label>
                  <input
                    type="text"
                    value={newLink.qr_code}
                    onChange={(e) => setNewLink({ ...newLink, qr_code: e.target.value })}
                    placeholder="https://... 图片链接"
                    className="neo-input w-full text-xs py-1.5"
                  />
                </div>
              </div>
              <button
                onClick={addDouyinLink}
                disabled={savingDouyin || !newLink.name || !newLink.live_url}
                className="flex items-center gap-1 px-4 py-2 rounded-xl border-[3px] border-gray-900 bg-[#4A90E2] text-white font-bold text-xs shadow-[3px_3px_0px_0px_rgba(0,0,0,0.3)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,0.3)] hover:translate-x-[2px] hover:translate-y-[2px] transition-all disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" />
                添加
              </button>
            </div>

            {/* 已有链接列表 */}
            <div className="space-y-2">
              {douyinLinks.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">暂无抖音直播号</p>
              ) : (
                douyinLinks.map((link) => (
                  <div key={link.id} className="flex items-center justify-between bg-white rounded-xl border-2 border-gray-200 p-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Video className="h-4 w-4 text-[#FF6B7A]" />
                        <span className="text-sm font-extrabold text-gray-900">{link.name}</span>
                      </div>
                      <div className="flex items-center gap-4 mt-1">
                        <a href={link.live_url} target="_blank" rel="noopener noreferrer" className="text-xs text-[#4A90E2] hover:underline flex items-center gap-1">
                          <ExternalLink className="h-3 w-3" /> 直播链接
                        </a>
                        {link.qr_code && (
                          <a href={link.qr_code} target="_blank" rel="noopener noreferrer" className="text-xs text-gray-500 hover:underline flex items-center gap-1">
                            <QrCode className="h-3 w-3" /> 分享码
                          </a>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => deleteDouyinLink(link.id)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border-2 border-gray-200 text-gray-400 hover:border-[#FF6B7A] hover:text-[#FF6B7A] transition-all shrink-0 ml-3"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      {/* 图片大图预览 */}
      {imgPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setImgPreview(null)}>
          <div className="relative max-w-[90vw] max-h-[90vh]">
            <button onClick={() => setImgPreview(null)} className="absolute -top-3 -right-3 z-10 w-8 h-8 bg-white rounded-full border-[3px] border-gray-900 flex items-center justify-center shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:bg-gray-100">
              <X className="h-4 w-4" />
            </button>
            <img src={imgPreview} alt="" className="max-w-full max-h-[90vh] rounded-xl border-[3px] border-gray-900 object-contain bg-white" />
          </div>
        </div>
      )}
      </motion.div>
    </PageWrapper>
  );
}