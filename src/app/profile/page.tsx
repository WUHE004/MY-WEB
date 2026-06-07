"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  User,
  MapPin,
  Phone,
  Navigation,
  Save,
  ArrowLeft,
  LogOut,
  ExternalLink,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageWrapper } from "@/components/page-wrapper";

export default function ProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [memberId, setMemberId] = useState("");
  const [memberRole, setMemberRole] = useState("");
  const [address, setAddress] = useState("");
  const [recipient, setRecipient] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [douyin, setDouyin] = useState("");
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("member_token");
    if (!token) {
      router.push("/login");
      return;
    }
    setName(localStorage.getItem("member_name") || "");
    setPhone(localStorage.getItem("member_phone") || "");
    setMemberRole(localStorage.getItem("member_role") || "");
    // 解码 base64 token 获取真实 memberId
    try {
      const decodedToken = atob(token);
      setMemberId(decodedToken.split(":")[0]);
    } catch {
      setMemberId("");
    }

    fetchProfile();
  }, [router]);

  const fetchProfile = async () => {
    try {
      const res = await fetch("/api/members");
      const data = await res.json();
      const currentPhone = localStorage.getItem("member_phone");
      const member = data.find((m: { phone: string }) => m.phone === currentPhone);
      if (member) {
        setAddress(member.address || "");
        setRecipient(member.recipient || "");
        setRecipientPhone(member.recipient_phone || "");
        setDouyin(member.douyin || "");
      }
    } catch {
      // ignore
    }
  };

  const handleLocate = () => {
    if (!navigator.geolocation) {
      setError("您的浏览器不支持定位功能");
      return;
    }
    setLocating(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&accept-language=zh`
          );
          const data = await res.json();
          const addr = data.display_name || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
          setAddress(addr);
        } catch {
          setAddress(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
        }
        setLocating(false);
      },
      () => {
        setError("定位失败，请检查定位权限");
        setLocating(false);
      },
      { timeout: 10000 }
    );
  };

  const handleSave = async () => {
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/members", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: memberId,
          name,
          address,
          recipient,
          recipient_phone: recipientPhone,
          douyin,
        }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        localStorage.setItem("member_name", name);
        setSuccess("保存成功！");
      }
    } catch {
      setError("保存失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    const phone = localStorage.getItem("member_phone");
    // 调用 API 更新在线状态
    if (phone) {
      fetch("/api/members/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      }).catch(() => {});
    }
    localStorage.removeItem("member_token");
    localStorage.removeItem("member_name");
    localStorage.removeItem("member_role");
    localStorage.removeItem("member_phone");
    router.push("/");
  };

  const handleOpenDouyin = () => {
    if (douyin) {
      window.open(`https://www.douyin.com/user/${douyin}`, "_blank");
    }
  };

  return (
    <PageWrapper>
      <div className="max-w-2xl mx-auto">
        <div className="mb-6 lg:mb-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-gray-900 mb-3"
          >
            <ArrowLeft className="h-4 w-4" />
            返回首页
          </Link>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-gray-900 mb-2">
            <User className="h-6 w-6 lg:h-8 lg:w-8 inline mr-2" />
            个人信息管理
          </h1>
        </div>

        {success && (
          <div className="p-3 rounded-lg bg-green-50 border-2 border-green-200 mb-4">
            <p className="text-sm font-bold text-green-600">{success}</p>
          </div>
        )}

        {error && (
          <div className="p-3 rounded-lg bg-red-50 border-2 border-red-200 mb-4">
            <p className="text-sm font-bold text-red-600">{error}</p>
          </div>
        )}

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>基本信息</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1.5">
                <User className="h-4 w-4 inline mr-1.5" />
                用户名
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-xl border-[3px] border-gray-200 px-4 py-3 font-bold text-gray-900 focus:border-gray-900 focus:outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1.5">
                <Phone className="h-4 w-4 inline mr-1.5" />
                手机号
              </label>
              <input
                type="text"
                value={phone}
                disabled
                className="w-full rounded-xl border-[3px] border-gray-200 px-4 py-3 font-bold text-gray-400 bg-gray-50"
              />
              <p className="text-[10px] text-gray-400 mt-1">手机号不可修改</p>
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1.5">
                <ShieldIcon className="h-4 w-4 inline mr-1.5" />
                权限等级
              </label>
              <div className="w-full rounded-xl border-[3px] border-gray-200 px-4 py-3 font-bold text-gray-400 bg-gray-50">
                {memberRole === "admin" ? "管理员" : memberRole === "operator" ? "后台操作" : "顾客"}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>收货信息</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1.5">
                <MapPin className="h-4 w-4 inline mr-1.5" />
                收货地址
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="flex-1 rounded-xl border-[3px] border-gray-200 px-4 py-3 font-bold text-gray-900 focus:border-gray-900 focus:outline-none transition-colors"
                  placeholder="请输入收货地址"
                />
                <button
                  type="button"
                  onClick={handleLocate}
                  disabled={locating}
                  className="flex items-center justify-center gap-1.5 rounded-xl border-[3px] border-gray-900 bg-gray-900 px-4 py-3 text-white font-bold hover:bg-gray-700 transition-colors shrink-0"
                  title="自动定位"
                >
                  <Navigation className={`h-5 w-5 ${locating ? "animate-pulse" : ""}`} />
                  <span className="hidden sm:inline text-sm">{locating ? "定位中" : "定位"}</span>
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1.5">
                  <User className="h-4 w-4 inline mr-1.5" />
                  收件人
                </label>
                <input
                  type="text"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  className="w-full rounded-xl border-[3px] border-gray-200 px-4 py-3 font-bold text-gray-900 focus:border-gray-900 focus:outline-none transition-colors"
                  placeholder="收件人姓名"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1.5">
                  <Phone className="h-4 w-4 inline mr-1.5" />
                  收件人电话
                </label>
                <input
                  type="tel"
                  value={recipientPhone}
                  onChange={(e) => setRecipientPhone(e.target.value)}
                  maxLength={11}
                  className="w-full rounded-xl border-[3px] border-gray-200 px-4 py-3 font-bold text-gray-900 focus:border-gray-900 focus:outline-none transition-colors"
                  placeholder="收件人电话"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>关联账号</CardTitle>
          </CardHeader>
          <CardContent>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1.5">
                抖音号
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={douyin}
                  onChange={(e) => setDouyin(e.target.value)}
                  className="flex-1 rounded-xl border-[3px] border-gray-200 px-4 py-3 font-bold text-gray-900 focus:border-gray-900 focus:outline-none transition-colors"
                  placeholder="请输入抖音号/ID"
                />
                <button
                  type="button"
                  onClick={handleOpenDouyin}
                  disabled={!douyin}
                  className="flex items-center justify-center gap-1.5 rounded-xl border-[3px] border-gray-900 bg-black px-4 py-3 text-white font-bold hover:bg-gray-800 transition-colors shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ExternalLink className="h-5 w-5" />
                  <span className="hidden sm:inline text-sm">跳转抖音</span>
                </button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={handleSave}
            disabled={loading}
            className="neo-btn neo-btn-primary flex items-center justify-center gap-2 px-8 py-3 text-base flex-1"
          >
            <Save className="h-5 w-5" />
            {loading ? "保存中..." : "保存修改"}
          </button>
          <button
            onClick={handleLogout}
            className="neo-btn neo-btn-secondary flex items-center justify-center gap-2 px-8 py-3 text-base"
          >
            <LogOut className="h-5 w-5" />
            退出登录
          </button>
        </div>
      </div>
    </PageWrapper>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}