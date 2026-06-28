"use client";

import { useState, useEffect } from "react";
import { PageWrapper } from "@/components/page-wrapper";
import { QrCode, Upload, Save, ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface QRCodeItem {
  id: number;
  type: "wechat" | "alipay";
  image_url: string;
  description: string;
  is_active: boolean;
  updated_at: string;
}

export default function PaymentQRPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [currentRole, setCurrentRole] = useState("");
  const [wechatUrl, setWechatUrl] = useState("");
  const [alipayUrl, setAlipayUrl] = useState("");
  const [wechatFile, setWechatFile] = useState<File | null>(null);
  const [alipayFile, setAlipayFile] = useState<File | null>(null);
  const [wechatPreview, setWechatPreview] = useState("");
  const [alipayPreview, setAlipayPreview] = useState("");

  useEffect(() => {
    const role = localStorage.getItem("member_role") || "";
    setCurrentRole(role);
    if (role !== "admin" && role !== "operator") {
      router.push("/");
      return;
    }
    fetchQRCodes();
  }, [router]);

  const fetchQRCodes = async () => {
    try {
      const res = await fetch("/api/payment-qr");
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else if (Array.isArray(data)) {
        const wechat = data.find((item: QRCodeItem) => item.type === "wechat");
        const alipay = data.find((item: QRCodeItem) => item.type === "alipay");
        if (wechat) {
          setWechatUrl(wechat.image_url);
          setWechatPreview(wechat.image_url);
        }
        if (alipay) {
          setAlipayUrl(alipay.image_url);
          setAlipayPreview(alipay.image_url);
        }
      }
    } catch {
      setError("获取收款码失败");
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    type: "wechat" | "alipay"
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (type === "wechat") {
      setWechatFile(file);
    } else {
      setAlipayFile(file);
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (type === "wechat") {
        setWechatPreview(result);
      } else {
        setAlipayPreview(result);
      }
    };
    reader.readAsDataURL(file);
  };

  const uploadToStorage = async (file: File, type: "wechat" | "alipay"): Promise<string> => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("path", `payment-qr/${type}_${Date.now()}.png`);

    const res = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();
    if (data.error) {
      throw new Error(data.error);
    }
    return data.url;
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      let wechatImageUrl = wechatUrl;
      let alipayImageUrl = alipayUrl;

      if (wechatFile) {
        wechatImageUrl = await uploadToStorage(wechatFile, "wechat");
      }
      if (alipayFile) {
        alipayImageUrl = await uploadToStorage(alipayFile, "alipay");
      }

      const wechatRes = await fetch("/api/payment-qr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "wechat", image_url: wechatImageUrl }),
      });
      const wechatData = await wechatRes.json();
      if (wechatData.error) {
        throw new Error(wechatData.error);
      }

      const alipayRes = await fetch("/api/payment-qr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "alipay", image_url: alipayImageUrl }),
      });
      const alipayData = await alipayRes.json();
      if (alipayData.error) {
        throw new Error(alipayData.error);
      }

      setWechatFile(null);
      setAlipayFile(null);
      setWechatUrl(wechatImageUrl);
      setAlipayUrl(alipayImageUrl);
      setSuccess("收款码保存成功！");
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败，请重试");
    } finally {
      setSaving(false);
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

  return (
    <PageWrapper>
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-gray-900 mb-3"
          >
            <ArrowLeft className="h-4 w-4" />
            返回首页
          </Link>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-gray-900">
            <QrCode className="h-7 w-7 lg:h-9 lg:w-9 inline mr-2" />
            收款码管理
          </h1>
        </div>

        {error && (
          <div className="p-3 rounded-xl border-[3px] border-[#FF6B7A] bg-[#FF6B7A]/10 mb-4">
            <p className="text-sm font-bold text-[#FF6B7A]">{error}</p>
          </div>
        )}

        {success && (
          <div className="p-3 rounded-xl border-[3px] border-[#4CD964] bg-[#4CD964]/10 mb-4">
            <p className="text-sm font-bold text-[#4CD964]">{success}</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* 微信收款码 */}
          <div className="neo-card p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-[#4CD964] flex items-center justify-center">
                <QrCode className="h-5 w-5 text-white" />
              </div>
              微信收款码
            </h2>

            <div className="aspect-square rounded-xl border-[3px] border-dashed border-gray-300 bg-gray-50 flex items-center justify-center mb-4 overflow-hidden">
              {wechatPreview ? (
                <img
                  src={wechatPreview}
                  alt="微信收款码预览"
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="text-center text-gray-400">
                  <QrCode className="h-12 w-12 mx-auto mb-2 opacity-30" />
                  <p className="text-sm font-bold">暂无收款码</p>
                </div>
              )}
            </div>

            <label className="neo-btn w-full flex items-center justify-center gap-2 py-2 text-sm font-bold cursor-pointer bg-[#4CD964] text-white border-gray-900 hover:bg-[#45c058]">
              <Upload className="h-4 w-4" />
              上传微信收款码
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handleFileChange(e, "wechat")}
                className="hidden"
              />
            </label>

            <div className="mt-3">
              <label className="block text-xs font-bold text-gray-500 mb-1">
                或输入图片URL
              </label>
              <input
                type="text"
                value={wechatUrl}
                onChange={(e) => {
                  setWechatUrl(e.target.value);
                  setWechatPreview(e.target.value);
                }}
                className="neo-input w-full text-sm"
                placeholder="https://..."
              />
            </div>
          </div>

          {/* 支付宝收款码 */}
          <div className="neo-card p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-[#4A90E2] flex items-center justify-center">
                <QrCode className="h-5 w-5 text-white" />
              </div>
              支付宝收款码
            </h2>

            <div className="aspect-square rounded-xl border-[3px] border-dashed border-gray-300 bg-gray-50 flex items-center justify-center mb-4 overflow-hidden">
              {alipayPreview ? (
                <img
                  src={alipayPreview}
                  alt="支付宝收款码预览"
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="text-center text-gray-400">
                  <QrCode className="h-12 w-12 mx-auto mb-2 opacity-30" />
                  <p className="text-sm font-bold">暂无收款码</p>
                </div>
              )}
            </div>

            <label className="neo-btn w-full flex items-center justify-center gap-2 py-2 text-sm font-bold cursor-pointer bg-[#4A90E2] text-white border-gray-900 hover:bg-[#3a7bc8]">
              <Upload className="h-4 w-4" />
              上传支付宝收款码
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handleFileChange(e, "alipay")}
                className="hidden"
              />
            </label>

            <div className="mt-3">
              <label className="block text-xs font-bold text-gray-500 mb-1">
                或输入图片URL
              </label>
              <input
                type="text"
                value={alipayUrl}
                onChange={(e) => {
                  setAlipayUrl(e.target.value);
                  setAlipayPreview(e.target.value);
                }}
                className="neo-input w-full text-sm"
                placeholder="https://..."
              />
            </div>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="neo-btn neo-btn-primary w-full flex items-center justify-center gap-2 py-3 text-base"
        >
          {saving ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Save className="h-5 w-5" />
          )}
          {saving ? "保存中..." : "保存收款码"}
        </button>
      </div>
    </PageWrapper>
  );
}
