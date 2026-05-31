"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogIn, UserPlus, Phone, Lock, User, ArrowLeft, MapPin } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageWrapper } from "@/components/page-wrapper";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

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
          router.push("/");
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
                {mode === "login" ? "登录" : "注册"}
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
                      className="w-full rounded-xl border-[3px] border-gray-200 px-4 py-3 font-bold text-gray-900 focus:border-gray-900 focus:outline-none transition-colors"
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
                    className="w-full rounded-xl border-[3px] border-gray-200 px-4 py-3 font-bold text-gray-900 focus:border-gray-900 focus:outline-none transition-colors"
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
                      className="w-full rounded-xl border-[3px] border-gray-200 px-4 py-3 font-bold text-gray-900 focus:border-gray-900 focus:outline-none transition-colors"
                      placeholder="请输入收货地址（可在个人信息中完善）"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1.5">
                    <Lock className="h-4 w-4 inline mr-1.5" />
                    密码
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    className="w-full rounded-xl border-[3px] border-gray-200 px-4 py-3 font-bold text-gray-900 focus:border-gray-900 focus:outline-none transition-colors"
                    placeholder="请输入密码（至少6位）"
                  />
                </div>

                {error && (
                  <div className="p-3 rounded-lg bg-red-50 border-2 border-red-200">
                    <p className="text-sm font-bold text-red-600">{error}</p>
                  </div>
                )}

                {success && (
                  <div className="p-3 rounded-lg bg-green-50 border-2 border-green-200">
                    <p className="text-sm font-bold text-green-600">{success}</p>
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
                    : mode === "login"
                      ? "登录"
                      : "注册"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode(mode === "login" ? "register" : "login");
                    setError("");
                    setSuccess("");
                  }}
                  className="w-full text-sm font-bold text-gray-500 hover:text-gray-900 transition-colors"
                >
                  {mode === "login" ? "没有账号？去注册" : "已有账号？去登录"}
                </button>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </PageWrapper>
  );
}