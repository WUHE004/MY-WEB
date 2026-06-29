"use client";

import { useState, useEffect } from "react";
import { PageWrapper } from "@/components/page-wrapper";
import { Package, Truck, CheckCircle2, Clock, MapPin, Phone, AlertCircle, X, ExternalLink } from "lucide-react";
import Link from "next/link";

interface Order {
  id: number;
  sale_id: string;
  customer: string;
  address: string;
  recipient: string;
  recipient_phone: string;
  size: number;
  quantity: number;
  sell_price: number;
  total_price: number;
  payment_status: string;
  shipping_status: string;
  tracking_number?: string;
  photo?: string;
  created_at: string;
}

const getShippingText = (status: string) => {
  switch (status) {
    case "pending":
      return "待发货";
    case "shipped":
      return "已发货";
    case "delivered":
      return "已送达";
    case "cancelled":
      return "已取消";
    default:
      return "未知状态";
  }
};

const getShippingIcon = (status: string) => {
  switch (status) {
    case "pending":
      return <Clock className="h-4 w-4 text-[#FF6B7A]" />;
    case "shipped":
      return <Truck className="h-4 w-4 text-[#4A90E2]" />;
    case "delivered":
      return <CheckCircle2 className="h-4 w-4 text-[#4CD964]" />;
    case "cancelled":
      return <AlertCircle className="h-4 w-4 text-gray-400" />;
    default:
      return <Package className="h-4 w-4 text-gray-400" />;
  }
};

const getShippingColor = (status: string) => {
  switch (status) {
    case "pending":
      return "bg-[#FF6B7A]/10 text-[#FF6B7A] border-[#FF6B7A]";
    case "shipped":
      return "bg-[#4A90E2]/10 text-[#4A90E2] border-[#4A90E2]";
    case "delivered":
      return "bg-[#4CD964]/10 text-[#4CD964] border-[#4CD964]";
    case "cancelled":
      return "bg-gray-100 text-gray-400 border-gray-300";
    default:
      return "bg-gray-100 text-gray-600 border-gray-300";
  }
};

