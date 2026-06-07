"use client";

import { useState, useEffect, useMemo } from "react";
import { ArrowLeft, RefreshCw, Save } from "lucide-react";
import Link from "next/link";
import { PageWrapper } from "@/components/page-wrapper";

interface ShippingRecord {
  tracking_number: string;
  total_qty: number;
  order_time: string;
  shipping_fee: number;
  weight_kg: number;
}

export default function ShippingPage() {
  const [rate1, setRate1] = useState("");
  const [rate2, setRate2] = useState("");
  const [rate3, setRate3] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [dates, setDates] = useState<string[]>([]);
  const [records, setRecords] = useState<ShippingRecord[]>([]);
  const [totalFee, setTotalFee] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  // 加载快递费率
  useEffect(() => {
    fetch("/api/shipping-rates")
      .then((r) => r.json())
      .then((data) => {
        if (!data.error) {
          setRate1(String(data.rate1 || ""));
          setRate2(String(data.rate2 || ""));
          setRate3(String(data.rate3 || ""));
        }
      })
      .catch(() => {});
  }, []);

  // 加载可选日期
  useEffect(() => {
    fetch("/api/sales-dates?type=shipping")
      .then((r) => r.json())
      .then((data) => {
        if (data.dates) setDates(data.dates);
      })
      .catch(() => {});
  }, []);

  // 计算快递费
  const fetchShipping = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateFilter) params.set("date", dateFilter);
      params.set("rate1", rate1 || "0");
      params.set("rate2", rate2 || "0");
      params.set("rate3", rate3 || "0");

      const res = await fetch(`/api/shipping?${params}`);
      const data = await res.json();
      if (!data.error) {
        setRecords(data.records || []);
        setTotalFee(data.total_fee || 0);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  // 初始加载
  useEffect(() => {
    if (rate1 !== "" || rate2 !== "" || rate3 !== "") {
      fetchShipping();
    }
  }, [rate1, rate2, rate3]);

  // 保存费率
  const saveRates = async () => {
    setSaving(true);
    setSaveMsg("");
    try {
      const res = await fetch("/api/shipping-rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rate1: Number(rate1) || 0, rate2: Number(rate2) || 0, rate3: Number(rate3) || 0 }),
      });
      const data = await res.json();
      if (data.error) {
        setSaveMsg("保存失败: " + data.error);
      } else {
        setSaveMsg("保存成功");
        fetchShipping();
      }
    } catch {
      setSaveMsg("保存失败");
    } finally {
      setSaving(false);
    }
  };

  const filteredRecords = useMemo(() => {
    if (!dateFilter) return records;
    return records.filter((r) => r.order_time === dateFilter);
  }, [records, dateFilter]);

  // 总快递费根据筛选日期实时统计
  const filteredTotalFee = useMemo(() => {
    return filteredRecords.reduce((sum, r) => sum + r.shipping_fee, 0);
  }, [filteredRecords]);

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
          <span className="highlight-blue">快递费用</span>
        </h1>
      </div>

      {/* 快递费率设置 */}
      <div className="bg-white rounded-xl border-[3px] border-gray-900 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-4 lg:p-6 mb-6">
        <div className="flex flex-wrap items-center gap-2 lg:gap-3">
          <span className="text-sm lg:text-base font-extrabold text-gray-900">快递费率设置</span>
          <div className="flex items-center gap-1 lg:gap-2">
            <input
              type="number"
              value={rate1}
              onChange={(e) => setRate1(e.target.value)}
              placeholder="一公斤"
              className="w-14 lg:w-20 px-1.5 py-1.5 lg:px-2 lg:py-2 rounded-lg border-[2px] border-gray-900 text-xs lg:text-sm font-bold"
            />
            <input
              type="number"
              value={rate2}
              onChange={(e) => setRate2(e.target.value)}
              placeholder="二公斤"
              className="w-14 lg:w-20 px-1.5 py-1.5 lg:px-2 lg:py-2 rounded-lg border-[2px] border-gray-900 text-xs lg:text-sm font-bold"
            />
            <input
              type="number"
              value={rate3}
              onChange={(e) => setRate3(e.target.value)}
              placeholder="三公斤"
              className="w-14 lg:w-20 px-1.5 py-1.5 lg:px-2 lg:py-2 rounded-lg border-[2px] border-gray-900 text-xs lg:text-sm font-bold"
            />
          </div>
          <button
            onClick={saveRates}
            disabled={saving}
            className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border-[2px] border-green-500 bg-green-500 text-white font-extrabold hover:bg-green-600 transition-all disabled:opacity-50"
          >
            <Save className="h-3 w-3" />{saving ? "保存中..." : "保存"}
          </button>
          <button
            onClick={fetchShipping}
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
          计费规则: 同一面单号下 1-4件=1公斤, 5-7件=2公斤, 8-10件=3公斤
        </p>
      </div>

      {/* 日期筛选和总快递费 */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <select
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          className="text-xs lg:text-sm px-3 py-2 rounded-lg border-[2px] border-gray-900 bg-white text-gray-700 font-extrabold"
        >
          <option value="">全部日期</option>
          {dates.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        <div className="flex-1" />
        <div className="text-xs lg:text-sm font-bold">
          总快递费: <span className="text-lg text-red-500 font-extrabold">¥{filteredTotalFee.toFixed(2)}</span>
        </div>
      </div>

      {/* 快递费表格 */}
      <div className="bg-white rounded-xl border-[3px] border-gray-900 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] overflow-hidden">
        <div className="overflow-x-auto max-h-[60vh]">
          <table className="w-full text-sm whitespace-nowrap">
            <thead className="sticky top-0 z-10 bg-gray-900 text-white">
              <tr>
                <th className="px-3 py-2 text-left font-extrabold">面单号</th>
                <th className="px-3 py-2 text-center font-extrabold">售出数量</th>
                <th className="px-3 py-2 text-center font-extrabold">下单时间</th>
                <th className="px-3 py-2 text-center font-extrabold">重量</th>
                <th className="px-3 py-2 text-right font-extrabold">快递费</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-gray-400 font-bold">加载中...</td>
                </tr>
              ) : filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-gray-400 font-bold">暂无数据</td>
                </tr>
              ) : (
                filteredRecords.map((r, i) => (
                  <tr key={r.tracking_number} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    <td className="px-3 py-2 text-xs font-bold text-gray-900">{r.tracking_number}</td>
                    <td className="px-3 py-2 text-center text-xs font-bold">{r.total_qty}件</td>
                    <td className="px-3 py-2 text-center text-xs text-gray-500">{r.order_time}</td>
                    <td className="px-3 py-2 text-center text-xs font-bold">{r.weight_kg}公斤</td>
                    <td className="px-3 py-2 text-right text-xs font-extrabold text-red-500">¥{r.shipping_fee.toFixed(2)}</td>
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