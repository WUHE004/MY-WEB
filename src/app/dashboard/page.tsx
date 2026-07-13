"use client";

import { useState, useEffect, useMemo } from "react";
import { PageWrapper } from "@/components/page-wrapper";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ComposedChart, Line, PieChart, Pie, Cell, Legend,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts";
import { TrendingUp, Package, ShoppingCart, RotateCcw, DollarSign, Truck, Percent } from "lucide-react";

const COLORS = ["#4A90E2", "#50C878", "#FFC93C", "#FF6B6B", "#9B59B6", "#F39C12", "#1ABC9C", "#E74C3C", "#3498DB", "#2ECC71", "#E67E22", "#8E44AD", "#16A085", "#D35400", "#2980B9", "#27AE60"];
const ALL_SIZES = [80, 90, 95, 100, 105, 110, 120, 130, 140, 150, 160, 170, 180];

interface SalesSummary {
  sale_id: string;
  total_sold: number;
  sell_price_info: Record<string, string>;
  manufacturer: string;
  updated_at: string;
}

interface InboundRecord {
  sale_id: string;
  manufacturer: string;
  cost_price: number;
  total_stock: number;
  inbound_date: string;
}

interface TrendItem {
  date: string;
  amount: number;
  quantity: number;
}

interface ReturnTrendItem {
  date: string;
  total_returned: number;
}

interface ReturnSummary {
  sale_id: string;
  total_returned: number;
  manufacturer: string;
}

interface DailyProfit {
  date: string;
  amount: number;
  quantity: number;
  profit: number;
  shipping_fee: number;
}

interface SizeByDateItem {
  date: string;
  [sizeKey: string]: number | string;
}

interface MfrSizeStockItem {
  manufacturer: string;
  total: number;
  [sizeKey: string]: number | string;
}