export default function MyOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [shippingInfo, setShippingInfo] = useState<any>(null);

  useEffect(() => {
    const phone = localStorage.getItem("member_phone");
    const memberId = localStorage.getItem("member_id");

    if (!phone || !memberId) {
      setIsLoggedIn(false);
      setLoading(false);
      return;
    }

    setIsLoggedIn(true);
    fetchOrders(memberId);
  }, []);

  const fetchOrders = async (memberId: string) => {
    try {
      const res = await fetch(`/api/my-orders?member_id=${memberId}`);
      const data = await res.json();

      if (data.error) {
        setError(data.error);
      } else {
        setOrders(Array.isArray(data) ? data : []);
      }
    } catch {
      setError("加载订单失败");
    } finally {
      setLoading(false);
    }
  };

  const [shippingLoading, setShippingLoading] = useState(false);

  const handleQueryShipping = async (trackingNumber: string) => {
    setShippingLoading(true);
    setShippingInfo(null);
    try {
      const res = await fetch(`/api/shipping/query?tracking_number=${encodeURIComponent(trackingNumber)}`);
      if (!res.ok) {
        const text = await res.text();
        // 如果返回的是 HTML（404页面），说明 API 路由未部署
        if (text.includes("<!DOCTYPE") || text.includes("<html")) {
          setShippingInfo({ error: "物流查询服务暂不可用，请联系管理员" });
        } else {
          try {
            const errData = JSON.parse(text);
            setShippingInfo({ error: errData.error || "物流查询失败" });
          } catch {
            setShippingInfo({ error: "物流查询失败" });
          }
        }
        return;
      }
      const data = await res.json();
      setShippingInfo(data);
    } catch {
      setShippingInfo({ error: "查询物流信息失败，请稍后重试" });
    } finally {
      setShippingLoading(false);
    }
  };

  const formatMoney = (v: number | null | undefined) => {
    const num = v ?? 0;
    return `¥${num.toLocaleString("zh-CN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  };

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateStr;
    }
  };

  if (loading) {
    return (
      <PageWrapper>
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-gray-200 border-t-[#4A90E2]" />
        </div>
      </PageWrapper>
    );
  }

  if (!isLoggedIn) {
    return (
      <PageWrapper>
        <div className="max-w-md mx-auto">
          <div className="neo-card p-6">
            <div className="flex items-center gap-3 mb-4">
              <AlertCircle className="h-6 w-6 text-[#FF6B7A]" />
              <h2 className="text-xl font-bold text-[#FF6B7A]">请先登录</h2>
            </div>
            <p className="text-gray-600 mb-4">您需要登录后才能查看订单</p>
            <Link href="/login" className="neo-btn neo-btn-primary inline-block">
              去登录
            </Link>
          </div>
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl lg:text-3xl font-extrabold text-gray-900">
            我的订单
          </h1>
          <Link href="/products" className="neo-btn px-4 py-2 text-sm font-bold bg-gray-900 text-white">
            继续购物
          </Link>
        </div>

        {error && (
          <div className="neo-card p-3 mb-4 border-[#FF6B7A]">
            <p className="text-sm font-bold text-[#FF6B7A]">{error}</p>
          </div>
        )}

        {orders.length === 0 ? (
          <div className="neo-card p-8 text-center">
            <Package className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <h2 className="text-lg font-bold text-gray-600 mb-2">暂无订单</h2>
            <p className="text-sm text-gray-400 mb-4">您还没有任何订单记录</p>
            <Link href="/products" className="neo-btn neo-btn-primary inline-block">
              去购物
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => (
              <div
                key={order.id}
                className="neo-card p-4 cursor-pointer hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all"
                onClick={() => setSelectedOrder(order)}
              >
                <div className="flex gap-4">
                  {/* 商品图片 */}
                  <div className="w-16 h-16 rounded-xl border-2 border-gray-200 bg-gray-100 overflow-hidden shrink-0">
                    {order.photo ? (
                      <img src={order.photo} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Package className="h-8 w-8 text-gray-300" />
                      </div>
                    )}
                  </div>

                  {/* 订单信息 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-bold text-gray-900 truncate">{order.sale_id}</p>
                        <p className="text-xs text-gray-500">{formatDate(order.created_at)}</p>
                      </div>
                      <div className={`flex items-center gap-1.5 px-3 py-1 rounded-lg border-2 ${getShippingColor(order.shipping_status)}`}>
                        {getShippingIcon(order.shipping_status)}
                        <span className="text-xs font-bold">{getShippingText(order.shipping_status)}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-2">
                      <div className="text-sm text-gray-600">
                        <span>{order.size}码</span>
                        <span className="mx-1">×</span>
                        <span>{order.quantity}件</span>
                      </div>
                      <p className="text-lg font-extrabold text-[#FF6B7A]">
                        {formatMoney(order.total_price)}
                      </p>
                    </div>

                    {/* 物流单号 */}
                    {order.tracking_number && (
                      <div className="mt-2 text-xs text-gray-500">
                        <span>物流单号: </span>
                        <span className="font-bold">{order.tracking_number}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 订单详情弹窗 */}
        {selectedOrder && (
          <div
            className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
            onClick={() => {
              setSelectedOrder(null);
              setShippingInfo(null);
            }}
          >
            <div
              className="bg-white rounded-2xl border-[3px] border-gray-900 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] max-w-lg w-full max-h-[90vh] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* 弹窗头部 */}
              <div className="flex items-center justify-between p-4 border-b-2 border-gray-200">
                <h3 className="text-lg font-extrabold text-gray-900">
                  订单详情 #{selectedOrder.id}
                </h3>
                <button
                  onClick={() => {
                    setSelectedOrder(null);
                    setShippingInfo(null);
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border-2 border-gray-900 bg-white hover:bg-gray-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* 弹窗内容 */}
              <div className="overflow-y-auto max-h-[70vh] p-4 space-y-4">
                {/* 商品信息 */}
                <div className="flex gap-4">
                  <div className="w-24 h-24 rounded-xl border-2 border-gray-200 bg-gray-100 overflow-hidden shrink-0">
                    {selectedOrder.photo ? (
                      <img src={selectedOrder.photo} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Package className="h-12 w-12 text-gray-300" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-gray-900">{selectedOrder.sale_id}</p>
                    <p className="text-sm text-gray-600 mt-1">
                      {selectedOrder.size}码 × {selectedOrder.quantity}件
                    </p>
                    <p className="text-xl font-extrabold text-[#FF6B7A] mt-2">
                      {formatMoney(selectedOrder.total_price)}
                    </p>
                  </div>
                </div>

                {/* 订单状态 */}
                <div className="neo-card p-4">
                  <h4 className="text-sm font-bold text-gray-700 mb-3">订单状态</h4>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">支付状态</span>
                      <span className={`text-sm font-bold ${selectedOrder.payment_status === "paid" ? "text-[#4CD964]" : "text-[#FF6B7A]"}`}>
                        {selectedOrder.payment_status === "paid" ? "已支付" : "待支付"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">发货状态</span>
                      <div className={`flex items-center gap-1.5 px-3 py-1 rounded-lg border-2 ${getShippingColor(selectedOrder.shipping_status)}`}>
                        {getShippingIcon(selectedOrder.shipping_status)}
                        <span className="text-xs font-bold">{getShippingText(selectedOrder.shipping_status)}</span>
                      </div>
                    </div>
                    {selectedOrder.tracking_number && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">物流单号</span>
                        <span className="text-sm font-bold text-gray-900">{selectedOrder.tracking_number}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* 收货信息 */}
                <div className="neo-card p-4">
                  <h4 className="text-sm font-bold text-gray-700 mb-3">收货信息</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-start gap-2">
                      <MapPin className="h-4 w-4 text-gray-500 shrink-0 mt-0.5" />
                      <p className="text-gray-900">{selectedOrder.address}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500">收件人:</span>
                      <span className="font-bold text-gray-900">{selectedOrder.recipient}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-gray-500" />
                      <span className="font-bold text-gray-900">{selectedOrder.recipient_phone}</span>
                    </div>
                  </div>
                </div>

                {/* 物流查询 */}
                {selectedOrder.tracking_number && (
                  <div className="neo-card p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-bold text-gray-700">物流追踪</h4>
                      <button
                        onClick={() => handleQueryShipping(selectedOrder.tracking_number!)}
                        disabled={shippingLoading}
                        className="neo-btn px-3 py-1 text-xs font-bold bg-[#4A90E2] text-white disabled:opacity-50"
                      >
                        {shippingLoading ? (
                          <span className="inline-block h-3 w-3 border-2 border-white border-t-transparent rounded-full animate-spin mr-1" />
                        ) : (
                          <ExternalLink className="h-3 w-3 inline mr-1" />
                        )}
                        {shippingLoading ? "查询中..." : "查询物流"}
                      </button>
                    </div>

                    {shippingInfo && (
                      <div className="mt-3 text-sm">
                        {shippingInfo.error ? (
                          <p className="text-[#FF6B7A]">{shippingInfo.error}</p>
                        ) : (
                          <div className="space-y-2">
                            {shippingInfo.tracks?.map((item: any, index: number) => (
                              <div key={index} className="flex gap-2">
                                <span className="text-gray-500 text-xs shrink-0">{item.time}</span>
                                <span className="text-gray-900">{item.message}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* 订单时间 */}
                <div className="neo-card p-4">
                  <h4 className="text-sm font-bold text-gray-700 mb-2">订单时间</h4>
                  <p className="text-sm text-gray-900">{formatDate(selectedOrder.created_at)}</p>
                </div>
              </div>

              {/* 底部操作栏 */}
              <div className="p-4 border-t-2 border-gray-200">
                {selectedOrder.payment_status !== "paid" && (
                  <Link
                    href={`/payment?order_id=${selectedOrder.id}`}
                    className="neo-btn neo-btn-primary w-full py-3 text-sm font-bold block text-center"
                  >
                    去支付
                  </Link>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </PageWrapper>
  );
}