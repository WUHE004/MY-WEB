"use client";

import { useState, useEffect, useRef } from "react";
import { ArrowLeft, Plus, Minus, Search, AlertTriangle, Camera, Image as ImageIcon, X } from "lucide-react";
import Link from "next/link";
import { PageWrapper } from "@/components/page-wrapper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Html5Qrcode } from "html5-qrcode";

const SIZE_OPTIONS = [80, 90, 95, 100, 105, 110, 120, 130, 140, 150, 160, 170, 180];

interface InboundRecord {
  sale_id: string;
  photo: string;
  name: string;
  manufacturer: string;
  cost_price: number;
  shelf_no: string;
  size_80: number;
  size_90: number;
  size_95: number;
  size_100: number;
  size_105: number;
  size_110: number;
  size_120: number;
  size_130: number;
  size_140: number;
  size_150: number;
  size_160: number;
  size_170: number;
  size_180: number;
}

function getStock(record: InboundRecord, size: number): number {
  const key = `size_${size}` as keyof InboundRecord;
  return Number(record[key]) || 0;
}

export default function SalesPage() {
  const [sellPrice, setSellPrice] = useState("");
  const [notes, setNotes] = useState("");
  const [orderTime, setOrderTime] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [sizes, setSizes] = useState<Record<number, number>>(
    Object.fromEntries(SIZE_OPTIONS.map((s) => [s, 0]))
  );
  const [submitting, setSubmitting] = useState(false);

  const [inboundRecords, setInboundRecords] = useState<InboundRecord[]>([]);
  const [filteredRecords, setFilteredRecords] = useState<InboundRecord[]>([]);
  const [totalSoldCount, setTotalSoldCount] = useState(0);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRecord, setSelectedRecord] = useState<InboundRecord | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [sellPriceFound, setSellPriceFound] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const selectedRecordRef = useRef<InboundRecord | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  // 扫码相关状态
  const [showScanner, setShowScanner] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");

  // 当 showScanner 变为 true 时启动扫描
  useEffect(() => {
    if (!showScanner) return;
    let cancelled = false;

    const initScanner = async () => {
      setScanning(true);
      setScanError("");
      try {
        // 等待 DOM 渲染
        await new Promise((r) => setTimeout(r, 300));
        if (cancelled) return;

        const scanner = new Html5Qrcode("scanner-reader");
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: { width: 250, height: 150 },
          },
          (decodedText) => {
            if (cancelled) return;
            setTrackingNumber(decodedText);
            stopScanner();
            setShowScanner(false);
            setScanning(false);
          },
          () => {}
        );
      } catch (err) {
        if (cancelled) return;
        console.error("Scanner error:", err);
        setScanError("无法启动相机，请确保已授权相机权限并在HTTPS环境下访问");
        setScanning(false);
      }
    };

    initScanner();

    return () => {
      cancelled = true;
      stopScanner();
    };
  }, [showScanner]);

  useEffect(() => {
    fetchInboundRecords();
    fetchTotalSoldCount();
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchTotalSoldCount = async () => {
    try {
      const res = await fetch("/api/sales-summary");
      const data = await res.json();
      if (Array.isArray(data)) {
        const total = data.reduce((sum: number, item: any) => sum + (Number(item.total_sold) || 0), 0);
        setTotalSoldCount(total);
      }
    } catch { /* ignore */ }
  };

  const fetchInboundRecords = async () => {
    try {
      const res = await fetch("/api/inbound-records");
      const data = await res.json();
      if (Array.isArray(data)) {
        setInboundRecords(data);
      }
    } catch (err) {
      console.error("Fetch inbound records error:", err);
    }
  };

  // 从售出记录中查找该编号的售价
  const fetchExistingSellPrice = async (saleId: string) => {
    try {
      const res = await fetch(`/api/sales-records?sale_id=${encodeURIComponent(saleId)}`);
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const price = data[0].sell_price;
        if (price != null && price > 0) {
          setSellPrice(String(price));
          setSellPriceFound(true);
          return;
        }
      }
      setSellPrice("");
      setSellPriceFound(false);
    } catch {
      setSellPrice("");
      setSellPriceFound(false);
    }
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    setNotFound(false);
    setSelectedRecord(null);
    selectedRecordRef.current = null;
    setSizes(Object.fromEntries(SIZE_OPTIONS.map((s) => [s, 0])));
    setSellPriceFound(false);

    if (query.trim()) {
      const filtered = inboundRecords.filter(
        (r) =>
          r.sale_id.toLowerCase().includes(query.toLowerCase()) ||
          r.name.toLowerCase().includes(query.toLowerCase())
      );
      setFilteredRecords(filtered);
      setShowDropdown(true);
    } else {
      setFilteredRecords([]);
      setShowDropdown(false);
    }
  };

  const handleSelectRecord = (record: InboundRecord) => {
    setSelectedRecord(record);
    selectedRecordRef.current = record;
    setSearchQuery(record.sale_id);
    setShowDropdown(false);
    setNotFound(false);
    setSizes(Object.fromEntries(SIZE_OPTIONS.map((s) => [s, 0])));
    fetchExistingSellPrice(record.sale_id);
  };

  const handleBlur = () => {
    const query = searchQuery.trim();
    if (!query) return;
    if (selectedRecordRef.current && selectedRecordRef.current.sale_id.toLowerCase() === query.toLowerCase()) {
      return;
    }
    const exactMatch = inboundRecords.find(
      (r) => r.sale_id.toLowerCase() === query.toLowerCase()
    );
    if (exactMatch) {
      setSelectedRecord(exactMatch);
      selectedRecordRef.current = exactMatch;
      setNotFound(false);
      fetchExistingSellPrice(exactMatch.sale_id);
    } else {
      setNotFound(true);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      const query = searchQuery.trim();
      if (!query) return;
      const exactMatch = inboundRecords.find(
        (r) => r.sale_id.toLowerCase() === query.toLowerCase()
      );
      if (exactMatch) {
        setSelectedRecord(exactMatch);
        selectedRecordRef.current = exactMatch;
        setShowDropdown(false);
        setNotFound(false);
        fetchExistingSellPrice(exactMatch.sale_id);
      } else {
        setSelectedRecord(null);
        selectedRecordRef.current = null;
        setShowDropdown(false);
        setNotFound(true);
      }
    }
  };

  const getAvailableStock = (size: number): number => {
    if (!selectedRecord) return 0;
    return getStock(selectedRecord, size);
  };

  const hasAnySizeSelected = Object.values(sizes).some((v) => v > 0);

  const isSizeDisabled = (size: number): boolean => {
    if (!selectedRecord) return true;
    if (getAvailableStock(size) === 0) return true;
    if (hasAnySizeSelected && (sizes[size] || 0) === 0) return true;
    return false;
  };

  const updateSize = (size: number, delta: number) => {
    if (isSizeDisabled(size) && delta > 0) return;
    const maxStock = getAvailableStock(size);
    setSizes((prev) => {
      const current = prev[size] || 0;
      const next = Math.max(0, Math.min(current + delta, maxStock));
      return { ...prev, [size]: next };
    });
  };

  const setSizeValue = (size: number, value: string) => {
    if (isSizeDisabled(size)) return;
    const num = parseInt(value, 10);
    const maxStock = getAvailableStock(size);
    const clamped = isNaN(num) ? 0 : Math.max(0, Math.min(num, maxStock));
    setSizes((prev) => ({ ...prev, [size]: clamped }));
  };

  const stopScanner = () => {
    if (scannerRef.current) {
      scannerRef.current.stop().catch(() => {});
      scannerRef.current = null;
    }
  };

  const handleScanFromPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setScanning(true);
    setScanError("");
    try {
      const scanner = new Html5Qrcode("scanner-reader-hidden");
      const decodedText = await scanner.scanFile(file, true);
      setTrackingNumber(decodedText);
      setScanning(false);
    } catch {
      setScanError("未识别到条形码，请重试");
      setScanning(false);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmit = async () => {
    if (!selectedRecord) {
      alert("请选择有效的售卖编号");
      return;
    }
    if (!sellPrice || isNaN(Number(sellPrice))) {
      alert("请输入有效的售价");
      return;
    }

    const totalQty = Object.values(sizes).reduce((sum, v) => sum + v, 0);
    if (totalQty === 0) {
      alert("请至少选择一个尺码并输入数量");
      return;
    }

    setSubmitting(true);

    const registrant = localStorage.getItem("member_name") || "未知";

    try {
      const salesData = SIZE_OPTIONS.filter((s) => (sizes[s] || 0) > 0).map((size) => {
        const quantity = sizes[size] || 0;
        const profit = Number(sellPrice) - selectedRecord.cost_price;
        return {
          sale_id: selectedRecord.sale_id,
          size,
          quantity,
          sell_price: Number(sellPrice),
          cost_price: selectedRecord.cost_price,
          profit,
          total_profit: profit * quantity,
          shelf_no: selectedRecord.shelf_no || "",
          notes: notes.trim(),
          order_time: orderTime || new Date().toISOString(),
          tracking_number: trackingNumber.trim(),
          registrant,
        };
      });

      const res = await fetch("/api/sales-records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(salesData),
      });

      if (res.ok) {
        alert("售卖登记成功！");
        setSelectedRecord(null);
        selectedRecordRef.current = null;
        setSearchQuery("");
        setSellPrice("");
        setSellPriceFound(false);
        setNotes("");
        setOrderTime("");
        setTrackingNumber("");
        setNotFound(false);
        setSizes(Object.fromEntries(SIZE_OPTIONS.map((s) => [s, 0])));
      } else {
        const err = await res.json();
        alert("售卖登记失败: " + (err.error || "未知错误"));
      }
    } catch {
      alert("网络错误，请重试");
    } finally {
      setSubmitting(false);
    }
  };

  const totalSizeCount = Object.values(sizes).reduce((sum, v) => sum + v, 0);

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
          <span className="highlight-yellow">售卖登记</span>
        </h1>
        <p className="text-lg lg:text-3xl font-extrabold text-green-600 ml-auto">{totalSoldCount} 件</p>
      </div>

      <div className="max-w-2xl mx-auto">
        {/* Sale ID */}
        <div className="mb-6">
          <label className="text-sm lg:text-base font-extrabold text-gray-900 mb-1 block">
            售卖编号 <span className="text-red-500">*</span>
          </label>
          <p className="text-[10px] lg:text-xs text-gray-400 mb-2">
            输入编号搜索已入库商品，自动关联照片、名称、进价、厂家
          </p>
          <div ref={dropdownRef} className="relative">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                onFocus={() => {
                  if (searchQuery.trim() && filteredRecords.length > 0 && !selectedRecord) {
                    setShowDropdown(true);
                  }
                }}
                placeholder="输入售卖编号或名称搜索..."
                className="neo-input w-full text-sm pl-10"
              />
            </div>

            {showDropdown && filteredRecords.length > 0 && (
              <div className="absolute z-50 w-full mt-1 bg-white rounded-xl border-[3px] border-gray-900 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] max-h-60 overflow-y-auto">
                {filteredRecords.map((record) => (
                  <button
                    key={record.sale_id}
                    onClick={() => handleSelectRecord(record)}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b-2 border-gray-100 last:border-b-0 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {record.photo && (
                        <img
                          src={record.photo}
                          alt=""
                          className="w-10 h-10 rounded-lg object-cover border-2 border-gray-200"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-extrabold text-gray-900 truncate">
                          {record.sale_id}
                        </div>
                        <div className="text-xs text-gray-500 truncate">
                          {record.name || "未命名"} · {record.manufacturer} · 进价: ¥{record.cost_price}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 未入库提示 */}
          {notFound && (
            <div className="mt-3 p-4 rounded-xl border-[3px] border-red-400 bg-red-50 flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
              <div>
                <p className="text-sm font-extrabold text-red-600">未入库商品</p>
                <p className="text-xs text-red-500">
                  编号 "{searchQuery}" 未在入库记录中找到，请先入库后再售卖
                </p>
              </div>
            </div>
          )}

          {/* Selected Record Info */}
          {selectedRecord && (
            <div className="mt-3 p-4 rounded-xl border-[3px] border-gray-900 bg-gray-50">
              <div className="flex items-center gap-3">
                {selectedRecord.photo && (
                  <img
                    src={selectedRecord.photo}
                    alt=""
                    className="w-16 h-16 rounded-lg object-cover border-2 border-gray-300"
                  />
                )}
                <div className="text-sm">
                  <p className="font-extrabold text-gray-900">{selectedRecord.manufacturer}</p>
                  <p className="text-gray-500">{selectedRecord.name || "未命名"}</p>
                  <p className="text-[#4A90E2] font-bold">进价: ¥{selectedRecord.cost_price}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sell Price */}
        <div className="mb-6">
          <label className="text-sm lg:text-base font-extrabold text-gray-900 mb-1 block">
            售价 <span className="text-red-500">*</span>
          </label>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={sellPrice}
            onChange={(e) => setSellPrice(e.target.value)}
            placeholder={selectedRecord ? (sellPriceFound ? "已自动填入" : "未售卖请输入售价") : "请先选择售卖编号"}
            className="text-sm"
            readOnly={sellPriceFound}
          />
          {selectedRecord && sellPrice && !isNaN(Number(sellPrice)) && (
            <p className="text-xs font-bold text-[#4CD964] mt-1">
              单件盈利: ¥{(Number(sellPrice) - selectedRecord.cost_price).toFixed(2)}
            </p>
          )}
        </div>

        {/* Sizes */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm lg:text-base font-extrabold text-gray-900">
              尺码与数量
            </label>
            <span className="text-xs lg:text-sm font-bold text-gray-500">
              合计: {totalSizeCount} 件
            </span>
          </div>
          {!selectedRecord && (
            <p className="text-xs text-gray-400 mb-3">请先选择售卖编号后再选择尺码</p>
          )}
          <div className="grid grid-cols-4 sm:grid-cols-7 lg:grid-cols-7 gap-2 lg:gap-3">
            {SIZE_OPTIONS.map((size) => {
              const stock = getAvailableStock(size);
              const disabled = isSizeDisabled(size);
              const currentQty = sizes[size] || 0;

              return (
                <div
                  key={size}
                  className={`rounded-xl border-[3px] bg-white p-1.5 lg:p-2 transition-all ${
                    disabled
                      ? "border-gray-200 bg-gray-100 opacity-50"
                      : "border-gray-900"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-[10px] lg:text-xs font-extrabold ${disabled ? "text-gray-300" : "text-gray-500"}`}>
                      {size}
                    </span>
                    <span className={`text-[8px] lg:text-[10px] font-bold ${disabled ? "text-gray-300" : "text-gray-400"}`}>
                      {stock > 0 ? `库存:${stock}` : "无库存"}
                    </span>
                  </div>
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      disabled={disabled || currentQty <= 0}
                      onClick={() => updateSize(size, -1)}
                      className={`flex h-5 w-5 lg:h-6 lg:w-6 items-center justify-center rounded-md border-[2px] transition-all ${
                        disabled || currentQty <= 0
                          ? "border-gray-200 bg-gray-200 text-gray-300 cursor-not-allowed"
                          : "border-gray-900 bg-[#FF6B7A] text-white active:scale-90"
                      }`}
                    >
                      <Minus className="h-2.5 w-2.5 lg:h-3 lg:w-3" />
                    </button>
                    <input
                      type="text"
                      inputMode="numeric"
                      disabled={disabled}
                      value={disabled ? "" : currentQty}
                      onChange={(e) => setSizeValue(size, e.target.value)}
                      className={`w-full text-center text-xs lg:text-sm font-extrabold border-none outline-none bg-transparent ${
                        disabled ? "text-gray-300" : "text-gray-900"
                      }`}
                    />
                    <button
                      type="button"
                      disabled={disabled || currentQty >= stock}
                      onClick={() => updateSize(size, 1)}
                      className={`flex h-5 w-5 lg:h-6 lg:w-6 items-center justify-center rounded-md border-[2px] transition-all ${
                        disabled || currentQty >= stock
                          ? "border-gray-200 bg-gray-200 text-gray-300 cursor-not-allowed"
                          : "border-gray-900 bg-[#4CD964] text-white active:scale-90"
                      }`}
                    >
                      <Plus className="h-2.5 w-2.5 lg:h-3 lg:w-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Order Time */}
        <div className="mb-6">
          <label className="text-sm lg:text-base font-extrabold text-gray-900 mb-1 block">
            下单时间 <span className="text-xs font-normal text-gray-400">(可选)</span>
          </label>
          <input
            type="datetime-local"
            value={orderTime}
            onChange={(e) => setOrderTime(e.target.value)}
            className="neo-input w-full text-sm"
          />
        </div>

        {/* Tracking Number */}
        <div className="mb-6">
          <label className="text-sm lg:text-base font-extrabold text-gray-900 mb-1 block">
            面单号 <span className="text-xs font-normal text-gray-400">(可选)</span>
          </label>
          <div className="flex gap-2">
            <Input
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
              placeholder="输入或扫描快递面单号..."
              className="text-sm flex-1"
            />
            <Button
              type="button"
              onClick={() => setShowScanner(true)}
              disabled={scanning}
              className="neo-btn px-3 h-[42px] bg-[#4A90E2] text-white"
              title="拍照扫描面单号"
            >
              <Camera className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={scanning}
              className="neo-btn px-3 h-[42px] bg-[#FFC93C] text-gray-900"
              title="从相册识别面单号"
            >
              <ImageIcon className="h-4 w-4" />
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleScanFromPhoto}
            />
          </div>
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
          {submitting ? "提交中..." : "提交售卖"}
        </Button>
      </div>

      {/* 扫码弹窗 */}
      {showScanner && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border-[3px] border-gray-900 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] max-w-md w-full overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b-2 border-gray-200">
              <h3 className="text-lg font-extrabold">扫描面单号条形码</h3>
              <button
                onClick={() => {
                  stopScanner();
                  setShowScanner(false);
                  setScanning(false);
                }}
                className="flex h-8 w-8 items-center justify-center rounded-lg border-2 border-gray-900 bg-white hover:bg-gray-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4">
              <div id="scanner-reader" className="w-full rounded-xl overflow-hidden border-2 border-gray-900" />
              {scanError && (
                <p className="mt-3 text-sm text-red-500 font-bold text-center">{scanError}</p>
              )}
              <p className="mt-3 text-xs text-gray-500 text-center">
                将面单号条形码对准扫描框即可自动识别
              </p>
            </div>
          </div>
        </div>
      )}
      {/* 隐藏的扫码容器（用于从照片识别） */}
      <div id="scanner-reader-hidden" className="hidden" />
    </PageWrapper>
  );
}