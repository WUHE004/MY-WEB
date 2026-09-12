"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { ArrowLeft, Camera, Search, Package, CheckCircle, PauseCircle, Truck, Trash2, ChevronDown, X, Pencil } from "lucide-react";
import Link from "next/link";
import { PageWrapper } from "@/components/page-wrapper";
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

type TabMode = "find" | "pack";
type PackFilter = "" | "suspended" | "found" | "shipped";

export default function PackPage() {
  const [activeTab, setActiveTab] = useState<TabMode>("find");

  const [trackingNumber, setTrackingNumber] = useState("");
  const [searchResults, setSearchResults] = useState<SalesRecord[]>([]);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const [packRecords, setPackRecords] = useState<PackRecord[]>([]);
  const [packFilter, setPackFilter] = useState<PackFilter>("");

  const [showScanner, setShowScanner] = useState(false);
  // 后六位匹配到多个面单号时的候选列表
  const [matchedTrackingNumbers, setMatchedTrackingNumbers] = useState<string[]>([]);

  // 打包模式: 面单查找(查已提交的记录) + 扫码模式区分
  const [packTrackingNumber, setPackTrackingNumber] = useState("");
  const [scannerMode, setScannerMode] = useState<"find" | "pack">("find");
  // 打包模式: 展开的文件夹合集
  const [expandedPackId, setExpandedPackId] = useState<number | null>(null);
  // 找货模式: 货架号编辑(卡片索引)
  const [editingShelfIdx, setEditingShelfIdx] = useState<number | null>(null);
  const [shelfEditValue, setShelfEditValue] = useState("");

  useEffect(() => { fetchPackRecords(); }, []);

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
        alert(status === "found" ? "已标记为找齐" : "已挂起");
        setSearchResults([]); setSearched(false); setTrackingNumber(""); fetchPackRecords();
      } else { const err = await res.json(); alert("操作失败: " + (err.error || "未知错误")); }
    } catch { alert("网络错误，请重试"); }
  };

  const handlePackAction = async (recordId: number, status: string) => {
    const packer = localStorage.getItem("member_name") || "未知";
    try {
      const res = await fetch("/api/pack", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: recordId, status, packer: status === "shipped" ? packer : undefined }),
      });
      if (res.ok) { fetchPackRecords(); }
      else { const err = await res.json(); alert("操作失败: " + (err.error || "未知错误")); }
    } catch { alert("网络错误，请重试"); }
  };

  // 清空全部历史
  const handleClearAll = async () => {
    if (packRecords.length === 0) { alert("没有可清除的记录"); return; }
    if (!confirm("确定要清空所有找货打包记录吗？此操作不可恢复！")) return;
    try {
      const res = await fetch("/api/pack?all=true", { method: "DELETE" });
      if (res.ok) { setPackRecords([]); setPackFilter(""); }
      else { const err = await res.json(); alert("清空失败: " + (err.error || "未知错误")); }
    } catch { alert("网络错误，请重试"); }
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
        alert("货架号保存失败: " + (err.error || "未知错误"));
        return;
      }
      setSearchResults((prev) => prev.map((r) => (r.sale_id === saleId ? { ...r, shelf_no: shelfNo } : r)));
      setEditingShelfIdx(null);
    } catch { alert("网络错误，请重试"); }
  };

  // 打包模式: 状态筛选 + 面单号查找(已提交记录, 支持完整精确/后六位后缀匹配, 本地过滤)
  const packSearchQ = packTrackingNumber.trim();
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
          <div className="mb-4 sm:mb-6">
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
            <div>
              <p className="text-xs sm:text-sm font-bold text-gray-500 mb-3 sm:mb-4">
                共找到 {searchResults.length} 件商品 · 面单号: {trackingNumber}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-4 sm:mb-6">
                {searchResults.map((item, index) => (
                  <div key={index} className="bg-white rounded-xl border-[3px] border-gray-900 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] overflow-hidden">
                    <div className="aspect-square bg-gray-100 flex items-center justify-center overflow-hidden">
                      {item.photo ? <img src={item.photo} alt="" className="w-full h-full object-cover" /> : <Package className="h-12 w-12 text-gray-300" />}
                    </div>
                    <div className="p-3 sm:p-4">
                      <div className="text-xs sm:text-sm font-extrabold text-gray-900 mb-1 truncate">{item.sale_id}</div>
                      <div className="text-xs text-gray-500 mb-2 truncate">{item.product_name || "商品名称"}</div>
                      {/* 找货三要素: 数量/尺码/货架号 突出显示 */}
                      <div className="grid grid-cols-3 gap-1.5 sm:gap-2 mb-2">
                        <div className="rounded-lg border-2 border-gray-900 bg-[#FF6B7A] px-1 py-1.5 text-center">
                          <div className="text-[9px] font-bold text-white/90 leading-none mb-0.5">数量</div>
                          <div className="text-lg sm:text-xl font-extrabold text-white leading-tight">{item.quantity}</div>
                        </div>
                        <div className="rounded-lg border-2 border-gray-900 bg-[#FFC93C] px-1 py-1.5 text-center">
                          <div className="text-[9px] font-bold text-gray-700 leading-none mb-0.5">尺码</div>
                          <div className="text-lg sm:text-xl font-extrabold text-gray-900 leading-tight">{item.size}</div>
                        </div>
                        <div
                          onClick={() => { setEditingShelfIdx(editingShelfIdx === index ? null : index); setShelfEditValue(item.shelf_no || ""); }}
                          className="relative rounded-lg border-2 border-gray-900 bg-[#4CD964] px-1 py-1.5 text-center cursor-pointer active:scale-95 transition-transform"
                          title="点击修改货架号"
                        >
                          <div className="text-[9px] font-bold text-white/90 leading-none mb-0.5">货架号<Pencil className="inline h-2 w-2 ml-0.5" /></div>
                          <div className="text-base sm:text-lg font-extrabold text-white leading-tight truncate">{item.shelf_no || "点击添加"}</div>
                        </div>
                      </div>
                      {/* 货架号编辑栏 */}
                      {editingShelfIdx === index && (
                        <div className="flex gap-1.5 mb-2">
                          <input
                            type="text"
                            value={shelfEditValue}
                            onChange={(e) => setShelfEditValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleShelfSave(item.sale_id, shelfEditValue.trim());
                              if (e.key === "Escape") setEditingShelfIdx(null);
                            }}
                            autoFocus
                            placeholder="输入货架号，如 A-1-2"
                            className="neo-input flex-1 min-w-0 text-xs h-9"
                          />
                          <button
                            onClick={() => handleShelfSave(item.sale_id, shelfEditValue.trim())}
                            className="h-9 px-3 rounded-lg border-2 border-gray-900 bg-[#4CD964] text-white text-xs font-extrabold shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-[1px] active:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] shrink-0"
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
                <button onClick={() => handleSubmitFind("found")} disabled={matchedTrackingNumbers.length > 1} className="flex items-center justify-center gap-1.5 flex-1 py-2.5 sm:py-3 rounded-xl border-[3px] border-gray-900 bg-[#4CD964] text-white font-extrabold text-xs sm:text-sm shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:translate-y-[2px] transition-all disabled:opacity-50 disabled:hover:shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] disabled:hover:translate-y-0 disabled:cursor-not-allowed">
                  <CheckCircle className="h-4 w-4" /><span>货已找齐</span>
                </button>
                <button onClick={() => handleSubmitFind("suspended")} disabled={matchedTrackingNumbers.length > 1} className="flex items-center justify-center gap-1.5 flex-1 py-2.5 sm:py-3 rounded-xl border-[3px] border-gray-900 bg-[#FFC93C] text-gray-900 font-extrabold text-xs sm:text-sm shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:translate-y-[2px] transition-all disabled:opacity-50 disabled:hover:shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] disabled:hover:translate-y-0 disabled:cursor-not-allowed">
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
          {/* 面单查找框（与找货同款, 查已提交记录） */}
          <div className="mb-3 sm:mb-4">
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
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-3 sm:mb-4">
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
              <span>清空历史</span>
            </button>
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
              return (
                <div key={record.id} className="mb-3 sm:mb-4 bg-white rounded-xl border-[3px] border-gray-900 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] overflow-hidden">
                  {/* 文件夹头部: 缩略图 + 面单信息 + 状态 + 操作按钮, 点击主体展开/收起 */}
                  <div className="p-3 sm:p-4 bg-gray-50 border-b-2 border-gray-200">
                    <div
                      className="flex items-center gap-3 cursor-pointer"
                      onClick={() => setExpandedPackId(expanded ? null : record.id)}
                    >
                      {/* 第一个商品照片缩略图 */}
                      <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-lg border-2 border-gray-900 bg-gray-100 overflow-hidden shrink-0 flex items-center justify-center">
                        {firstPhoto ? <img src={firstPhoto} alt="" className="w-full h-full object-cover" /> : <Package className="h-6 w-6 text-gray-300" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-extrabold text-gray-900 truncate">{record.tracking_number}</span>
                          <span className={`px-2 py-0.5 rounded-lg border-2 text-[10px] font-extrabold shrink-0 ${st.color}`}>{st.text}</span>
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5 truncate">
                          {record.submitter} · {new Date(record.created_at).toLocaleString("zh-CN")} · {record.items.length}件
                        </div>
                      </div>
                      <ChevronDown className={`h-4 w-4 text-gray-400 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />
                    </div>
                    {/* 操作按钮(独立于展开点击区) */}
                    {record.status !== "shipped" && (
                      <div className="flex gap-2 mt-2.5">
                        {(record.status === "pending" || record.status === "suspended") && (
                          <button onClick={() => handlePackAction(record.id, "found")} className="flex items-center justify-center gap-1 flex-1 py-2 sm:py-2.5 rounded-xl border-[3px] border-gray-900 bg-[#4CD964] text-white font-extrabold text-xs sm:text-sm shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:translate-y-[1px] transition-all">
                            <CheckCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4" /><span>找齐</span>
                          </button>
                        )}
                        {record.status === "found" && (
                          <button onClick={() => handlePackAction(record.id, "suspended")} className="flex items-center justify-center gap-1 flex-1 py-2 sm:py-2.5 rounded-xl border-[3px] border-gray-900 bg-[#FFC93C] text-gray-900 font-extrabold text-xs sm:text-sm shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:translate-y-[1px] transition-all">
                            <PauseCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4" /><span>挂起</span>
                          </button>
                        )}
                        <button onClick={() => handlePackAction(record.id, "shipped")} className="flex items-center justify-center gap-1 flex-1 py-2 sm:py-2.5 rounded-xl border-[3px] border-gray-900 bg-[#4A90E2] text-white font-extrabold text-xs sm:text-sm shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:translate-y-[1px] transition-all">
                          <Truck className="h-3.5 w-3.5 sm:h-4 sm:w-4" /><span>发货</span>
                        </button>
                      </div>
                    )}
                  </div>
                  {/* 展开内容: 该面单下所有商品 */}
                  {expanded && (
                    <div className="p-3 sm:p-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                        {record.items.map((item, idx) => (
                          <div key={idx} className="bg-gray-50 rounded-xl border-2 border-gray-200 overflow-hidden">
                            <div className="aspect-square bg-gray-100 flex items-center justify-center overflow-hidden">
                              {item.photo ? <img src={item.photo} alt="" className="w-full h-full object-cover" /> : <Package className="h-12 w-12 text-gray-300" />}
                            </div>
                            <div className="p-2 sm:p-3">
                              <div className="text-xs font-extrabold text-gray-900 truncate">{item.sale_id}</div>
                              {/* 找货三要素: 数量/尺码/货架号 突出显示(与找货模式一致) */}
                              <div className="grid grid-cols-3 gap-1.5 mt-1.5 mb-1.5">
                                <div className="rounded-lg border-2 border-gray-900 bg-[#FF6B7A] px-1 py-1 text-center">
                                  <div className="text-[9px] font-bold text-white/90 leading-none mb-0.5">数量</div>
                                  <div className="text-lg font-extrabold text-white leading-tight">{item.quantity}</div>
                                </div>
                                <div className="rounded-lg border-2 border-gray-900 bg-[#FFC93C] px-1 py-1 text-center">
                                  <div className="text-[9px] font-bold text-gray-700 leading-none mb-0.5">尺码</div>
                                  <div className="text-lg font-extrabold text-gray-900 leading-tight">{item.size}</div>
                                </div>
                                <div className="rounded-lg border-2 border-gray-900 bg-[#4CD964] px-1 py-1 text-center">
                                  <div className="text-[9px] font-bold text-white/90 leading-none mb-0.5">货架号</div>
                                  <div className="text-base font-extrabold text-white leading-tight truncate">{item.shelf_no || "-"}</div>
                                </div>
                              </div>
                              <div className="text-xs text-gray-400 truncate">¥{item.sell_price} · {item.manufacturer || "-"}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
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
    </PageWrapper>
  );
}