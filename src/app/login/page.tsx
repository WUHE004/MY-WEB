"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { LogIn, UserPlus, Phone, Lock, User, MapPin, ArrowLeft, Eye, EyeOff } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageWrapper } from "@/components/page-wrapper";

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const getModeTitle = () => {
    switch (mode) {
      case "login":
        return "登录";
      case "register":
        return "注册";
      default:
        return "登录";
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch("/api/members/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: mode,
          phone,
          password,
          name: mode === "register" ? name : undefined,
          address: mode === "register" ? address : undefined,
        }),
      });
      const data = await res.json();

      if (data.error) {
        setError(data.error);
      } else {
        if (mode === "register") {
          setSuccess("注册成功！请登录");
          setMode("login");
          setPassword("");
        } else {
          localStorage.setItem("member_token", data.token);
          localStorage.setItem("member_name", data.name);
          localStorage.setItem("member_role", data.role);
          localStorage.setItem("member_phone", data.phone);
          localStorage.setItem("member_id", data.id);
          // 同时设置 cookie，让 sendBeacon 等无法设置 Authorization header 的请求也能鉴权
          document.cookie = `member_token=${data.token}; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Lax`;
          window.location.href = "/";
        }
      }
    } catch {
      setError("网络错误，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageWrapper>
      <div className="min-h-[80vh] flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-gray-900 mb-6"
          >
            <ArrowLeft className="h-4 w-4" />
            返回首页
          </Link>

          <Card>
            <CardHeader>
              <CardTitle className="text-2xl lg:text-3xl text-center">
                {getModeTitle()}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                {mode === "register" && (
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1.5">
                      <User className="h-4 w-4 inline mr-1.5" />
                      用户名
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      className="neo-input w-full"
                      placeholder="请输入用户名"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1.5">
                    <Phone className="h-4 w-4 inline mr-1.5" />
                    手机号
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                    pattern="[0-9]{11}"
                    maxLength={11}
                    className="neo-input w-full"
                    placeholder="请输入11位手机号"
                  />
                </div>

                {mode === "register" && (
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1.5">
                      <MapPin className="h-4 w-4 inline mr-1.5" />
                      收货地址
                      <span className="text-gray-400 font-normal ml-1">（非必填）</span>
                    </label>
                    <input
                      type="text"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="neo-input w-full"
                      placeholder="请输入收货地址（可在个人信息中完善）"
                    />
                  </div>
                )}

                {/* 密码输入（登录和注册都需要） */}
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1.5">
                    <Lock className="h-4 w-4 inline mr-1.5" />
                    密码
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                      className="neo-input w-full pr-12"
                      placeholder="请输入密码（至少6位）"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none"
                      tabIndex={-1}
                    >
                      {showPassword ? (
                        <EyeOff className="h-5 w-5" />
                      ) : (
                        <Eye className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="p-3 rounded-xl border-[3px] border-[#FF6B7A] bg-[#FF6B7A]/10">
                    <p className="text-sm font-bold text-[#FF6B7A]">{error}</p>
                  </div>
                )}

                {success && (
                  <div className="p-3 rounded-xl border-[3px] border-[#4CD964] bg-[#4CD964]/10">
                    <p className="text-sm font-bold text-[#4CD964]">{success}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="neo-btn neo-btn-primary w-full flex items-center justify-center gap-2 py-3 text-base"
                >
                  {mode === "login" ? (
                    <LogIn className="h-5 w-5" />
                  ) : (
                    <UserPlus className="h-5 w-5" />
                  )}
                  {loading
                    ? "处理中..."
                    : getModeTitle()}
                </button>

                {/* 模式切换按钮 */}
                <div className="space-y-2">
                  {mode === "login" && (
                    <button
                      type="button"
                      onClick={() => {
                        setMode("register");
                        setError("");
                        setSuccess("");
                      }}
                      className="w-full text-sm font-bold text-gray-500 hover:text-gray-900 transition-colors"
                    >
                      没有账号？去注册
                    </button>
                  )}

                  {mode === "register" && (
                    <button
                      type="button"
                      onClick={() => {
                        setMode("login");
                        setError("");
                        setSuccess("");
                      }}
                      className="w-full neo-btn bg-gray-900 text-white py-2 text-sm font-bold"
                    >
                      已有账号？登录
                    </button>
                  )}
                </div>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </PageWrapper>
  );
}