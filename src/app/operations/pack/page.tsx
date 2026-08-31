"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { ArrowLeft, Camera, X, Search, Package, CheckCircle, PauseCircle, Truck, Trash2 } from "lucide-react";
import Link from "next/link";
import { PageWrapper } from "@/components/page-wrapper";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";

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
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  const scannerRef = useRef<Html5Qrcode | null>(null);
  // 后五位匹配到多个面单号时的候选列表
  const [matchedTrackingNumbers, setMatchedTrackingNumbers] = useState<string[]>([]);

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
        // 短输入(≤5位)后缀匹配: 唯一命中时自动补全完整面单号
        if (q.length <= 5) {
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

  useEffect(() => {
    if (!showScanner) return;
    let cancelled = false;
    const initScanner = async () => {
      setScanning(true); setScanError("");
      try {
        await new Promise((r) => setTimeout(r, 300));
        if (cancelled) return;
        const scanner = new Html5Qrcode("pack-scanner-reader", {
          verbose: false,
          // 限定一维条码格式(快递面单),减少误识别
          formatsToSupport: [
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.CODE_93,
            Html5QrcodeSupportedFormats.CODABAR,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.ITF,
          ],
          // 优先使用浏览器原生 BarcodeDetector,一维条码识别率大幅提升
          experimentalFeatures: { useBarCodeDetectorIfSupported: true },
        });
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: "environment" },
          { fps: 15, qrbox: { width: 300, height: 120 }, aspectRatio: 1.777 },
          (decodedText) => {
            if (cancelled) return;
            const cleaned = decodedText.trim();
            setTrackingNumber(cleaned);
            stopScanner();
            setShowScanner(false);
            setScanning(false);
            setTimeout(() => doSearch(cleaned), 200);
          },
          () => {}
        );
      } catch {
        if (cancelled) return;
        setScanError("无法启动相机，请确保已授权相机权限并在HTTPS环境下访问");
        setScanning(false);
      }
    };
    initScanner();
    return () => { cancelled = true; stopScanner(); };
  }, [showScanner, doSearch]);

  const fetchPackRecords = async () => {
    try {
      const res = await fetch("/api/pack");
      const data = await res.json();
      if (Array.isArray(data)) setPackRecords(data);
    } catch (err) { console.error(err); }
  };

  const handleSearch = () => doSearch(trackingNumber);

  const stopScanner = () => {
    if (scannerRef.current) { scannerRef.current.stop().catch(() => {}); scannerRef.current = null; }
  };

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

  const filteredPackRecords = packFilter ? packRecords.filter((r) => r.status === packFilter) : packRecords;
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
                  placeholder="面单号 / 后五位"
                  className="neo-input w-full text-sm pl-10"
                />
              </div>
              <button
                type="button" onClick={() => setShowScanner(true)} disabled={scanning}
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

          {/* 后五位匹配到多个面单号: 点击选择具体面单 */}
          {matchedTrackingNumbers.length > 1 && (
            <div className="mb-4 p-3 sm:p-4 rounded-xl border-[3px] border-yellow-400 bg-yellow-50">
              <p className="text-xs sm:text-sm font-extrabold text-yellow-700 mb-2">
                后五位匹配到 {matchedTrackingNumbers.length} 个面单号，请点击选择：
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
                      <div className="text-xs text-gray-500 mb-1 truncate">{item.product_name || "商品名称"}</div>
                      <div className="grid grid-cols-2 gap-1 text-xs">
                        <div><span className="text-gray-400">售价:</span> <span className="font-extrabold text-red-500">¥{item.sell_price}</span></div>
                        <div><span className="text-gray-400">尺码:</span> <span className="font-bold">{item.size}</span></div>
                        <div><span className="text-gray-400">数量:</span> <span className="font-bold">{item.quantity}</span></div>
                        <div><span className="text-gray-400">货架号:</span> <span className="font-bold">{item.shelf_no || "-"}</span></div>
                        <div className="col-span-2"><span className="text-gray-400">下单时间:</span> <span className="font-medium">{item.order_time ? new Date(item.order_time).toLocaleString("zh-CN") : "-"}</span></div>
                        <div className="col-span-2"><span className="text-gray-400">厂家:</span> <span className="font-medium">{item.manufacturer || "-"}</span></div>
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
          {/* 筛选按钮 + 清空 */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-3 sm:mb-4">
            {filterBtnDefs.map((f) => (
              <button
                key={f.key}
                onClick={() => setPackFilter(f.key)}
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
              <p className="text-sm font-bold">暂无记录</p>
              <p className="text-xs">去「找货」模式搜索面单号并提交</p>
            </div>
          ) : (
            filteredPackRecords.map((record) => {
              const st = statusLabel(record.status);
              return (
                <div key={record.id} className="mb-4 sm:mb-6 bg-white rounded-xl border-[3px] border-gray-900 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] overflow-hidden">
                  <div className="p-3 sm:p-4 bg-gray-50 border-b-2 border-gray-200 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-extrabold text-gray-900">面单号: {record.tracking_number}</div>
                      <div className="text-xs text-gray-500 mt-0.5">提交人: {record.submitter} · {new Date(record.created_at).toLocaleString("zh-CN")}</div>
                    </div>
                    <span className={`px-2 sm:px-3 py-1 rounded-lg border-2 text-xs font-extrabold ${st.color}`}>{st.text}</span>
                  </div>
                  <div className="p-3 sm:p-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-3 sm:mb-4">
                      {record.items.map((item, idx) => (
                        <div key={idx} className="bg-gray-50 rounded-xl border-2 border-gray-200 overflow-hidden">
                          <div className="aspect-square bg-gray-100 flex items-center justify-center overflow-hidden">
                            {item.photo ? <img src={item.photo} alt="" className="w-full h-full object-cover" /> : <Package className="h-12 w-12 text-gray-300" />}
                          </div>
                          <div className="p-2 sm:p-3">
                            <div className="text-xs font-extrabold text-gray-900 truncate">{item.sale_id}</div>
                            <div className="text-xs text-gray-500 mt-0.5">尺码: {item.size} · 数量: {item.quantity} · ¥{item.sell_price}</div>
                            <div className="text-xs text-gray-400 mt-0.5">货架号: {item.shelf_no || "-"} · 厂家: {item.manufacturer || "-"}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                    {record.status !== "shipped" && (
                      <div className="flex gap-2 sm:gap-3">
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
                </div>
              );
            })
          )}
        </div>
      )}

      {/* 扫码弹窗 */}
      {showScanner && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border-[3px] border-gray-900 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] max-w-md w-full overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b-2 border-gray-200">
              <h3 className="text-lg font-extrabold">扫描面单号条形码</h3>
              <button onClick={() => { stopScanner(); setShowScanner(false); setScanning(false); }} className="flex h-8 w-8 items-center justify-center rounded-lg border-2 border-gray-900 bg-white hover:bg-gray-100">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4">
              <div id="pack-scanner-reader" className="w-full rounded-xl overflow-hidden border-2 border-gray-900" />
              {scanError && <p className="mt-3 text-sm text-red-500 font-bold text-center">{scanError}</p>}
              <p className="mt-3 text-xs text-gray-500 text-center">将面单号条形码对准扫描框即可自动识别</p>
            </div>
          </div>
        </div>
      )}
    </PageWrapper>
  );
}