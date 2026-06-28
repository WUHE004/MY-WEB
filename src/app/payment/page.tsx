"use client";

import { useState, useEffect } from "react";
import { PageWrapper } from "@/components/page-wrapper";
import { Package, CreditCard, CheckCircle2, AlertCircle, QrCode } from "lucide-react";
import Link from "next/link";

interface OrderInfo {
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
  payment_method?: string;
  created_at: string;
}

interface PaymentQR {
  wechat_qr: string;
  alipay_qr: string;
}

export default function PaymentPage() {
  const [orderId, setOrderId] = useState<string>("");
  const [order, setOrder] = useState<OrderInfo | null>(null);
  const [paymentQR, setPaymentQR] = useState<PaymentQR | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"wechat" | "alipay">("wechat");
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    // 从URL获取订单ID
    const params = new URLSearchParams(window.location.search);
    const id = params.get("order_id");
    if (!id) {
      setError("缺少订单ID参数");
      setLoading(false);
      return;
    }
    setOrderId(id);
    fetchOrderAndQR(id);
  }, []);

  const fetchOrderAndQR = async (id: string) => {
    try {
      // 获取订单详情
      const orderRes = await fetch(`/api/web-orders?id=${id}`);
      const orderData = await orderRes.json();

      if (orderData.error) {
        setError(orderData.error);
        return;
      }

      // 如果订单已经支付，跳转到订单详情页
      if (orderData.payment_status === "paid") {
        window.location.href = `/my-orders?order_id=${id}`;
        return;
      }

      setOrder(orderData);

      // 获取收款二维码
      const qrRes = await fetch("/api/payment-qr");
      const qrData = await qrRes.json();

      if (!qrData.error && Array.isArray(qrData)) {
        const wechat = qrData.find((item: { type: string; image_url: string }) => item.type === "wechat");
        const alipay = qrData.find((item: { type: string; image_url: string }) => item.type === "alipay");
        setPaymentQR({
          wechat_qr: wechat?.image_url || "",
          alipay_qr: alipay?.image_url || "",
        });
      }
    } catch {
      setError("加载订单信息失败");
    } finally {
      setLoading(false);
    }
  };

  const handlePaid = async () => {
    if (!order) return;

    setConfirming(true);
    setError("");

    try {
      const res = await fetch("/api/web-orders", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: order.id,
          payment_status: "paid",
          payment_method: paymentMethod,
        }),
      });

      const data = await res.json();

      if (data.error) {
        setError(data.error);
      } else {
        // 跳转到订单列表页
        window.location.href = "/my-orders";
      }
    } catch {
      setError("确认支付失败，请稍后重试");
    } finally {
      setConfirming(false);
    }
  };

  const formatMoney = (v: number | null | undefined) => {
    const num = v ?? 0;
    return `¥${num.toLocaleString("zh-CN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
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

  if (error) {
    return (
      <PageWrapper>
        <div className="max-w-md mx-auto">
          <div className="neo-card p-6">
            <div className="flex items-center gap-3 mb-4">
              <AlertCircle className="h-6 w-6 text-[#FF6B7A]" />
              <h2 className="text-xl font-bold text-[#FF6B7A]">出错了</h2>
            </div>
            <p className="text-gray-600 mb-4">{error}</p>
            <Link href="/" className="neo-btn neo-btn-primary inline-block">
              返回首页
            </Link>
          </div>
        </div>
      </PageWrapper>
    );
  }

  if (!order) {
    return (
      <PageWrapper>
        <div className="max-w-md mx-auto">
          <div className="neo-card p-6">
            <p className="text-gray-600">订单不存在</p>
            <Link href="/" className="neo-btn neo-btn-primary inline-block mt-4">
              返回首页
            </Link>
          </div>
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl lg:text-3xl font-extrabold text-gray-900 mb-6">
          订单支付
        </h1>

        {/* 订单信息卡片 */}
        <div className="neo-card p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Package className="h-5 w-5 text-gray-700" />
            <h2 className="text-lg font-bold text-gray-900">订单详情</h2>
          </div>

          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">订单号:</span>
              <span className="font-bold text-gray-900">#{order.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">商品编号:</span>
              <span className="font-bold text-gray-900">{order.sale_id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">尺码:</span>
              <span className="font-bold text-gray-900">{order.size}码</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">数量:</span>
              <span className="font-bold text-gray-900">{order.quantity}件</span>
            </div>
            <div className="flex justify-between border-t-2 border-gray-200 pt-3 mt-3">
              <span className="text-gray-700 font-bold">支付金额:</span>
              <span className="text-xl font-extrabold text-[#FF6B7A]">
                {formatMoney(order.total_price)}
              </span>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t-2 border-gray-200">
            <p className="text-xs font-bold text-gray-500 mb-2">收货信息</p>
            <div className="text-sm space-y-1">
              <p><span className="text-gray-600">收件人:</span> <span className="font-bold">{order.recipient}</span></p>
              <p><span className="text-gray-600">电话:</span> <span className="font-bold">{order.recipient_phone}</span></p>
              <p><span className="text-gray-600">地址:</span> <span className="font-bold">{order.address}</span></p>
            </div>
          </div>
        </div>

        {/* 收款码展示 */}
        <div className="neo-card p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <QrCode className="h-5 w-5 text-gray-700" />
            <h2 className="text-lg font-bold text-gray-900">请扫码支付</h2>
          </div>

          {/* 支付方式选择 */}
          <div className="flex gap-3 mb-4">
            <button
              onClick={() => setPaymentMethod("wechat")}
              className={`flex-1 neo-btn py-2 text-sm font-bold ${
                paymentMethod === "wechat"
                  ? "bg-[#4CD964] text-white border-gray-900"
                  : "bg-white text-gray-700 border-gray-300"
              }`}
            >
              微信支付
            </button>
            <button
              onClick={() => setPaymentMethod("alipay")}
              className={`flex-1 neo-btn py-2 text-sm font-bold ${
                paymentMethod === "alipay"
                  ? "bg-[#4A90E2] text-white border-gray-900"
                  : "bg-white text-gray-700 border-gray-300"
              }`}
            >
              支付宝支付
            </button>
          </div>

          {/* 二维码图片 - 只显示当前选中的支付方式 */}
          {paymentQR ? (
            <div className="flex justify-center">
              {paymentMethod === "wechat" && paymentQR.wechat_qr ? (
                <div className="flex flex-col items-center">
                  <img
                    src={paymentQR.wechat_qr}
                    alt="微信收款码"
                    className="neo-border rounded-xl w-48 h-48 object-cover"
                  />
                  <p className="text-xs font-bold text-[#4CD964] mt-2">微信收款码</p>
                </div>
              ) : paymentMethod === "alipay" && paymentQR.alipay_qr ? (
                <div className="flex flex-col items-center">
                  <img
                    src={paymentQR.alipay_qr}
                    alt="支付宝收款码"
                    className="neo-border rounded-xl w-48 h-48 object-cover"
                  />
                  <p className="text-xs font-bold text-[#4A90E2] mt-2">支付宝收款码</p>
                </div>
              ) : (
                <div className="text-center py-4 text-gray-500">
                  <p className="text-sm">暂无{paymentMethod === "wechat" ? "微信" : "支付宝"}收款码</p>
                  <p className="text-xs mt-1">请联系客服获取收款方式</p>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <p className="text-sm">暂无收款码信息</p>
              <p className="text-xs mt-1">请联系客服获取收款方式</p>
            </div>
          )}

          <p className="text-xs text-gray-500 mt-4 text-center">
            扫码支付后，请点击下方按钮确认支付
          </p>
        </div>

        {/* 确认支付按钮 */}
        <button
          onClick={handlePaid}
          disabled={confirming}
          className="neo-btn neo-btn-primary w-full flex items-center justify-center gap-2 py-4 text-lg"
        >
          <CheckCircle2 className="h-6 w-6" />
          {confirming ? "确认中..." : "我已支付，确认订单"}
        </button>

        {error && (
          <div className="neo-card p-3 mt-4 border-[#FF6B7A]">
            <p className="text-sm font-bold text-[#FF6B7A]">{error}</p>
          </div>
        )}
      </div>
    </PageWrapper>
  );
}