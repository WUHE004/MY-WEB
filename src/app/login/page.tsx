"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { LogIn, UserPlus, Phone, Lock, User, ArrowLeft, MapPin, Eye, EyeOff, MessageSquare, KeyRound } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageWrapper } from "@/components/page-wrapper";

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "register" | "sms_login" | "reset_password">("login");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [sendingCode, setSendingCode] = useState(false);

  // 倒计时效果
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const getModeTitle = () => {
    switch (mode) {
      case "login":
        return "登录";
      case "register":
        return "注册";
      case "sms_login":
        return "短信登录";
      case "reset_password":
        return "重置密码";
      default:
        return "登录";
    }
  };

  // 发送验证码
  const handleSendCode = async () => {
    if (!phone || phone.length !== 11) {
      setError("请输入正确的11位手机号");
      return;
    }

    setSendingCode(true);
    setError("");

    try {
      const res = await fetch("/api/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          type: mode === "register" ? "register" : mode === "sms_login" ? "login" : "reset_password"
        }),
      });
      const data = await res.json();

      if (data.error) {
        setError(data.error);
      } else {
        setSuccess("验证码已发送");
        setCountdown(60);
      }
    } catch {
      setError("发送验证码失败，请稍后重试");
    } finally {
      setSendingCode(false);
    }
  };

  // 短信验证码登录
  const handleSmsLogin = async () => {
    if (!phone || phone.length !== 11) {
      setError("请输入正确的11位手机号");
      return;
    }
    if (!verificationCode) {
      setError("请输入验证码");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      // 1. 先验证验证码
      const verifyRes = await fetch("/api/sms/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code: verificationCode, type: "login" }),
      });
      const verifyData = await verifyRes.json();

      if (verifyData.error) {
        setError(verifyData.error);
        return;
      }

      // 2. 验证成功后，查询用户信息并登录
      const memberRes = await fetch(`/api/members?phone=${phone}`);
      const memberData = await memberRes.json();

      if (memberData.error || !memberData.id) {
        setError("用户不存在，请先注册");
        return;
      }

      // 3. 存储登录信息到 localStorage
      localStorage.setItem("member_token", `sms_${phone}_${Date.now()}`);
      localStorage.setItem("member_name", memberData.name || "");
      localStorage.setItem("member_role", memberData.role || "member");
      localStorage.setItem("member_phone", phone);
      localStorage.setItem("member_id", memberData.id);

      setSuccess("登录成功！");
      setTimeout(() => {
        window.location.href = "/";
      }, 500);
    } catch {
      setError("登录失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 短信登录使用单独的handleSmsLogin
    if (mode === "sms_login") {
      await handleSmsLogin();
      return;
    }

    // 重置密码逻辑
    if (mode === "reset_password") {
      if (!phone || phone.length !== 11) {
        setError("请输入正确的11位手机号");
        return;
      }
      if (!verificationCode) {
        setError("请输入验证码");
        return;
      }
      if (!password || password.length < 6) {
        setError("请输入新密码（至少6位）");
        return;
      }

      setLoading(true);
      setError("");
      setSuccess("");

      try {
        // 1. 验证验证码
        const verifyRes = await fetch("/api/sms/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone, code: verificationCode, type: "reset_password" }),
        });
        const verifyData = await verifyRes.json();

        if (verifyData.error) {
          setError(verifyData.error);
          return;
        }

        // 2. 重置密码
        const resetRes = await fetch("/api/members/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "reset_password",
            phone,
            password,
          }),
        });
        const resetData = await resetRes.json();

        if (resetData.error) {
          setError(resetData.error);
        } else {
          setSuccess("密码重置成功！请登录");
          setMode("login");
          setPassword("");
          setVerificationCode("");
        }
      } catch {
        setError("网络错误，请稍后重试");
      } finally {
        setLoading(false);
      }
      return;
    }

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

                {/* 短信登录/注册/忘记密码 - 验证码输入 */}
                {(mode === "sms_login" || mode === "register" || mode === "reset_password") && (
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1.5">
                      <MessageSquare className="h-4 w-4 inline mr-1.5" />
                      验证码
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={verificationCode}
                        onChange={(e) => setVerificationCode(e.target.value)}
                        required
                        maxLength={6}
                        className="neo-input flex-1"
                        placeholder="请输入6位验证码"
                      />
                      <button
                        type="button"
                        onClick={handleSendCode}
                        disabled={countdown > 0 || sendingCode}
                        className={`neo-btn px-4 py-2 text-sm font-bold whitespace-nowrap ${
                          countdown > 0 || sendingCode
                            ? "bg-gray-200 text-gray-400 border-gray-300"
                            : "bg-[#4A90E2] text-white border-gray-900"
                        }`}
                      >
                        {sendingCode ? "发送中..." : countdown > 0 ? `${countdown}秒后重发` : "发送验证码"}
                      </button>
                    </div>
                  </div>
                )}

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

                {/* 登录和重置密码模式 - 密码输入 */}
                {(mode === "login" || mode === "reset_password") && (
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1.5">
                      <Lock className="h-4 w-4 inline mr-1.5" />
                      {mode === "reset_password" ? "新密码" : "密码"}
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required={mode === "login"}
                        minLength={6}
                        className="neo-input w-full pr-12"
                        placeholder={mode === "reset_password" ? "请输入新密码（至少6位）" : "请输入密码（至少6位）"}
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
                )}

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
                  {mode === "sms_login" ? (
                    <MessageSquare className="h-5 w-5" />
                  ) : mode === "reset_password" ? (
                    <KeyRound className="h-5 w-5" />
                  ) : mode === "login" ? (
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
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setMode("sms_login");
                          setError("");
                          setSuccess("");
                          setPassword("");
                        }}
                        className="w-full neo-btn bg-[#4A90E2] text-white py-2 text-sm font-bold"
                      >
                        <MessageSquare className="h-4 w-4 inline mr-1.5" />
                        短信验证码登录
                      </button>
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
                      <button
                        type="button"
                        onClick={() => {
                          setMode("reset_password");
                          setError("");
                          setSuccess("");
                          setPassword("");
                        }}
                        className="w-full text-xs font-bold text-gray-400 hover:text-gray-600 transition-colors"
                      >
                       忘记密码？
                      </button>
                    </>
                  )}

                  {mode === "sms_login" && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setMode("login");
                          setError("");
                          setSuccess("");
                          setVerificationCode("");
                        }}
                        className="w-full neo-btn bg-gray-900 text-white py-2 text-sm font-bold"
                      >
                        <Lock className="h-4 w-4 inline mr-1.5" />
                        密码登录
                      </button>
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
                    </>
                  )}

                  {mode === "register" && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setMode("login");
                          setError("");
                          setSuccess("");
                          setVerificationCode("");
                        }}
                        className="w-full neo-btn bg-gray-900 text-white py-2 text-sm font-bold"
                      >
                        已有账号？密码登录
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMode("sms_login");
                          setError("");
                          setSuccess("");
                          setVerificationCode("");
                        }}
                        className="w-full text-sm font-bold text-gray-500 hover:text-gray-900 transition-colors"
                      >
                        已有账号？短信登录
                      </button>
                    </>
                  )}

                  {mode === "reset_password" && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setMode("login");
                          setError("");
                          setSuccess("");
                          setVerificationCode("");
                          setPassword("");
                        }}
                        className="w-full neo-btn bg-gray-900 text-white py-2 text-sm font-bold"
                      >
                        <ArrowLeft className="h-4 w-4 inline mr-1.5" />
                        返回登录
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMode("sms_login");
                          setError("");
                          setSuccess("");
                          setPassword("");
                        }}
                        className="w-full text-sm font-bold text-gray-500 hover:text-gray-900 transition-colors"
                      >
                        短信验证码登录
                      </button>
                    </>
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