export default function DashboardPage() {
  const [salesData, setSalesData] = useState<SalesSummary[]>([]);
  const [products, setProducts] = useState<InboundRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [trendMode, setTrendMode] = useState<"day" | "month">("day");
  const [trendData, setTrendData] = useState<TrendItem[]>([]);
  const [returnTrendData, setReturnTrendData] = useState<ReturnTrendItem[]>([]);
  const [returnData, setReturnData] = useState<ReturnSummary[]>([]);
  const [dailyStats, setDailyStats] = useState<DailyProfit[]>([]);
  const [mfrMode, setMfrMode] = useState<"sales" | "returns">("sales");
  // 新增数据
  const [salesSizeByDate, setSalesSizeByDate] = useState<SizeByDateItem[]>([]);
  const [mfrSizeStock, setMfrSizeStock] = useState<MfrSizeStockItem[]>([]);
  // 尺码柱状图模式
  const [sizeChartMode, setSizeChartMode] = useState<"day" | "month">("day");
  // 业绩/盈利/售卖框的模式（日度/月度）
  const [perfMode, setPerfMode] = useState<"day" | "month">("day");

  // 下拉选择状态
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedMfrCost, setSelectedMfrCost] = useState<string>("全部");
  const [selectedMfrValue, setSelectedMfrValue] = useState<string>("全部");
  // 退货率/快递费月份筛选
  const [selectedReturnMonth, setSelectedReturnMonth] = useState<string>("");
  const [selectedShippingMonth, setSelectedShippingMonth] = useState<string>("");
  // 业绩/盈利/售卖框的月份选择（月度模式时）
  const [selectedPerfMonth, setSelectedPerfMonth] = useState<string>("");

  useEffect(() => {
    async function loadData() {
      try {
        const [salesRes, prodsRes, trendRes, returnsRes, dailyRes, sizeByDateRes, mfrSizeRes] = await Promise.all([
          fetch("/api/sales-summary").then(r => r.json()).catch(() => []),
          fetch("/api/inbound-records").then(r => r.json()).catch(() => []),
          fetch("/api/sales-trend").then(r => r.json()).catch(() => []),
          fetch("/api/returns-summary").then(r => r.json()).catch(() => []),
          fetch("/api/daily-profit").then(r => r.json()).catch(() => {}),
          fetch("/api/sales-size-by-date").then(r => r.json()).catch(() => []),
          fetch("/api/manufacturer-size-stock").then(r => r.json()).catch(() => []),
        ]);
        if (Array.isArray(salesRes)) setSalesData(salesRes);
        if (Array.isArray(prodsRes)) setProducts(prodsRes);
        // sales-trend 返回 { salesTrend, returnsTrend }
        const trendArr = Array.isArray(trendRes)
          ? trendRes
          : Array.isArray(trendRes?.salesTrend)
            ? trendRes.salesTrend.map((r: any) => ({
                date: r.date,
                amount: Number(r.total_amount) || 0,
                quantity: Number(r.total_quantity) || 0,
              }))
            : [];
        if (trendArr.length > 0) setTrendData(trendArr);
        // 退货趋势数据
        const retTrendArr = Array.isArray(trendRes?.returnsTrend)
          ? trendRes.returnsTrend.map((r: any) => ({
              date: r.date,
              total_returned: Number(r.total_returned) || 0,
            }))
          : [];
        if (retTrendArr.length > 0) setReturnTrendData(retTrendArr);
        if (Array.isArray(returnsRes)) setReturnData(returnsRes);
        // daily-profit 返回 { stats: [...] }
        const dailyArr = Array.isArray(dailyRes)
          ? dailyRes
          : Array.isArray(dailyRes?.stats)
            ? dailyRes.stats.map((r: any) => ({
                date: r.date,
                amount: Number(r.total_amount) || 0,
                quantity: Number(r.total_quantity) || 0,
                profit: Number(r.total_profit) || 0,
                shipping_fee: Number(r.shipping_fee) || 0,
              }))
            : [];
        if (dailyArr.length > 0) {
          setDailyStats(dailyArr);
          setSelectedDate(dailyArr[dailyArr.length - 1].date);
        }
        if (Array.isArray(sizeByDateRes)) setSalesSizeByDate(sizeByDateRes);
        if (Array.isArray(mfrSizeRes)) setMfrSizeStock(mfrSizeRes);
      } catch (e) {
        console.error("Dashboard data load error:", e);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // 售卖金额与售卖数量趋势数据
  const salesTrend = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    if (trendMode === "day") {
      const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
      const dailyMap: Record<string, { date: string; amount: number; quantity: number }> = {};
      for (let d = 1; d <= daysInMonth; d++) {
        const key = `${currentYear}-${String(currentMonth).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        dailyMap[key] = { date: key, amount: 0, quantity: 0 };
      }
      for (const t of trendData) {
        const date = t.date.slice(0, 10);
        if (!dailyMap[date]) continue;
        dailyMap[date].amount += t.amount || 0;
        dailyMap[date].quantity += t.quantity || 0;
      }
      return Object.values(dailyMap)
        .filter(d => d.quantity > 0)
        .sort((a, b) => a.date.localeCompare(b.date));
    } else {
      const monthlyMap: Record<string, { date: string; amount: number; quantity: number }> = {};
      for (let m = 1; m <= 12; m++) {
        const key = `${currentYear}-${String(m).padStart(2, "0")}`;
        monthlyMap[key] = { date: key, amount: 0, quantity: 0 };
      }
      for (const t of trendData) {
        const month = t.date.slice(0, 7);
        if (!monthlyMap[month]) continue;
        monthlyMap[month].amount += t.amount || 0;
        monthlyMap[month].quantity += t.quantity || 0;
      }
      return Object.values(monthlyMap)
        .filter(d => d.quantity > 0)
        .sort((a, b) => a.date.localeCompare(b.date));
    }
  }, [trendData, trendMode]);

  // 厂家进货情况饼状图
  const mfrPie = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of products) {
      const mfr = p.manufacturer || "未知";
      map[mfr] = (map[mfr] || 0) + (p.total_stock || 0);
    }
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 15);
  }, [products]);

  // 厂家剩余库存柱状图
  const mfrBar = useMemo(() => {
    const soldMap: Record<string, number> = {};
    for (const s of salesData) {
      soldMap[s.sale_id] = (soldMap[s.sale_id] || 0) + (s.total_sold || 0);
    }
    const returnMap: Record<string, number> = {};
    for (const r of returnData) {
      returnMap[r.sale_id] = (returnMap[r.sale_id] || 0) + (r.total_returned || 0);
    }
    const map: Record<string, number> = {};
    for (const p of products) {
      const mfr = p.manufacturer || "未知";
      const remaining = (p.total_stock || 0) - (soldMap[p.sale_id] || 0) + (returnMap[p.sale_id] || 0);
      map[mfr] = (map[mfr] || 0) + remaining;
    }
    return Object.entries(map)
      .map(([name, value]) => ({ name, value: Math.round(value) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [products, salesData, returnData]);

  // sale_id -> manufacturer 映射
  const saleIdToMfr = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of products) {
      if (p.sale_id && p.manufacturer) {
        map[String(p.sale_id).toUpperCase()] = p.manufacturer;
      }
    }
    return map;
  }, [products]);

  // 各厂家售卖数量
  const mfrSalesBar = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of salesData) {
      const sid = String(s.sale_id || "").toUpperCase();
      const mfr = s.manufacturer || saleIdToMfr[sid] || "未知";
      map[mfr] = (map[mfr] || 0) + (s.total_sold || 0);
    }
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value).slice(0, 10);
  }, [salesData, saleIdToMfr]);

  // 各厂家退货数量
  const mfrReturnsBar = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of returnData) {
      const sid = String(r.sale_id || "").toUpperCase();
      const mfr = r.manufacturer || saleIdToMfr[sid] || "未知";
      map[mfr] = (map[mfr] || 0) + (r.total_returned || 0);
    }
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value).slice(0, 10);
  }, [returnData, saleIdToMfr]);

  const currentMfrBar = mfrMode === "sales" ? mfrSalesBar : mfrReturnsBar;

  // 厂家列表
  const manufacturers = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) {
      if (p.manufacturer) set.add(p.manufacturer);
    }
    return Array.from(set).sort();
  }, [products]);

  // 可用月份列表
  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    for (const t of trendData) {
      set.add(t.date.slice(0, 7));
    }
    return Array.from(set).sort().reverse();
  }, [trendData]);

  // 可用日期列表
  const availableDates = useMemo(() => {
    return dailyStats.map(d => d.date).sort().reverse();
  }, [dailyStats]);

  // 各月售卖件数
  const monthlySales = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of trendData) {
      const month = t.date.slice(0, 7);
      map[month] = (map[month] || 0) + (t.quantity || 0);
    }
    return map;
  }, [trendData]);

  // 当月售卖件数（总售出卡片）
  const selectedMonthSales = useMemo(() => {
    if (!selectedMonth) return salesData.reduce((s, i) => s + (i.total_sold || 0), 0);
    return monthlySales[selectedMonth] || 0;
  }, [selectedMonth, monthlySales, salesData]);

  // ===== 业绩/盈利/售卖框（日度/月度切换）=====
  // 可用月份列表（从 dailyStats 聚合）
  const availablePerfMonths = useMemo(() => {
    const map: Record<string, { amount: number; quantity: number; profit: number }> = {};
    for (const d of dailyStats) {
      const m = d.date.slice(0, 7);
      if (!map[m]) map[m] = { amount: 0, quantity: 0, profit: 0 };
      map[m].amount += d.amount || 0;
      map[m].quantity += d.quantity || 0;
      map[m].profit += d.profit || 0;
    }
    return Object.entries(map)
      .map(([month, v]) => ({ month, ...v }))
      .sort((a, b) => b.month.localeCompare(a.month));
  }, [dailyStats]);

  // 业绩
  const performance = useMemo(() => {
    if (perfMode === "day") {
      if (!selectedDate) return 0;
      const found = dailyStats.find(d => d.date === selectedDate);
      return found ? found.amount : 0;
    } else {
      if (!selectedPerfMonth) {
        return dailyStats.reduce((s, d) => s + (d.amount || 0), 0);
      }
      const found = availablePerfMonths.find(m => m.month === selectedPerfMonth);
      return found ? found.amount : 0;
    }
  }, [dailyStats, selectedDate, perfMode, selectedPerfMonth, availablePerfMonths]);

  // 盈利
  const dailyProfit = useMemo(() => {
    if (perfMode === "day") {
      if (!selectedDate) return 0;
      const found = dailyStats.find(d => d.date === selectedDate);
      return found ? found.profit : 0;
    } else {
      if (!selectedPerfMonth) {
        return dailyStats.reduce((s, d) => s + (d.profit || 0), 0);
      }
      const found = availablePerfMonths.find(m => m.month === selectedPerfMonth);
      return found ? found.profit : 0;
    }
  }, [dailyStats, selectedDate, perfMode, selectedPerfMonth, availablePerfMonths]);

  // 售卖件数（与业绩/盈利同步）
  const soldQuantity = useMemo(() => {
    if (perfMode === "day") {
      if (!selectedDate) return 0;
      const found = dailyStats.find(d => d.date === selectedDate);
      return found ? found.quantity : 0;
    } else {
      if (!selectedPerfMonth) {
        return dailyStats.reduce((s, d) => s + (d.quantity || 0), 0);
      }
      const found = availablePerfMonths.find(m => m.month === selectedPerfMonth);
      return found ? found.quantity : 0;
    }
  }, [dailyStats, selectedDate, perfMode, selectedPerfMonth, availablePerfMonths]);

  // ===== 退货率 =====
  // 各月退货数
  const monthlyReturns = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of returnTrendData) {
      const month = r.date.slice(0, 7);
      map[month] = (map[month] || 0) + (r.total_returned || 0);
    }
    return map;
  }, [returnTrendData]);

  // 总退货率/月度退货率
  const returnRate = useMemo(() => {
    const totalReturns = returnTrendData.reduce((s, r) => s + (r.total_returned || 0), 0);
    const totalSold = trendData.reduce((s, t) => s + (t.quantity || 0), 0);
    if (!selectedReturnMonth) {
      return totalSold > 0 ? (totalReturns / totalSold) * 100 : 0;
    }
    const monthReturns = monthlyReturns[selectedReturnMonth] || 0;
    const monthSold = monthlySales[selectedReturnMonth] || 0;
    return monthSold > 0 ? (monthReturns / monthSold) * 100 : 0;
  }, [returnTrendData, trendData, selectedReturnMonth, monthlyReturns, monthlySales]);

  // ===== 快递费 =====
  const totalShippingFee = useMemo(() => {
    if (!selectedShippingMonth) {
      return dailyStats.reduce((s, d) => s + (d.shipping_fee || 0), 0);
    }
    return dailyStats
      .filter(d => d.date.slice(0, 7) === selectedShippingMonth)
      .reduce((s, d) => s + (d.shipping_fee || 0), 0);
  }, [dailyStats, selectedShippingMonth]);

  // ===== 售卖尺码柱状图数据 =====
  const sizeChartData = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    if (sizeChartMode === "day") {
      // 默认选中最新日期
      const targetDate = selectedDate || (dailyStats.length > 0 ? dailyStats[dailyStats.length - 1].date : "");
      if (!targetDate) return [];
      const found = salesSizeByDate.find(s => s.date === targetDate);
      if (!found) return [];
      return ALL_SIZES.map(sz => ({
        size: `${sz}`,
        quantity: Number(found[`size_${sz}`]) || 0,
      })).filter(d => d.quantity > 0);
    } else {
      // 月度：默认当前月
      const targetMonth = selectedPerfMonth || `${currentYear}-${String(currentMonth).padStart(2, "0")}`;
      const monthData: Record<string, number> = {};
      for (const sz of ALL_SIZES) monthData[`${sz}`] = 0;
      for (const item of salesSizeByDate) {
        if (item.date.slice(0, 7) === targetMonth) {
          for (const sz of ALL_SIZES) {
            monthData[`${sz}`] += Number(item[`size_${sz}`]) || 0;
          }
        }
      }
      return ALL_SIZES.map(sz => ({
        size: `${sz}`,
        quantity: monthData[`${sz}`],
      })).filter(d => d.quantity > 0);
    }
  }, [salesSizeByDate, sizeChartMode, selectedDate, selectedPerfMonth, dailyStats]);

  // ===== 厂家尺码剩余雷达图数据 =====
  const radarData = useMemo(() => {
    // 类别轴为各尺码，每个厂家一条雷达线
    // 取剩余量前5的厂家避免过于拥挤
    const topMfrs = mfrSizeStock.slice(0, 5);
    if (topMfrs.length === 0) return { data: [], mfrs: [] };
    const mfrNames = topMfrs.map(m => String(m.manufacturer));
    const data = ALL_SIZES.map(sz => {
      const row: Record<string, number | string> = { size: `${sz}` };
      for (const m of topMfrs) {
        row[String(m.manufacturer)] = Number(m[`size_${sz}`]) || 0;
      }
      return row;
    });
    return { data, mfrs: mfrNames };
  }, [mfrSizeStock]);

  // 进货总花费
  const inboundCost = useMemo(() => {
    const filtered = selectedMfrCost === "全部"
      ? products
      : products.filter(p => p.manufacturer === selectedMfrCost);
    return filtered.reduce((s, p) => s + (p.total_stock || 0) * (p.cost_price || 0), 0);
  }, [products, selectedMfrCost]);

  // 库存剩余价值
  const remainingValue = useMemo(() => {
    const soldMap: Record<string, number> = {};
    for (const s of salesData) {
      soldMap[s.sale_id] = (soldMap[s.sale_id] || 0) + (s.total_sold || 0);
    }
    const returnMap: Record<string, number> = {};
    for (const r of returnData) {
      returnMap[r.sale_id] = (returnMap[r.sale_id] || 0) + (r.total_returned || 0);
    }
    const filtered = selectedMfrValue === "全部"
      ? products
      : products.filter(p => p.manufacturer === selectedMfrValue);
    return filtered.reduce((s, p) => {
      const remaining = (p.total_stock || 0) - (soldMap[p.sale_id] || 0) + (returnMap[p.sale_id] || 0);
      return s + remaining * (p.cost_price || 0);
    }, 0);
  }, [products, salesData, returnData, selectedMfrValue]);

  if (loading) {
    return (
      <PageWrapper>
        <div className="space-y-4">
          <div className="h-8 w-32 bg-gray-200 rounded-lg animate-pulse" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1,2,3,4].map(i => <div key={i} className="h-24 bg-gray-200 rounded-xl animate-pulse" />)}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="h-72 bg-gray-200 rounded-xl animate-pulse" />
            <div className="h-72 bg-gray-200 rounded-xl animate-pulse" />
          </div>
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-gray-900 mb-6">
        <span className="highlight-blue">数据仪表盘</span>
      </h1>

      {/* 统计卡片 - 第一行 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        {/* 总售出 - 带月份下拉 */}
        <StatCard
          icon={<ShoppingCart className="h-5 w-5" />}
          label="总售出"
          value={`${selectedMonthSales} 件`}
          color="bg-green-500"
          extra={
            <select
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              className="mt-1 w-full text-[10px] sm:text-xs border-[2px] border-gray-900 rounded-lg px-1 py-0.5 bg-white font-bold text-gray-700 truncate"
            >
              <option value="">全部累计</option>
              {availableMonths.map(m => (
                <option key={m} value={m}>{m}（{monthlySales[m] || 0}件）</option>
              ))}
            </select>
          }
        />

        {/* 业绩 - 带日度/月度切换 */}
        <StatCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="业绩"
          value={`¥${performance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          color="bg-blue-500"
          extra={
            <div className="flex flex-col gap-1 mt-1">
              <div className="flex gap-1 justify-end">
                <button
                  onClick={() => setPerfMode("day")}
                  className={`px-2 py-0.5 rounded-md border-[2px] border-gray-900 text-[10px] font-extrabold transition-all ${perfMode === "day" ? "bg-gray-900 text-white" : "bg-white text-gray-600"}`}
                >日度</button>
                <button
                  onClick={() => setPerfMode("month")}
                  className={`px-2 py-0.5 rounded-md border-[2px] border-gray-900 text-[10px] font-extrabold transition-all ${perfMode === "month" ? "bg-gray-900 text-white" : "bg-white text-gray-600"}`}
                >月度</button>
              </div>
              <select
                value={perfMode === "day" ? selectedDate : selectedPerfMonth}
                onChange={e => {
                  if (perfMode === "day") setSelectedDate(e.target.value);
                  else setSelectedPerfMonth(e.target.value);
                }}
                className="w-full text-[10px] sm:text-xs border-[2px] border-gray-900 rounded-lg px-1 py-0.5 bg-white font-bold text-gray-700 truncate"
              >
                {perfMode === "day" ? (
                  availableDates.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))
                ) : (
                  <>
                    <option value="">全部累计</option>
                    {availablePerfMonths.map(m => (
                      <option key={m.month} value={m.month}>{m.month}（¥{m.amount.toFixed(0)}）</option>
                    ))}
                  </>
                )}
              </select>
            </div>
          }
        />

        {/* 盈利 - 与业绩同步 */}
        <StatCard
          icon={<DollarSign className="h-5 w-5" />}
          label="盈利"
          value={`¥${dailyProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          color="bg-yellow-500"
          extra={
            <div className="flex flex-col gap-1 mt-1">
              <div className="flex gap-1 justify-end">
                <button
                  onClick={() => setPerfMode("day")}
                  className={`px-2 py-0.5 rounded-md border-[2px] border-gray-900 text-[10px] font-extrabold transition-all ${perfMode === "day" ? "bg-gray-900 text-white" : "bg-white text-gray-600"}`}
                >日度</button>
                <button
                  onClick={() => setPerfMode("month")}
                  className={`px-2 py-0.5 rounded-md border-[2px] border-gray-900 text-[10px] font-extrabold transition-all ${perfMode === "month" ? "bg-gray-900 text-white" : "bg-white text-gray-600"}`}
                >月度</button>
              </div>
              <p className="text-[10px] text-gray-500 font-bold truncate">
                {perfMode === "day" ? selectedDate || "请选择日期" : selectedPerfMonth || "全部累计"}
              </p>
            </div>
          }
        />

        {/* 售卖 - 与业绩/盈利同步 */}
        <StatCard
          icon={<ShoppingCart className="h-5 w-5" />}
          label="售卖"
          value={`${soldQuantity} 件`}
          color="bg-teal-500"
          extra={
            <div className="flex flex-col gap-1 mt-1">
              <div className="flex gap-1 justify-end">
                <button
                  onClick={() => setPerfMode("day")}
                  className={`px-2 py-0.5 rounded-md border-[2px] border-gray-900 text-[10px] font-extrabold transition-all ${perfMode === "day" ? "bg-gray-900 text-white" : "bg-white text-gray-600"}`}
                >日度</button>
                <button
                  onClick={() => setPerfMode("month")}
                  className={`px-2 py-0.5 rounded-md border-[2px] border-gray-900 text-[10px] font-extrabold transition-all ${perfMode === "month" ? "bg-gray-900 text-white" : "bg-white text-gray-600"}`}
                >月度</button>
              </div>
              <p className="text-[10px] text-gray-500 font-bold truncate">
                {perfMode === "day" ? selectedDate || "请选择日期" : selectedPerfMonth || "全部累计"}
              </p>
            </div>
          }
        />
      </div>

      {/* 统计卡片 - 第二行 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        {/* 退货率 */}
        <StatCard
          icon={<Percent className="h-5 w-5" />}
          label="退货率"
          value={`${returnRate.toFixed(2)}%`}
          color="bg-rose-500"
          extra={
            <select
              value={selectedReturnMonth}
              onChange={e => setSelectedReturnMonth(e.target.value)}
              className="mt-1 w-full text-[10px] sm:text-xs border-[2px] border-gray-900 rounded-lg px-1 py-0.5 bg-white font-bold text-gray-700 truncate"
            >
              <option value="">全部累计</option>
              {availableMonths.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          }
        />

        {/* 快递费 */}
        <StatCard
          icon={<Truck className="h-5 w-5" />}
          label="快递费"
          value={`¥${totalShippingFee.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          color="bg-indigo-500"
          extra={
            <select
              value={selectedShippingMonth}
              onChange={e => setSelectedShippingMonth(e.target.value)}
              className="mt-1 w-full text-[10px] sm:text-xs border-[2px] border-gray-900 rounded-lg px-1 py-0.5 bg-white font-bold text-gray-700 truncate"
            >
              <option value="">全部累计</option>
              {availableMonths.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          }
        />

        {/* 进货总花费 */}
        <StatCard
          icon={<Package className="h-5 w-5" />}
          label="进货总花费"
          value={`¥${inboundCost.toLocaleString()}`}
          color="bg-red-500"
          extra={
            <select
              value={selectedMfrCost}
              onChange={e => setSelectedMfrCost(e.target.value)}
              className="mt-1 w-full text-[10px] sm:text-xs border-[2px] border-gray-900 rounded-lg px-1 py-0.5 bg-white font-bold text-gray-700 truncate"
            >
              <option value="全部">全部厂家</option>
              {manufacturers.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          }
        />

        {/* 库存剩余价值 */}
        <StatCard
          icon={<RotateCcw className="h-5 w-5" />}
          label="库存剩余价值"
          value={`¥${remainingValue.toLocaleString()}`}
          color="bg-purple-500"
          extra={
            <select
              value={selectedMfrValue}
              onChange={e => setSelectedMfrValue(e.target.value)}
              className="mt-1 w-full text-[10px] sm:text-xs border-[2px] border-gray-900 rounded-lg px-1 py-0.5 bg-white font-bold text-gray-700 truncate"
            >
              <option value="全部">全部厂家</option>
              {manufacturers.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          }
        />
      </div>

      {/* 图表区 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* 售卖尺码柱状图 */}
        <ChartCard
          title="售卖尺码分布"
          extra={
            <div className="flex gap-1">
              <button
                onClick={() => setSizeChartMode("day")}
                className={`px-3 py-1 rounded-lg border-[2px] border-gray-900 text-xs font-extrabold transition-all ${sizeChartMode === "day" ? "bg-gray-900 text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,0.3)]" : "bg-white text-gray-600 hover:bg-gray-100"}`}
              >日度</button>
              <button
                onClick={() => setSizeChartMode("month")}
                className={`px-3 py-1 rounded-lg border-[2px] border-gray-900 text-xs font-extrabold transition-all ${sizeChartMode === "month" ? "bg-gray-900 text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,0.3)]" : "bg-white text-gray-600 hover:bg-gray-100"}`}
              >月度</button>
            </div>
          }
        >
          {sizeChartData.length === 0 ? (
            <div className="flex items-center justify-center h-[300px] text-gray-400 text-sm font-bold">
              {sizeChartMode === "day" ? "该日期无售卖数据" : "该月份无售卖数据"}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={sizeChartData} margin={{ left: 0, right: 20, top: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="size" tick={{ fontSize: 11 }} label={{ value: "尺码", position: "insideBottom", offset: -2, style: { fontSize: 10 } }} />
                <YAxis tick={{ fontSize: 11 }} width={35} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "white",
                    border: "3px solid #171717",
                    borderRadius: "12px",
                    boxShadow: "4px 4px 0px 0px rgba(0,0,0,1)",
                    fontSize: "12px",
                    fontWeight: "bold",
                  }}
                  formatter={(value: any) => `${Number(value).toLocaleString()} 件`}
                />
                <Bar dataKey="quantity" name="售出数量" fill="#9B59B6" radius={[4, 4, 0, 0]} barSize={30}>
                  <animate attributeName="opacity" values="0;1" dur="0.5s" fill="freeze" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* 售卖趋势柱状图+折线图 */}
        <ChartCard
          title="售卖金额 & 数量趋势"
          extra={
            <div className="flex gap-1">
              <button
                onClick={() => setTrendMode("day")}
                className={`px-3 py-1 rounded-lg border-[2px] border-gray-900 text-xs font-extrabold transition-all ${trendMode === "day" ? "bg-gray-900 text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,0.3)]" : "bg-white text-gray-600 hover:bg-gray-100"}`}
              >日度</button>
              <button
                onClick={() => setTrendMode("month")}
                className={`px-3 py-1 rounded-lg border-[2px] border-gray-900 text-xs font-extrabold transition-all ${trendMode === "month" ? "bg-gray-900 text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,0.3)]" : "bg-white text-gray-600 hover:bg-gray-100"}`}
              >月度</button>
            </div>
          }
        >
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={salesTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={v => trendMode === "day" ? v.slice(8) : v.slice(5)} />
              <YAxis yAxisId="left" tick={{ fontSize: 10 }} width={35} label={{ value: "数量", angle: -90, position: "insideLeft", style: { fontSize: 10 }, offset: 0 }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} width={45} tickFormatter={v => `¥${Number(v).toFixed(0)}`} label={{ value: "金额", angle: 90, position: "insideRight", style: { fontSize: 10 }, offset: 0 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "white",
                  border: "3px solid #171717",
                  borderRadius: "12px",
                  boxShadow: "4px 4px 0px 0px rgba(0,0,0,1)",
                  fontSize: "12px",
                  fontWeight: "bold",
                }}
                formatter={(v: any, n: any) => String(n).includes("金额") ? `¥${Number(v).toFixed(2)}` : v}
              />
              <Legend wrapperStyle={{ fontSize: "12px", fontWeight: "bold", paddingTop: "10px" }} />
              <Bar yAxisId="left" dataKey="quantity" name="数量(件)" fill="#50C878" radius={[4, 4, 0, 0]} barSize={trendMode === "day" ? 16 : 24} />
              <Line yAxisId="right" type="monotone" dataKey="amount" name="金额(¥)" stroke="#4A90E2" strokeWidth={3} dot={{ r: 5, fill: "#4A90E2", strokeWidth: 2, stroke: "#fff" }} activeDot={{ r: 8 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* 厂家进货件数饼状图 */}
        <ChartCard title="厂家进货件数">
          {mfrPie.length === 0 ? (
            <div className="flex items-center justify-center h-[300px] text-gray-400 text-sm font-bold">暂无数据</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={mfrPie}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  innerRadius={50}
                  paddingAngle={2}
                  label={({ name, percent }) => percent != null && percent > 0.03 ? `${(percent * 100).toFixed(0)}%` : ""}
                  labelLine={{ strokeWidth: 1 }}
                >
                  {mfrPie.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="#fff" strokeWidth={2} />)}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "white",
                    border: "3px solid #171717",
                    borderRadius: "12px",
                    boxShadow: "4px 4px 0px 0px rgba(0,0,0,1)",
                    fontSize: "12px",
                    fontWeight: "bold",
                  }}
                  formatter={(value: any) => [`${Number(value).toLocaleString()} 件`, "进货数量"]}
                />
                <Legend
                  layout="horizontal"
                  align="center"
                  verticalAlign="bottom"
                  wrapperStyle={{ fontSize: "11px", fontWeight: "bold", maxWidth: "100%", overflowX: "auto", whiteSpace: "nowrap", paddingTop: "8px" }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* 厂家剩余库存柱状图 */}
        <ChartCard title="厂家剩余库存">
          {mfrBar.length === 0 ? (
            <div className="flex items-center justify-center h-[300px] text-gray-400 text-sm font-bold">暂无数据</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={mfrBar} layout="vertical" margin={{ left: 0, right: 20, top: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={65} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "white",
                    border: "3px solid #171717",
                    borderRadius: "12px",
                    boxShadow: "4px 4px 0px 0px rgba(0,0,0,1)",
                    fontSize: "12px",
                    fontWeight: "bold",
                  }}
                  formatter={(value: any) => `${Number(value).toLocaleString()} 件`}
                />
                <Bar dataKey="value" name="剩余库存" fill="#4A90E2" radius={[0, 4, 4, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* 各厂家售卖/退货数量 */}
        <ChartCard
          title={mfrMode === "sales" ? "各厂家售卖数量" : "各厂家退货数量"}
          extra={
            <div className="flex gap-1">
              <button
                onClick={() => setMfrMode("sales")}
                className={`px-3 py-1 rounded-lg border-[2px] border-gray-900 text-xs font-extrabold transition-all ${mfrMode === "sales" ? "bg-gray-900 text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,0.3)]" : "bg-white text-gray-600 hover:bg-gray-100"}`}
              >售出</button>
              <button
                onClick={() => setMfrMode("returns")}
                className={`px-3 py-1 rounded-lg border-[2px] border-gray-900 text-xs font-extrabold transition-all ${mfrMode === "returns" ? "bg-gray-900 text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,0.3)]" : "bg-white text-gray-600 hover:bg-gray-100"}`}
              >退货</button>
            </div>
          }
        >
          {currentMfrBar.length === 0 ? (
            <div className="flex items-center justify-center h-[300px] text-gray-400 text-sm font-bold">暂无数据</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={currentMfrBar} margin={{ left: 0, right: 20, top: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 11 }} width={35} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "white",
                    border: "3px solid #171717",
                    borderRadius: "12px",
                    boxShadow: "4px 4px 0px 0px rgba(0,0,0,1)",
                    fontSize: "12px",
                    fontWeight: "bold",
                  }}
                  formatter={(value: any) => `${Number(value).toLocaleString()} 件`}
                />
                <Bar dataKey="value" name={mfrMode === "sales" ? "售出(件)" : "退货(件)"} fill={mfrMode === "sales" ? "#50C878" : "#FF6B6B"} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* 厂家尺码剩余雷达图 */}
        <ChartCard title="厂家尺码剩余分布（雷达图）">
          {radarData.data.length === 0 || radarData.mfrs.length === 0 ? (
            <div className="flex items-center justify-center h-[300px] text-gray-400 text-sm font-bold">暂无数据</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <RadarChart data={radarData.data} margin={{ top: 10, right: 30, left: 30, bottom: 10 }}>
                <PolarGrid stroke="#e0e0e0" />
                <PolarAngleAxis dataKey="size" tick={{ fontSize: 11, fontWeight: "bold" }} />
                <PolarRadiusAxis tick={{ fontSize: 9 }} />
                {radarData.mfrs.map((mfr, i) => (
                  <Radar
                    key={mfr}
                    name={mfr}
                    dataKey={mfr}
                    stroke={COLORS[i % COLORS.length]}
                    fill={COLORS[i % COLORS.length]}
                    fillOpacity={0.15}
                    strokeWidth={2}
                  />
                ))}
                <Tooltip
                  contentStyle={{
                    backgroundColor: "white",
                    border: "3px solid #171717",
                    borderRadius: "12px",
                    boxShadow: "4px 4px 0px 0px rgba(0,0,0,1)",
                    fontSize: "12px",
                    fontWeight: "bold",
                  }}
                  formatter={(value: any) => `${Number(value).toLocaleString()} 件`}
                />
                <Legend
                  layout="horizontal"
                  align="center"
                  verticalAlign="bottom"
                  wrapperStyle={{ fontSize: "10px", fontWeight: "bold", paddingTop: "8px" }}
                />
              </RadarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>
    </PageWrapper>
  );
}

function StatCard({ icon, label, value, color, extra }: { icon: React.ReactNode; label: string; value: string; color: string; extra?: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border-[3px] border-gray-900 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] p-3 sm:p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className={`${color} text-white p-1.5 rounded-lg`}>{icon}</div>
        <span className="text-xs sm:text-sm text-gray-500 font-bold">{label}</span>
      </div>
      <p className="text-lg sm:text-2xl font-extrabold text-gray-900">{value}</p>
      {extra && <div className="mt-2">{extra}</div>}
    </div>
  );
}

function ChartCard({ title, children, extra }: { title: string; children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border-[3px] border-gray-900 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] p-3 sm:p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm sm:text-base font-extrabold text-gray-900">{title}</h3>
        {extra}
      </div>
      {children}
    </div>
  );
}
