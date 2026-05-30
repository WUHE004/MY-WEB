'use client';

import { useState } from "react";

export default function AuthPage() {
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAutoGetToken = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch("/api/wps-token-auto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      
      const data = await response.json();
      
      if (data.access_token) {
        setToken(data.access_token);
        localStorage.setItem("wps_access_token", data.access_token);
        alert("Token获取成功！已保存到本地存储");
      } else {
        setError(data.error || "获取Token失败，请检查权限是否已开通");
      }
    } catch (err) {
      setError("请求失败，请重试");
    }
    
    setLoading(false);
  };

  const handleManualTokenInput = () => {
    const inputToken = prompt("请输入你的WPS Access Token：");
    if (inputToken) {
      setToken(inputToken);
      localStorage.setItem("wps_access_token", inputToken);
      alert("Token已保存！");
    }
  };

  const handleCopy = async () => {
    if (token) {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full">
        <h1 className="text-2xl font-bold text-gray-800 mb-2 text-center">WPS 授权</h1>
        <p className="text-gray-500 mb-6 text-center">获取多维表格访问权限</p>
        
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-yellow-800">
            <strong>注意：</strong>请先在WPS开放平台开通「云文档」权限，否则Token将无法访问多维表格数据。
          </p>
        </div>

        <div className="space-y-4">
          {!token ? (
            <div className="space-y-3">
              <button
                onClick={handleAutoGetToken}
                disabled={loading}
                className="w-full bg-gradient-to-r from-green-500 to-emerald-600 text-white py-3 px-6 rounded-xl font-semibold hover:from-green-600 hover:to-emerald-700 transition-all duration-300 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "获取中..." : "自动获取Token"}
              </button>
              
              <button
                onClick={handleManualTokenInput}
                className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white py-3 px-6 rounded-xl font-semibold hover:from-purple-700 hover:to-pink-700 transition-all duration-300 shadow-lg hover:shadow-xl"
              >
                手动输入Token
              </button>
              
              {error && (
                <p className="text-red-500 text-center text-sm">{error}</p>
              )}
            </div>
          ) : (
            <div className="bg-green-50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-green-800 font-semibold">✅ Token已保存</span>
                <button
                  onClick={handleCopy}
                  className="text-sm text-green-600 hover:text-green-700"
                >
                  {copied ? "已复制" : "复制"}
                </button>
              </div>
              <p className="text-xs text-green-700 font-mono break-all">{token}</p>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={handleAutoGetToken}
                  disabled={loading}
                  className="flex-1 bg-green-100 text-green-700 py-2 px-4 rounded-lg hover:bg-green-200 transition-colors disabled:opacity-50"
                >
                  {loading ? "刷新中..." : "刷新Token"}
                </button>
                <button
                  onClick={handleManualTokenInput}
                  className="flex-1 bg-green-100 text-green-700 py-2 px-4 rounded-lg hover:bg-green-200 transition-colors"
                >
                  更新Token
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 bg-gray-50 rounded-lg p-4">
          <h3 className="font-semibold text-gray-800 mb-2">📋 权限开通步骤：</h3>
          <ol className="text-sm text-gray-600 space-y-1">
            <li>1. 登录 <a href="https://open.wps.cn" target="_blank" rel="noopener" className="text-blue-500 hover:underline">WPS开放平台</a></li>
            <li>2. 进入「我的应用」→ 选择你的应用</li>
            <li>3. 点击「权限管理」→ 找到「云文档」</li>
            <li>4. 点击「申请开通」按钮</li>
          </ol>
        </div>

        <p className="mt-4 text-xs text-gray-400 text-center">
          Token会保存在浏览器本地存储中，刷新页面后仍有效
        </p>
      </div>
    </div>
  );
}
