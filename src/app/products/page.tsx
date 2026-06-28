"use client";

import { useState, useEffect } from "react";
import { Search, Package, X, Settings, AlertTriangle, ExternalLink, QrCode, Upload } from "lucide-react";
import { PageWrapper } from "@/components/page-wrapper";
import Link from "next/link";

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
  } catch { /* ignore */ }
}

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

interface DouyinLink {
  id: number;
  name: string;
  live_url: string;
  qr_code: string;
}

export default function ProductsPage() {
  const [products, setProducts] = useState<SummaryProduct[]>(() => getCache<SummaryProduct[]>("products_cache") || []);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<SummaryProduct | null>(null);
  const [selectedSizes, setSelectedSizes] = useState<Record<number, number>>({});
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [memberId, setMemberId] = useState<string>("");
  const [memberName, setMemberName] = useState("");

  // 从URL中读取open参数
  const getOpenProductId = () => {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    return params.get("open");
  };

  // 下单弹窗
  const [orderForm, setOrderForm] = useState({
    customer: "",
    address: "",
    recipient: "",
    recipient_phone: "",
  });
  const [showOrderForm, setShowOrderForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // 暂停售卖状态
  const [isPaused, setIsPaused] = useState(false);
  // 暂停提示文字
  const [pauseText, setPauseText] = useState("");
  // 抖音链接
  const [douyinLinks, setDouyinLinks] = useState<DouyinLink[]>([]);
  // 商品展示列表（为空则显示全部）
  const [displayList, setDisplayList] = useState<string[]>([]);
  const [imgPreview, setImgPreview] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
    const role = localStorage.getItem("member_role");
    const phone = localStorage.getItem("member_phone");
    const id = localStorage.getItem("member_id");
    const name = localStorage.getItem("member_name") || "";
    setIsAdmin(role === "admin");
    setIsLoggedIn(!!phone);
    setMemberId(id || "");
    setMemberName(name);
    // 自动填入用户名
    if (name) {
      setOrderForm(prev => ({ ...prev, customer: name }));
      fetchMemberInfo(name);
    }
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 从总表获取数据（含实时库存和售价）
      const [summaryRes, settingsRes, douyinRes] = await Promise.all([
        fetch("/api/summary"),
        fetch("/api/settings"),
        fetch("/api/douyin-links"),
      ]);

      const summaryData = await summaryRes.json();
      const settingsData = await settingsRes.json();
      const douyinData = await douyinRes.json();

      // 过滤：根据展示列表过滤，展示列表为空时不显示任何商品
      const filtered = (Array.isArray(summaryData) ? summaryData : [])
        .map((p: SummaryProduct) => ({
          ...p,
          remaining: Number(p.remaining) || 0,
          sell_price: Number(p.sell_price) || 0,
          cost_price: Number(p.cost_price) || 0,
          inbound_total: Number(p.inbound_total) || 0,
          sold_total: Number(p.sold_total) || 0,
          return_total: Number(p.return_total) || 0,
        }));

      setProducts(filtered);
      setCache("products_cache", filtered);

      // 如果URL带有open参数，自动打开对应商品
      const openId = getOpenProductId();
      if (openId) {
        const target = filtered.find((p: SummaryProduct) => p.sale_id === openId);
        if (target) {
          setSelectedProduct(target);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      }

      // 暂停售卖状态
      setIsPaused(settingsData?.pause_selling === true);
      setPauseText(settingsData?.pause_text || "");

      // 商品展示列表
      if (Array.isArray(settingsData?.product_display_list)) {
        setDisplayList(settingsData.product_display_list);
      }

      // 抖音链接
      setDouyinLinks(Array.isArray(douyinData) ? douyinData : []);
    } catch (err) {
      console.error("Fetch data error:", err);
    } finally {
      setLoading(false);
    }
  };

  // 从 members 表获取会员信息并自动填入收货地址
  const fetchMemberInfo = async (name: string) => {
    try {
      const res = await fetch("/api/members");
      const data = await res.json();
      const member = (Array.isArray(data) ? data : []).find(
        (m: { name: string }) => m.name === name
      );
      if (member) {
        setOrderForm(prev => ({
          ...prev,
          customer: name,
          address: member.address || "",
          recipient: member.recipient || "",
          recipient_phone: member.recipient_phone || "",
        }));
      }
    } catch (err) {
      console.error("Fetch member info error:", err);
    }
  };

  // 根据展示列表过滤 - 展示列表为空时不显示任何商品
  const visibleProducts = products.filter((p) => {
    if (displayList.length === 0) return false;
    return displayList.includes(p.sale_id);
  });

  const filtered = visibleProducts.filter(
    (p) =>
      (p.name || "").toLowerCase().includes(search.toLowerCase()) ||
      (p.sale_id || "").toLowerCase().includes(search.toLowerCase())
  );

  const formatMoney = (v: number | null | undefined) => {
    const num = v ?? 0;
    return `¥${num.toLocaleString("zh-CN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  };

  const openDetail = (product: SummaryProduct) => {
    setSelectedProduct(product);
    setSelectedSizes({});
  };

  const closeDetail = () => {
    setSelectedProduct(null);
    setSelectedSizes({});
    setShowOrderForm(false);
  };

  const getSizeStock = (product: SummaryProduct, size: number): number => {
    const key = `size_${size}`;
    return Number(product[key]) || 0;
  };

  const toggleSize = (size: number) => {
    if (!selectedProduct) return;
    const stock = getSizeStock(selectedProduct, size);
    if (stock <= 0) return;
    setSelectedSizes((prev) => {
      const current = prev[size] || 0;
      if (current > 0) {
        const next = { ...prev };
        delete next[size];
        return next;
      }
      return { ...prev, [size]: 1 };
    });
  };

  const updateSizeQty = (size: number, delta: number) => {
    if (!selectedProduct) return;
    const stock = getSizeStock(selectedProduct, size);
    setSelectedSizes((prev) => {
      const current = prev[size] || 0;
      const next = Math.max(0, Math.min(current + delta, stock));
      if (next <= 0) {
        const newSizes = { ...prev };
        delete newSizes[size];
        return newSizes;
      }
      return { ...prev, [size]: next };
    });
  };

  const selectedTotalQty = Object.values(selectedSizes).reduce((a, b) => a + b, 0);

  // 确认选购 → 弹出下单表单（未登录则跳转登录页）
  const handleConfirmOrder = () => {
    if (!isLoggedIn) {
      window.location.href = "/login";
      return;
    }
    // 重新拉取会员信息以确保最新数据
    if (memberName) {
      fetchMemberInfo(memberName);
    }
    setShowOrderForm(true);
  };

  const submitOrder = async () => {
    if (!selectedProduct) return;
    if (!orderForm.customer || !orderForm.address || !orderForm.recipient || !orderForm.recipient_phone) {
      alert("请填写完整的收货信息");
      return;
    }

    setSubmitting(true);
    try {
      let lastOrderId = 0;
      let stockError = "";

      // 为每个尺码创建下单记录
      for (const [sizeStr, qty] of Object.entries(selectedSizes)) {
        const size = Number(sizeStr);
        const res = await fetch("/api/web-orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customer: orderForm.customer,
            address: orderForm.address,
            recipient: orderForm.recipient,
            recipient_phone: orderForm.recipient_phone,
            sale_id: selectedProduct.sale_id,
            size,
            quantity: qty,
            sell_price: selectedProduct.sell_price,
            member_id: memberId || "",
            member_name: memberName || "",
          }),
        });
        const data = await res.json();
        if (data.error) {
          stockError = data.error;
          break;
        }
        if (data.id) {
          lastOrderId = data.id;
        }
      }

      if (stockError) {
        alert(stockError);
        // 刷新库存数据
        fetchData();
        setSubmitting(false);
        return;
      }

      // 将收货信息写入 members 表
      if (memberId) {
        await fetch("/api/members", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: memberId,
            address: orderForm.address,
            recipient: orderForm.recipient,
            recipient_phone: orderForm.recipient_phone,
          }),
        });
      }

      // 跳转到支付页面
      if (lastOrderId > 0) {
        window.location.href = `/payment?order_id=${lastOrderId}`;
      } else {
        alert("下单成功！");
        setShowOrderForm(false);
        closeDetail();
        fetchData();
      }
    } catch (err) {
      console.error("Submit order error:", err);
      alert("下单失败，请重试");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageWrapper>
      {/* 暂停售卖警戒线 */}
      {isPaused && (
        <div className="mb-4 rounded-xl border-[3px] border-[#FF6B7A] bg-[#FF6B7A]/10 p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-5 w-5 text-[#FF6B7A]" />
            <span className="text-lg font-extrabold text-[#FF6B7A]">{pauseText || "正在直播，请去直播间下单哦"}</span>
          </div>
          {douyinLinks.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {douyinLinks.map((link) => (
                <div key={link.id} className="flex items-center gap-2 bg-white rounded-lg border-2 border-gray-200 px-3 py-1.5">
                  <a
                    href={link.live_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-sm font-bold text-[#4A90E2] hover:underline"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    {link.name}
                  </a>
                  {link.qr_code && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(link.qr_code, "_blank");
                      }}
                      className="flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-gray-700"
                    >
                      <QrCode className="h-3 w-3" />
                      分享码
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <div>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-gray-900">
            <span className="highlight-yellow">快来选购吧</span>
            <span className="ml-2 text-base lg:text-lg font-bold text-gray-500 align-middle">
              在售 <span className="text-2xl font-extrabold text-[#4CD964]">{filtered.length}</span> 件
            </span>
          </h1>
          <p className="text-sm lg:text-lg text-gray-600 font-medium mt-1">
            粉丝团的商品都可以在这里下单哦
          </p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64 lg:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 z-10" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索商品名称或编号..."
              className="neo-input w-full text-sm pl-10 py-2"
            />
          </div>
          {isLoggedIn && (
            <Link
              href="/my-orders"
              className="neo-btn px-4 py-2 flex items-center gap-1.5 bg-[#FF6B7A] text-white text-xs self-stretch"
            >
              <Package className="h-3.5 w-3.5" />
              我的订单
            </Link>
          )}
          {isAdmin && (
            <Link
              href="/products/admin"
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl border-[3px] border-gray-900 bg-gray-900 text-white font-bold text-xs shadow-[3px_3px_0px_0px_rgba(0,0,0,0.3)] active:shadow-none active:translate-x-[3px] active:translate-y-[3px] transition-all self-stretch"
            >
              <Settings className="h-3.5 w-3.5" />
              后台
            </Link>
          )}
        </div>
      </div>

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-gray-200 border-t-[#4A90E2]" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <Package className="h-16 w-16 text-gray-300" />
          <div className="text-center">
            <p className="font-bold text-gray-600 text-base lg:text-lg mb-1">暂无商品数据</p>
            <p className="text-sm text-gray-400">请在数据导入页面从 WPS 导入 CSV 数据</p>
          </div>
          {isAdmin && (
            <Link
              href="/data-import"
              className="neo-btn neo-btn-blue flex items-center gap-2 px-6 py-2.5 text-sm"
            >
              <Upload className="h-4 w-4" />
              去导入数据
            </Link>
          )}
        </div>
      ) : (
        /* 淘宝风格商品网格 */
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 lg:gap-4 mt-4">
          {filtered.map((product) => (
            <div
              key={product.sale_id}
              onClick={() => !isPaused && openDetail(product)}
              className={`bg-white rounded-xl border-[3px] border-gray-900 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] overflow-hidden transition-all group ${
                isPaused ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px]"
              }`}
            >
              {/* 商品图片 */}
              <div className="aspect-square bg-gray-100 relative overflow-hidden">
                {product.photo ? (
                  <img
                    src={product.photo}
                    alt={product.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 cursor-pointer"
                    onClick={() => setImgPreview(product.photo)}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Package className="h-16 w-16 text-gray-300" />
                  </div>
                )}
                {isPaused && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <AlertTriangle className="h-12 w-12 text-[#FF6B7A]/50" />
                  </div>
                )}
                {!isPaused && product.remaining <= 0 && (
                  <div className="absolute top-2 right-2 bg-gray-900/80 text-white text-[10px] font-bold px-2 py-0.5 rounded">
                    已售罄
                  </div>
                )}
              </div>

              {/* 商品信息 */}
              <div className="p-2.5 lg:p-3">
                <h3 className="font-extrabold text-sm lg:text-base text-gray-900 truncate">
                  {product.name || "未命名商品"}
                </h3>
                {product.sale_id && (
                  <p className="text-[10px] text-gray-400 truncate mt-0.5">{product.sale_id}</p>
                )}
                <div className="flex items-center justify-between mt-2">
                  <span className="text-base lg:text-lg font-extrabold text-[#FF6B7A]">
                    {formatMoney(product.sell_price)}
                  </span>
                  <span className="text-[10px] lg:text-xs text-gray-500">
                    库存 {product.remaining || 0} 件
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 商品选购弹窗 */}
      {selectedProduct && !isPaused && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={closeDetail}>
          <div
            className="bg-white rounded-2xl border-[3px] border-gray-900 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] max-w-lg w-full max-h-[90vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 弹窗头部 */}
            <div className="flex items-center justify-between p-4 border-b-2 border-gray-200">
              <h3 className="text-base font-extrabold text-gray-900 truncate flex-1">
                {selectedProduct.name || "商品详情"}
              </h3>
              <button
                onClick={closeDetail}
                className="flex h-8 w-8 items-center justify-center rounded-lg border-2 border-gray-900 bg-white hover:bg-gray-100 shrink-0 ml-2"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {!showOrderForm ? (
              <>
                {/* 弹窗内容 */}
                <div className="overflow-y-auto max-h-[70vh]">
                  {/* 商品图片和基本信息 */}
                  <div className="flex gap-4 p-4">
                    <div className="w-32 h-32 lg:w-40 lg:h-40 rounded-xl border-2 border-gray-200 bg-gray-100 overflow-hidden shrink-0">
                      {selectedProduct.photo ? (
                        <img src={selectedProduct.photo} alt="" className="w-full h-full object-cover cursor-pointer" onClick={() => setImgPreview(selectedProduct.photo)} />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Package className="h-12 w-12 text-gray-300" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h2 className="text-lg font-extrabold text-gray-900">{selectedProduct.name || "未命名商品"}</h2>
                      {selectedProduct.sale_id && (
                        <p className="text-xs text-gray-400 font-mono mt-1">{selectedProduct.sale_id}</p>
                      )}
                      {selectedProduct.manufacturer && (
                        <p className="text-xs text-gray-500 mt-1">厂家: {selectedProduct.manufacturer}</p>
                      )}
                      <div className="mt-3">
                        <span className="text-2xl font-extrabold text-[#FF6B7A]">
                          {formatMoney(selectedProduct.sell_price)}
                        </span>
                        {selectedProduct.cost_price > 0 && (
                          <span className="text-xs text-gray-400 line-through ml-2">
                            {formatMoney(selectedProduct.cost_price)}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        总库存: {selectedProduct.remaining || 0} 件
                      </p>
                    </div>
                  </div>

                  {/* 尺码选择 */}
                  <div className="px-4 pb-2">
                    <h4 className="text-sm font-extrabold text-gray-900 mb-2">选择尺码</h4>
                    <div className="grid grid-cols-5 sm:grid-cols-7 gap-2">
                      {ALL_SIZES.map((size) => {
                        const stock = getSizeStock(selectedProduct, size);
                        const selected = (selectedSizes[size] || 0) > 0;
                        return (
                          <button
                            key={size}
                            disabled={stock <= 0}
                            onClick={() => toggleSize(size)}
                            className={`relative rounded-lg border-2 py-1.5 px-1 text-center transition-all ${
                              stock <= 0
                                ? "border-gray-200 bg-gray-50 text-gray-300 cursor-not-allowed"
                                : selected
                                ? "border-[#4A90E2] bg-[#4A90E2]/10 text-[#4A90E2]"
                                : "border-gray-300 bg-white text-gray-700 hover:border-gray-900"
                            }`}
                          >
                            <span className="text-xs font-extrabold">{size}</span>
                            <span className={`block text-[9px] ${stock <= 0 ? "text-gray-300" : selected ? "text-[#4A90E2]" : "text-gray-400"}`}>
                              {stock > 0 ? `${stock}件` : "无货"}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 已选尺码数量调整 */}
                  {Object.keys(selectedSizes).length > 0 && (
                    <div className="px-4 pb-4">
                      <h4 className="text-sm font-extrabold text-gray-900 mb-2">已选尺码</h4>
                      <div className="space-y-2">
                        {Object.entries(selectedSizes).map(([sizeStr, qty]) => {
                          const size = Number(sizeStr);
                          const stock = getSizeStock(selectedProduct, size);
                          return (
                            <div key={size} className="flex items-center justify-between bg-gray-50 rounded-lg p-2 border-2 border-gray-200">
                              <span className="text-sm font-extrabold text-gray-900">{size}码</span>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => updateSizeQty(size, -1)}
                                  className="flex h-7 w-7 items-center justify-center rounded-lg border-2 border-gray-900 bg-[#FF6B7A] text-white active:scale-90 transition-all"
                                >
                                  <span className="text-lg font-bold leading-none">-</span>
                                </button>
                                <span className="text-sm font-extrabold w-8 text-center">{qty}</span>
                                <button
                                  onClick={() => updateSizeQty(size, 1)}
                                  disabled={qty >= stock}
                                  className={`flex h-7 w-7 items-center justify-center rounded-lg border-2 border-gray-900 text-white active:scale-90 transition-all ${
                                    qty >= stock ? "bg-gray-300 cursor-not-allowed" : "bg-[#4CD964]"
                                  }`}
                                >
                                  <span className="text-lg font-bold leading-none">+</span>
                                </button>
                              </div>
                            </div>
                          );
                        })}
                        <div className="flex justify-between items-center pt-2 border-t-2 border-gray-200">
                          <span className="text-sm font-bold text-gray-500">合计 {selectedTotalQty} 件</span>
                          <span className="text-lg font-extrabold text-[#FF6B7A]">
                            {formatMoney(selectedTotalQty * (selectedProduct.sell_price || 0))}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* 底部操作栏 */}
                <div className="p-4 border-t-2 border-gray-200">
                  {selectedProduct.remaining <= 0 ? (
                    <button
                      disabled
                      className="w-full py-3 rounded-xl border-[3px] border-gray-300 bg-gray-200 text-gray-400 font-extrabold text-sm cursor-not-allowed"
                    >
                      已售罄
                    </button>
                  ) : Object.keys(selectedSizes).length === 0 ? (
                    <button
                      disabled
                      className="w-full py-3 rounded-xl border-[3px] border-gray-300 bg-gray-100 text-gray-400 font-extrabold text-sm cursor-not-allowed"
                    >
                      请选择尺码
                    </button>
                  ) : !isLoggedIn ? (
                    <button
                      onClick={handleConfirmOrder}
                      className="w-full py-3 rounded-xl border-[3px] border-gray-900 bg-[#FF8C00] text-white font-extrabold text-sm shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
                    >
                      请先登录
                    </button>
                  ) : (
                    <button
                      onClick={handleConfirmOrder}
                      className="w-full py-3 rounded-xl border-[3px] border-gray-900 bg-[#4A90E2] text-white font-extrabold text-sm shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
                    >
                      确认选购
                    </button>
                  )}
                </div>
              </>
            ) : (
              /* 下单信息填写 */
              <>
                <div className="overflow-y-auto max-h-[60vh] p-4 space-y-4">
                  <h4 className="text-sm font-extrabold text-gray-900">
                    {(orderForm.address || orderForm.recipient || orderForm.recipient_phone) ? "确认收货信息" : "填写收货信息"}
                  </h4>
                  <div>
                    <label className="text-xs font-bold text-gray-600 mb-1 block">用户名</label>
                    <input
                      type="text"
                      value={orderForm.customer}
                      onChange={(e) => setOrderForm({ ...orderForm, customer: e.target.value })}
                      placeholder="用户名"
                      disabled
                      className="neo-input w-full text-sm py-2 bg-gray-100 cursor-not-allowed"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-600 mb-1 block">地址</label>
                    <input
                      type="text"
                      value={orderForm.address}
                      onChange={(e) => setOrderForm({ ...orderForm, address: e.target.value })}
                      placeholder="收货地址"
                      className="neo-input w-full text-sm py-2"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-600 mb-1 block">收件人</label>
                    <input
                      type="text"
                      value={orderForm.recipient}
                      onChange={(e) => setOrderForm({ ...orderForm, recipient: e.target.value })}
                      placeholder="收件人姓名"
                      className="neo-input w-full text-sm py-2"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-600 mb-1 block">收件人电话</label>
                    <input
                      type="text"
                      value={orderForm.recipient_phone}
                      onChange={(e) => setOrderForm({ ...orderForm, recipient_phone: e.target.value })}
                      placeholder="电话号码"
                      className="neo-input w-full text-sm py-2"
                    />
                  </div>

                  {/* 订单摘要 */}
                  <div className="bg-gray-50 rounded-lg p-3 border-2 border-gray-200">
                    <h5 className="text-xs font-bold text-gray-500 mb-1">订单摘要</h5>
                    {Object.entries(selectedSizes).map(([size, qty]) => (
                      <div key={size} className="flex justify-between text-xs">
                        <span>{size}码 x {qty}</span>
                        <span>{formatMoney(qty * (selectedProduct.sell_price || 0))}</span>
                      </div>
                    ))}
                    <div className="flex justify-between font-extrabold text-sm pt-1 border-t border-gray-300 mt-1">
                      <span>合计 {selectedTotalQty} 件</span>
                      <span className="text-[#FF6B7A]">
                        {formatMoney(selectedTotalQty * (selectedProduct.sell_price || 0))}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="p-4 border-t-2 border-gray-200 flex gap-2">
                  <button
                    onClick={() => setShowOrderForm(false)}
                    className="flex-1 py-3 rounded-xl border-[3px] border-gray-900 bg-white text-gray-700 font-extrabold text-sm shadow-[3px_3px_0px_0px_rgba(0,0,0,0.3)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,0.3)] hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
                  >
                    返回
                  </button>
                  <button
                    onClick={submitOrder}
                    disabled={submitting}
                    className="flex-1 py-3 rounded-xl border-[3px] border-gray-900 bg-[#4CD964] text-white font-extrabold text-sm shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] transition-all disabled:opacity-50"
                  >
                    {submitting ? "提交中..." : "确认下单"}
                  </button>
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
              </>
            )}
          </div>
        </div>
      )}
    </PageWrapper>
  );
}