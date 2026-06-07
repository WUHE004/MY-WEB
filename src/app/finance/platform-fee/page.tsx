"use client";

import { useState, useEffect, useMemo } from "react";
import { ArrowLeft, RefreshCw, Save } from "lucide-react";
import Link from "next/link";
import { PageWrapper } from "@/components/page-wrapper";

interface PlatformRecord {
  date: string;
  total_qty: number;
  total_revenue: number;
  total_cost: number;
  total_profit: number;
  shipping_fee: number;
  platform_fee: number;
  net_profit: number;
}

function fmt(n: number): string {
  if (n === 0) return "0";
  return Math.abs(n) >= 1e6
    ? (n / 1e6).toFixed(2) + "M"
    : Math.abs(n) >= 1e4
    ? (n / 1e4).toFixed(2) + "万"
    : n.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function PlatformFeePage() {
  const [rate, setRate] = useState("5");
  const [rate1, setRate1] = useState("");
  const [rate2, setRate2] = useState("");
  const [rate3, setRate3] = useState("");
  const [records, setRecords] = useState<PlatformRecord[]>([]);
  const [totals, setTotals] = useState({
    total_revenue: 0, total_cost: 0, total_profit: 0,
    total_shipping: 0, total_platform_fee: 0, total_net_profit: 0,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [ratesLoaded, setRatesLoaded] = useState(false);

  // 加载快递费率
  useEffect(() => {
    fetch("/api/shipping-rates")
      .then((r) => r.json())
      .then((data) => {
        if (!data.error) {
          setRate1(String(data.rate1 || "0"));
          setRate2(String(data.rate2 || "0"));
          setRate3(String(data.rate3 || "0"));
        }
        setRatesLoaded(true);
      })
      .catch(() => { setRatesLoaded(true); });
  }, []);

  // 加载平台抽点率
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        if (data?.platform_fee_rate) {
          setRate(String(data.platform_fee_rate));
        }
      })
      .catch(() => {});
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("rate", rate || "5");
      params.set("rate1", rate1 || "0");
      params.set("rate2", rate2 || "0");
      params.set("rate3", rate3 || "0");

      const res = await fetch(`/api/platform-fee?${params}`);
      const data = await res.json();
      if (!data.error) {
        setRecords(data.records || []);
        setTotals({
          total_revenue: data.total_revenue || 0,
          total_cost: data.total_cost || 0,
          total_profit: data.total_profit || 0,
          total_shipping: data.total_shipping || 0,
          total_platform_fee: data.total_platform_fee || 0,
          total_net_profit: data.total_net_profit || 0,
        });
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (ratesLoaded) fetchData();
  }, [ratesLoaded]);

  const saveRate = async () => {
    setSaving(true);
    setSaveMsg("");
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "platform_fee_rate", value: Number(rate) || 5 }),
      });
      const data = await res.json();
      if (data.error) {
        setSaveMsg("保存失败: " + data.error);
      } else {
        setSaveMsg("保存成功");
        fetchData();
      }
    } catch {
      setSaveMsg("保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageWrapper>
      {/* Header */}
      <div className="flex items-center gap-2 sm:gap-3 lg:gap-4 mb-4 sm:mb-6">
        <Link
          href="/links"
          className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl border-[3px] border-gray-900 bg-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] transition-all shrink-0"
        >
          <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
        </Link>
        <h1 className="text-xl sm:text-2xl lg:text-4xl font-extrabold text-gray-900">
          <span className="highlight-red">平台抽点</span>
        </h1>
      </div>

      {/* 平台抽点设置 */}
      <div className="bg-white rounded-xl border-[3px] border-gray-900 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-4 lg:p-6 mb-6">
        <div className="flex flex-wrap items-center gap-2 lg:gap-3">
          <span className="text-sm lg:text-base font-extrabold text-gray-900">平台抽点设置</span>
          <div className="flex items-center gap-1">
            <input
              type="number"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              placeholder="5"
              step="0.1"
              className="w-14 lg:w-20 px-1.5 py-1.5 lg:px-2 lg:py-2 rounded-lg border-[2px] border-gray-900 text-xs lg:text-sm font-bold"
            />
            <span className="text-xs font-bold text-gray-500">%</span>
          </div>
          <button
            onClick={saveRate}
            disabled={saving}
            className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border-[2px] border-green-500 bg-green-500 text-white font-extrabold hover:bg-green-600 transition-all disabled:opacity-50"
          >
            <Save className="h-3 w-3" />{saving ? "保存中..." : "保存"}
          </button>
          <button
            onClick={fetchData}
            disabled={loading}
            className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border-[2px] border-gray-900 bg-gray-900 text-white font-extrabold hover:bg-gray-800 transition-all"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            刷新
          </button>
          {saveMsg && (
            <span className={`text-xs font-bold ${saveMsg.includes("失败") ? "text-red-500" : "text-green-500"}`}>
              {saveMsg}
            </span>
          )}
        </div>
        <p className="text-[10px] text-gray-400 mt-2">
          规则: 当日售出超过100件时抽点为总营业额的{rate}%, 少于100件时为0
        </p>
      </div>

      {/* 汇总统计 */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-2 lg:gap-3 mb-4">
        {[
          { label: "总营业额", value: totals.total_revenue, color: "text-green-600" },
          { label: "总成本", value: totals.total_cost, color: "text-gray-700" },
          { label: "总利润", value: totals.total_profit, color: "text-blue-600" },
          { label: "总快递费", value: totals.total_shipping, color: "text-orange-500" },
          { label: "总抽点", value: totals.total_platform_fee, color: "text-red-500" },
          { label: "净利润", value: totals.total_net_profit, color: "text-purple-600" },
        ].map((item) => (
          <div key={item.label} className="bg-white rounded-lg border-[2px] border-gray-300 p-2 lg:p-3 text-center">
            <p className="text-[10px] lg:text-xs text-gray-500 font-bold">{item.label}</p>
            <p className={`text-sm lg:text-lg font-extrabold ${item.color}`}>¥{fmt(item.value)}</p>
          </div>
        ))}
      </div>

      {/* 平台抽点表格 */}
      <div className="bg-white rounded-xl border-[3px] border-gray-900 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] overflow-hidden">
        <div className="overflow-x-auto max-h-[60vh]">
          <table className="w-full text-sm whitespace-nowrap">
            <thead className="sticky top-0 z-10 bg-gray-900 text-white">
              <tr>
                <th className="px-3 py-2 text-left font-extrabold">下单日期</th>
                <th className="px-3 py-2 text-center font-extrabold">售出件数</th>
                <th className="px-3 py-2 text-right font-extrabold">当日营业额</th>
                <th className="px-3 py-2 text-right font-extrabold">进货成本</th>
                <th className="px-3 py-2 text-right font-extrabold">当日利润</th>
                <th className="px-3 py-2 text-right font-extrabold">快递费</th>
                <th className="px-3 py-2 text-right font-extrabold">平台抽点</th>
                <th className="px-3 py-2 text-right font-extrabold">净利润</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-gray-400 font-bold">加载中...</td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-gray-400 font-bold">暂无数据</td>
                </tr>
              ) : (
                records.map((r, i) => (
                  <tr key={r.date} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    <td className="px-3 py-2 text-xs font-bold text-gray-900">{r.date}</td>
                    <td className="px-3 py-2 text-center text-xs font-bold">{r.total_qty}件</td>
                    <td className="px-3 py-2 text-right text-xs font-bold text-green-600">¥{r.total_revenue.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right text-xs text-gray-500">¥{r.total_cost.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right text-xs font-bold text-blue-600">¥{r.total_profit.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right text-xs text-orange-500">¥{r.shipping_fee.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right text-xs font-bold text-red-500">¥{r.platform_fee.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right text-xs font-extrabold text-purple-600">¥{r.net_profit.toFixed(2)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </PageWrapper>
  );
}