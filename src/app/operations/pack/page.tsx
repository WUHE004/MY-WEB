"use client";

import { useState, useEffect, useRef } from "react";
import { ArrowLeft, Camera, X, Search, Package, CheckCircle, PauseCircle, Truck } from "lucide-react";
import Link from "next/link";
import { PageWrapper } from "@/components/page-wrapper";
import { Button } from "@/components/ui/button";
import { Html5Qrcode } from "html5-qrcode";

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

export default function PackPage() {
  const [activeTab, setActiveTab] = useState<TabMode>("find");

  // 找货模式
  const [trackingNumber, setTrackingNumber] = useState("");
  const [searchResults, setSearchResults] = useState<SalesRecord[]>([]);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [notFound, setNotFound] = useState(false);

  // 打包模式
  const [packRecords, setPackRecords] = useState<PackRecord[]>([]);

  // 扫码
  const [showScanner, setShowScanner] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  const scannerRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    fetchPackRecords();
  }, []);

  const fetchPackRecords = async () => {
    try {
      const res = await fetch("/api/pack");
      const data = await res.json();
      if (Array.isArray(data)) {
        setPackRecords(data);
      }
    } catch (err) {
      console.error("Fetch pack records error:", err);
    }
  };

  // 搜索面单号对应的售卖记录
  const handleSearch = async () => {
    const query = trackingNumber.trim();
    if (!query) {
      alert("请输入面单号");
      return;
    }

    setSearching(true);
    setSearched(false);
    setNotFound(false);
    setSearchResults([]);

    try {
      const res = await fetch(`/api/sales-records?tracking_number=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        setSearchResults(data);
        setSearched(true);
      } else {
        setNotFound(true);
        setSearched(true);
      }
    } catch {
      setNotFound(true);
      setSearched(true);
    } finally {
      setSearching(false);
    }
  };

  // 扫码功能
  const startScanner = async () => {
    setShowScanner(true);
    setScanError("");
    setScanning(true);
    try {
      const scanner = new Html5Qrcode("pack-scanner-reader");
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 150 } },
        (decodedText) => {
          setTrackingNumber(decodedText);
          stopScanner();
          setShowScanner(false);
          setScanning(false);
        },
        () => {}
      );
    } catch {
      setScanError("无法启动相机，请确保已授权相机权限");
      setScanning(false);
    }
  };

  const stopScanner = () => {
    if (scannerRef.current) {
      scannerRef.current.stop().catch(() => {});
      scannerRef.current = null;
    }
  };

  // 提交找货结果
  const handleSubmitFind = async (status: "found" | "suspended") => {
    const submitter = localStorage.getItem("member_name") || "未知";
    try {
      const res = await fetch("/api/pack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tracking_number: trackingNumber.trim(),
          status,
          submitter,
          items: searchResults.map((item) => ({
            sale_id: item.sale_id,
            photo: item.photo,
            product_name: item.product_name,
            size: item.size,
            quantity: item.quantity,
            sell_price: item.sell_price,
            shelf_no: item.shelf_no,
            order_time: item.order_time,
            manufacturer: item.manufacturer,
          })),
        }),
      });

      if (res.ok) {
        alert(status === "found" ? "已标记为找齐" : "已挂起");
        setSearchResults([]);
        setSearched(false);
        setTrackingNumber("");
        fetchPackRecords();
      } else {
        const err = await res.json();
        alert("操作失败: " + (err.error || "未知错误"));
      }
    } catch {
      alert("网络错误，请重试");
    }
  };

  // 打包操作：更新状态
  const handlePackAction = async (recordId: number, status: string) => {
    const packer = localStorage.getItem("member_name") || "未知";
    try {
      const res = await fetch("/api/pack", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: recordId,
          status,
          packer: status === "shipped" ? packer : undefined,
        }),
      });

      if (res.ok) {
        if (status === "shipped") {
          alert("已发货");
        } else if (status === "found") {
          alert("已标记为找齐");
        } else if (status === "suspended") {
          alert("已挂起");
        }
        fetchPackRecords();
      } else {
        const err = await res.json();
        alert("操作失败: " + (err.error || "未知错误"));
      }
    } catch {
      alert("网络错误，请重试");
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case "found":
        return { text: "已找齐", color: "bg-green-100 text-green-700 border-green-400" };
      case "suspended":
        return { text: "已挂起", color: "bg-yellow-100 text-yellow-700 border-yellow-400" };
      case "shipped":
        return { text: "已发货", color: "bg-blue-100 text-blue-700 border-blue-400" };
      default:
        return { text: "找货中", color: "bg-gray-100 text-gray-600 border-gray-300" };
    }
  };

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
          <span className="highlight-yellow">打包找货</span>
        </h1>
      </div>

      {/* Tab 切换 */}
      <div className="flex gap-3 mb-6">
        <button
          onClick={() => setActiveTab("find")}
          className={`px-6 py-3 rounded-xl border-[3px] border-gray-900 font-extrabold text-sm lg:text-base transition-all ${
            activeTab === "find"
              ? "bg-[#4A90E2] text-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]"
              : "bg-white text-gray-700 hover:bg-gray-100"
          }`}
        >
          <Package className="inline h-4 w-4 mr-1" />
          找货
        </button>
        <button
          onClick={() => setActiveTab("pack")}
          className={`px-6 py-3 rounded-xl border-[3px] border-gray-900 font-extrabold text-sm lg:text-base transition-all ${
            activeTab === "pack"
              ? "bg-[#FFC93C] text-gray-900 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]"
              : "bg-white text-gray-700 hover:bg-gray-100"
          }`}
        >
          <Truck className="inline h-4 w-4 mr-1" />
          打包
        </button>
      </div>

      {/* ===== 找货模式 ===== */}
      {activeTab === "find" && (
        <div>
          {/* 面单号输入 */}
          <div className="mb-6">
            <label className="text-sm lg:text-base font-extrabold text-gray-900 mb-1 block">
              面单号 <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  placeholder="输入或扫描面单号..."
                  className="neo-input w-full text-sm pl-10"
                />
              </div>
              <Button
                type="button"
                onClick={startScanner}
                disabled={scanning}
                className="neo-btn px-3 h-[42px] bg-[#4A90E2] text-white"
                title="扫码识别面单号"
              >
                <Camera className="h-4 w-4" />
              </Button>
              <Button
                onClick={handleSearch}
                disabled={searching || !trackingNumber.trim()}
                className="neo-btn px-4 h-[42px] bg-[#FFC93C] text-gray-900 font-extrabold"
              >
                {searching ? "搜索中..." : "查找"}
              </Button>
            </div>
          </div>

          {/* 搜索结果 */}
          {searched && notFound && (
            <div className="p-6 rounded-xl border-[3px] border-red-400 bg-red-50 text-center">
              <p className="text-sm font-extrabold text-red-600">
                未找到面单号 "{trackingNumber}" 对应的售卖记录
              </p>
            </div>
          )}

          {searchResults.length > 0 && (
            <div>
              <p className="text-sm font-bold text-gray-500 mb-4">
                共找到 {searchResults.length} 件商品 · 面单号: {trackingNumber}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                {searchResults.map((item, index) => (
                  <div
                    key={index}
                    className="bg-white rounded-xl border-[3px] border-gray-900 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] overflow-hidden"
                  >
                    {/* 商品图片 */}
                    <div className="aspect-square bg-gray-100 flex items-center justify-center overflow-hidden">
                      {item.photo ? (
                        <img
                          src={item.photo}
                          alt={item.product_name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Package className="h-12 w-12 text-gray-300" />
                      )}
                    </div>
                    <div className="p-4">
                      <div className="text-sm font-extrabold text-gray-900 mb-1 truncate">
                        {item.sale_id}
                      </div>
                      <div className="text-xs text-gray-500 mb-2 truncate">
                        {item.product_name || "商品名称"}
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-gray-400">售价:</span>{" "}
                          <span className="font-extrabold text-red-500">¥{item.sell_price}</span>
                        </div>
                        <div>
                          <span className="text-gray-400">尺码:</span>{" "}
                          <span className="font-bold">{item.size}</span>
                        </div>
                        <div>
                          <span className="text-gray-400">数量:</span>{" "}
                          <span className="font-bold">{item.quantity}</span>
                        </div>
                        <div>
                          <span className="text-gray-400">货架号:</span>{" "}
                          <span className="font-bold">{item.shelf_no || "-"}</span>
                        </div>
                        <div className="col-span-2">
                          <span className="text-gray-400">下单时间:</span>{" "}
                          <span className="font-medium">
                            {item.order_time ? new Date(item.order_time).toLocaleString("zh-CN") : "-"}
                          </span>
                        </div>
                        <div className="col-span-2">
                          <span className="text-gray-400">厂家:</span>{" "}
                          <span className="font-medium">{item.manufacturer || "-"}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* 操作按钮 */}
              <div className="flex gap-4">
                <Button
                  onClick={() => handleSubmitFind("found")}
                  className="flex-1 py-4 text-base font-extrabold bg-[#4CD964] text-white border-[3px] border-gray-900 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
                >
                  <CheckCircle className="h-5 w-5 mr-2" />
                  货已找齐
                </Button>
                <Button
                  onClick={() => handleSubmitFind("suspended")}
                  className="flex-1 py-4 text-base font-extrabold bg-[#FFC93C] text-gray-900 border-[3px] border-gray-900 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
                >
                  <PauseCircle className="h-5 w-5 mr-2" />
                  挂起
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== 打包模式 ===== */}
      {activeTab === "pack" && (
        <div>
          {packRecords.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Package className="h-12 w-12 mx-auto mb-3" />
              <p className="text-sm font-bold">暂无打包记录</p>
              <p className="text-xs">去「找货」模式搜索面单号并提交</p>
            </div>
          ) : (
            packRecords.map((record) => {
              const st = statusLabel(record.status);
              return (
                <div
                  key={record.id}
                  className="mb-6 bg-white rounded-xl border-[3px] border-gray-900 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] overflow-hidden"
                >
                  {/* 记录头部 */}
                  <div className="p-4 bg-gray-50 border-b-2 border-gray-200 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-extrabold text-gray-900">
                        面单号: {record.tracking_number}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        提交人: {record.submitter} ·{" "}
                        {new Date(record.created_at).toLocaleString("zh-CN")}
                      </div>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-lg border-2 text-xs font-extrabold ${st.color}`}
                    >
                      {st.text}
                    </span>
                  </div>

                  {/* 商品列表 */}
                  <div className="p-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                      {record.items.map((item, idx) => (
                        <div
                          key={idx}
                          className="bg-gray-50 rounded-xl border-2 border-gray-200 overflow-hidden"
                        >
                          <div className="aspect-square bg-gray-100 flex items-center justify-center overflow-hidden">
                            {item.photo ? (
                              <img
                                src={item.photo}
                                alt={item.product_name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <Package className="h-12 w-12 text-gray-300" />
                            )}
                          </div>
                          <div className="p-3">
                            <div className="text-xs font-extrabold text-gray-900 truncate">
                              {item.sale_id}
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              尺码: {item.size} · 数量: {item.quantity} · ¥{item.sell_price}
                            </div>
                            <div className="text-xs text-gray-400 mt-0.5">
                              货架号: {item.shelf_no || "-"} · 厂家: {item.manufacturer || "-"}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* 打包操作按钮 */}
                    {record.status !== "shipped" && (
                      <div className="flex gap-3">
                        {(record.status === "pending" || record.status === "suspended") && (
                          <Button
                            onClick={() => handlePackAction(record.id, "found")}
                            className="flex-1 py-3 text-sm font-extrabold bg-[#4CD964] text-white border-[3px] border-gray-900 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]"
                          >
                            <CheckCircle className="h-4 w-4 mr-1" />
                            找齐
                          </Button>
                        )}
                        {record.status === "found" && (
                          <Button
                            onClick={() => handlePackAction(record.id, "suspended")}
                            className="flex-1 py-3 text-sm font-extrabold bg-[#FFC93C] text-gray-900 border-[3px] border-gray-900 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]"
                          >
                            <PauseCircle className="h-4 w-4 mr-1" />
                            挂起
                          </Button>
                        )}
                        <Button
                          onClick={() => handlePackAction(record.id, "shipped")}
                          className="flex-1 py-3 text-sm font-extrabold bg-[#4A90E2] text-white border-[3px] border-gray-900 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]"
                        >
                          <Truck className="h-4 w-4 mr-1" />
                          发货
                        </Button>
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
              <div id="pack-scanner-reader" className="w-full rounded-xl overflow-hidden border-2 border-gray-900" />
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
    </PageWrapper>
  );
}