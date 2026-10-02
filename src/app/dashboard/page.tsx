"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import { PageWrapper } from "@/components/page-wrapper";
import { ErrorState } from "@/components/error-state";
import { CountUp, staggerContainer, staggerItem } from "@/components/motion-primitives";
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
  channel: string;
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
  profit: number; // 已扣当日退货损失(毛利口径)
  shipping_fee: number;
  platform_fee: number;
  channel: string; // douyin=抖音 / duoduo=多多
}

interface SizeByDateItem {
  date: string;
  channel: string; // douyin / duoduo（"全部"视图由前端合并两渠道行）
  top_product: string; // 当日该渠道售出最多的商品编号
  top_qty: number; // 该编号当日售出件数
  [sizeKey: string]: number | string;
}

interface ReturnSizeMonthItem {
  month: string;
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
  // 任一统计接口失败时置 true, 顶部显示错误横幅(避免故障被伪装成 0 值)
  const [dataError, setDataError] = useState(false);
  const [trendMode, setTrendMode] = useState<"day" | "month">("day");
  const [trendData, setTrendData] = useState<TrendItem[]>([]);
  const [returnTrendData, setReturnTrendData] = useState<ReturnTrendItem[]>([]);
  const [returnData, setReturnData] = useState<ReturnSummary[]>([]);
  const [dailyStats, setDailyStats] = useState<DailyProfit[]>([]);
  const [mfrMode, setMfrMode] = useState<"sales" | "returns">("sales");
  // 新增数据
  const [salesSizeByDate, setSalesSizeByDate] = useState<SizeByDateItem[]>([]);
  const [mfrSizeStock, setMfrSizeStock] = useState<MfrSizeStockItem[]>([]);
  // 退货尺码分布(按月汇总)
  const [returnSizeByMonth, setReturnSizeByMonth] = useState<ReturnSizeMonthItem[]>([]);
  const [selectedReturnSizeMonth, setSelectedReturnSizeMonth] = useState<string>("");
  // 抖音直播情况图(日度/月度)
  const [liveMode, setLiveMode] = useState<"day" | "month">("day");
  // 业绩/盈利/售卖框的模式（日度/月度）
  const [perfMode, setPerfMode] = useState<"day" | "month">("day");

  // 下拉选择状态
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedMfrCost, setSelectedMfrCost] = useState<string>("全部");
  const [selectedMfrValue, setSelectedMfrValue] = useState<string>("全部");
  // 退货率月份筛选(仅"全部"视图显示该卡片)
  const [selectedReturnMonth, setSelectedReturnMonth] = useState<string>("");
  // 业绩/盈利/售卖框的月份选择（月度模式时）
  const [selectedPerfMonth, setSelectedPerfMonth] = useState<string>("");
  // 渠道切换: all=全部 / douyin=抖音 / duoduo=多多(面单号"多多+日期"的记录)
  const [channelView, setChannelView] = useState<"all" | "douyin" | "duoduo">("all");

  const loadData = useCallback(async () => {
    setLoading(true);
    setDataError(false);
    let failed = false;
    const safeFetch = async (url: string) => {
      try {
        const r = await fetch(url);
        if (!r.ok) throw new Error(`${url} -> ${r.status}`);
        return await r.json();
      } catch {
        failed = true;
        return null;
      }
    };
    try {
      const [salesRes, prodsRes, trendRes, returnsRes, dailyRes, sizeByDateRes, mfrSizeRes, returnSizeRes] = await Promise.all([
        safeFetch("/api/sales-summary"),
        safeFetch("/api/inbound-records"),
        safeFetch("/api/sales-trend"),
        safeFetch("/api/returns-summary"),
        safeFetch("/api/daily-profit"),
        safeFetch("/api/sales-size-by-date"),
        safeFetch("/api/manufacturer-size-stock"),
        safeFetch("/api/return-size-by-month"),
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
                channel: r.channel || "douyin",
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
        // 过滤未来日期行(退货时区异常产生的"明天"行), 且默认选中最新真实日期
        const todayBJ = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });
        const dailyArr = Array.isArray(dailyRes)
          ? dailyRes
          : Array.isArray(dailyRes?.stats)
            ? dailyRes.stats
                .filter((r: { date: string }) => String(r.date) <= todayBJ)
                .map((r: any) => ({
                    date: r.date,
                    amount: Number(r.total_amount) || 0,
                    quantity: Number(r.total_quantity) || 0,
                    profit: Number(r.total_profit) || 0,
                    shipping_fee: Number(r.shipping_fee) || 0,
                    platform_fee: Number(r.platform_fee) || 0,
                    channel: r.channel || "douyin",
                  }))
            : [];
        if (dailyArr.length > 0) {
          setDailyStats(dailyArr);
          // 默认选中最新一个有实际售卖的日期(纯退货日不作为默认)
          const soldDays = dailyArr.filter((r: { quantity?: number }) => (r.quantity || 0) > 0);
          setSelectedDate(soldDays.length > 0 ? soldDays[soldDays.length - 1].date : dailyArr[dailyArr.length - 1].date);
        }
        if (Array.isArray(sizeByDateRes)) setSalesSizeByDate(sizeByDateRes);
        if (Array.isArray(mfrSizeRes)) setMfrSizeStock(mfrSizeRes);
        if (Array.isArray(returnSizeRes)) {
          setReturnSizeByMonth(returnSizeRes);
          if (returnSizeRes.length > 0) {
            setSelectedReturnSizeMonth(returnSizeRes[returnSizeRes.length - 1].month);
          }
        }
      } catch (e) {
        console.error("Dashboard data load error:", e);
        failed = true;
      } finally {
        setLoading(false);
        if (failed) setDataError(true);
      }
  }, []);
  useEffect(() => {
    loadData();
  }, [loadData]);

  // 售卖金额与售卖数量趋势数据(按渠道切换过滤)
  const salesTrend = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    const scopedTrend = channelView === "all" ? trendData : trendData.filter(t => t.channel === channelView);

    if (trendMode === "day") {
      const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
      const dailyMap: Record<string, { date: string; amount: number; quantity: number }> = {};
      for (let d = 1; d <= daysInMonth; d++) {
        const key = `${currentYear}-${String(currentMonth).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        dailyMap[key] = { date: key, amount: 0, quantity: 0 };
      }
      for (const t of scopedTrend) {
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
      for (const t of scopedTrend) {
        const month = t.date.slice(0, 7);
        if (!monthlyMap[month]) continue;
        monthlyMap[month].amount += t.amount || 0;
        monthlyMap[month].quantity += t.quantity || 0;
      }
      return Object.values(monthlyMap)
        .filter(d => d.quantity > 0)
        .sort((a, b) => a.date.localeCompare(b.date));
    }
  }, [trendData, trendMode, channelView]);

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

  // 渠道过滤后的日统计(业绩/盈利/售卖/快递费跟随渠道切换; 退货率/图表类保持全渠道)
  const filteredDailyStats = useMemo(() => {
    if (channelView === "all") return dailyStats;
    return dailyStats.filter((d) => d.channel === channelView);
  }, [dailyStats, channelView]);

  // 可用日期列表: 去重(每日期有抖音/多多两行) + 排除未来日期(退货时区异常产生的"明天"行)
  // 渠道视图下再排除当日该渠道售卖为 0 的日期(纯退货日不进下拉)
  const availableDates = useMemo(() => {
    const todayBJ = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });
    const qtyByDate = new Map<string, number>();
    for (const d of filteredDailyStats) {
      if (d.date > todayBJ) continue;
      qtyByDate.set(d.date, (qtyByDate.get(d.date) || 0) + (d.quantity || 0));
    }
    const set = new Set<string>();
    for (const [date, qty] of qtyByDate) {
      if (channelView === "all" || qty > 0) set.add(date);
    }
    return [...set].sort().reverse();
  }, [filteredDailyStats, channelView]);

  // 各月售卖件数(跟随渠道切换: 全部=抖音+多多)
  const monthlySales = useMemo(() => {
    const scoped = channelView === "all" ? trendData : trendData.filter(t => t.channel === channelView);
    const map: Record<string, number> = {};
    for (const t of scoped) {
      const month = t.date.slice(0, 7);
      map[month] = (map[month] || 0) + (t.quantity || 0);
    }
    return map;
  }, [trendData, channelView]);

  // 当月售卖件数（总售出卡片）; 未选月份时按渠道视图累计(全部=抖音+多多)
  const selectedMonthSales = useMemo(() => {
    if (!selectedMonth) {
      return Object.values(monthlySales).reduce((s, v) => s + v, 0);
    }
    return monthlySales[selectedMonth] || 0;
  }, [selectedMonth, monthlySales]);

  // ===== 业绩/盈利/售卖框（日度/月度切换）=====
  // 可用月份列表（从过滤后的 dailyStats 聚合）
  const availablePerfMonths = useMemo(() => {
    const map: Record<string, { amount: number; quantity: number; profit: number }> = {};
    for (const d of filteredDailyStats) {
      const m = d.date.slice(0, 7);
      if (!map[m]) map[m] = { amount: 0, quantity: 0, profit: 0 };
      map[m].amount += d.amount || 0;
      map[m].quantity += d.quantity || 0;
      map[m].profit += d.profit || 0;
    }
    return Object.entries(map)
      .map(([month, v]) => ({ month, ...v }))
      .sort((a, b) => b.month.localeCompare(a.month));
  }, [filteredDailyStats]);

  // 当日各渠道行(全部=抖音+多多两行, 业绩/盈利/售卖/快递费均需合并求和而非只取一行)
  const dayRows = useMemo(() => {
    if (!selectedDate) return [];
    return filteredDailyStats.filter(d => d.date === selectedDate);
  }, [filteredDailyStats, selectedDate]);

  // 业绩
  const performance = useMemo(() => {
    if (perfMode === "day") {
      return dayRows.reduce((s, d) => s + (d.amount || 0), 0);
    } else {
      if (!selectedPerfMonth) {
        return filteredDailyStats.reduce((s, d) => s + (d.amount || 0), 0);
      }
      const found = availablePerfMonths.find(m => m.month === selectedPerfMonth);
      return found ? found.amount : 0;
    }
  }, [dayRows, filteredDailyStats, selectedDate, perfMode, selectedPerfMonth, availablePerfMonths]);

  // 盈利(净利润): 毛利已扣退货损失, 再减快递费和平台抽点 = 实际到手
  const dailyProfit = useMemo(() => {
    const net = (d: DailyProfit) => d.profit - (d.shipping_fee || 0) - (d.platform_fee || 0);
    if (perfMode === "day") {
      return dayRows.reduce((s, d) => s + net(d), 0);
    }
    // 月度: 逐日净利求和(月份聚合行只有未减快递/抽点的毛利, 不能直接用)
    return filteredDailyStats
      .filter(d => !selectedPerfMonth || d.date.slice(0, 7) === selectedPerfMonth)
      .reduce((s, d) => s + net(d), 0);
  }, [dayRows, filteredDailyStats, selectedDate, perfMode, selectedPerfMonth]);

  // 售卖件数（与业绩/盈利同步）
  const soldQuantity = useMemo(() => {
    if (perfMode === "day") {
      return dayRows.reduce((s, d) => s + (d.quantity || 0), 0);
    } else {
      if (!selectedPerfMonth) {
        return filteredDailyStats.reduce((s, d) => s + (d.quantity || 0), 0);
      }
      const found = availablePerfMonths.find(m => m.month === selectedPerfMonth);
      return found ? found.quantity : 0;
    }
  }, [dayRows, filteredDailyStats, selectedDate, perfMode, selectedPerfMonth, availablePerfMonths]);

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
  // 与业绩/盈利/售卖同一套日期/月份筛选: 日度=选中日期(全渠道两行合计), 月度=选中月份
  const totalShippingFee = useMemo(() => {
    if (perfMode === "day") {
      return dayRows.reduce((s, d) => s + (d.shipping_fee || 0), 0);
    }
    return filteredDailyStats
      .filter(d => !selectedPerfMonth || d.date.slice(0, 7) === selectedPerfMonth)
      .reduce((s, d) => s + (d.shipping_fee || 0), 0);
  }, [dayRows, filteredDailyStats, perfMode, selectedPerfMonth]);

  // ===== 最佳业绩(仅渠道视图展示): 该渠道历史单日最高业绩 =====
  const bestPerf = useMemo(() => {
    let best: DailyProfit | null = null;
    for (const d of filteredDailyStats) {
      if (!best || (d.amount || 0) > (best.amount || 0)) best = d;
    }
    return best;
  }, [filteredDailyStats]);

  // ===== 最佳商品(仅渠道视图展示): 选中日期当日该渠道售出最多的商品编号 =====
  const bestProduct = useMemo(() => {
    if (channelView === "all" || !selectedDate) return null;
    const rows = salesSizeByDate.filter(s => s.date === selectedDate && s.channel === channelView);
    let top: { id: string; qty: number } | null = null;
    for (const r of rows) {
      const id = String(r.top_product || "");
      const qty = Number(r.top_qty) || 0;
      if (id && (!top || qty > top.qty)) top = { id, qty };
    }
    return top;
  }, [salesSizeByDate, selectedDate, channelView]);

  // ===== 退货尺码分布(按月) =====
  const availableReturnSizeMonths = useMemo(
    () => returnSizeByMonth.map(r => r.month).sort().reverse(),
    [returnSizeByMonth]
  );

  const returnSizeChartData = useMemo(() => {
    const target = selectedReturnSizeMonth || (availableReturnSizeMonths[0] ?? "");
    const found = returnSizeByMonth.find(r => r.month === target);
    if (!found) return [];
    return ALL_SIZES.map(sz => ({
      size: `${sz}`,
      quantity: Number(found[`size_${sz}`]) || 0,
    })).filter(d => d.quantity > 0);
  }, [returnSizeByMonth, selectedReturnSizeMonth, availableReturnSizeMonths]);

  // ===== 抖音直播情况(仅抖音视图): 单一日期抖音售卖>50件 记为一场直播 =====
  const LIVE_MIN_QTY = 50;
  interface LiveRow { date: string; month: string; quantity: number; shows: number; amount: number }
  const nowForLive = new Date();
  const currentLiveMonth = `${nowForLive.getFullYear()}-${String(nowForLive.getMonth() + 1).padStart(2, "0")}`;

  // 日度: 当月抖音售卖>50件的日期
  const liveDailyData = useMemo((): LiveRow[] => {
    return trendData
      .filter(t => t.channel === "douyin" && t.date.slice(0, 7) === currentLiveMonth && (t.quantity || 0) > LIVE_MIN_QTY)
      .map(t => ({ date: t.date.slice(5), month: "", quantity: t.quantity, shows: 0, amount: t.amount }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [trendData, currentLiveMonth]);

  // 月度: 各月直播场数(>50件的日期数)与直播营业额(这些日期的销售额合计)
  const liveMonthlyData = useMemo((): LiveRow[] => {
    const map: Record<string, { shows: number; amount: number }> = {};
    for (const t of trendData) {
      if (t.channel !== "douyin" || (t.quantity || 0) <= LIVE_MIN_QTY) continue;
      const month = t.date.slice(0, 7);
      if (!map[month]) map[month] = { shows: 0, amount: 0 };
      map[month].shows += 1;
      map[month].amount += t.amount || 0;
    }
    return Object.entries(map)
      .map(([month, v]) => ({ date: "", month, quantity: 0, shows: v.shows, amount: v.amount }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }, [trendData]);

  // ===== 售卖尺码柱状图数据（仅当日 + 跟随渠道切换）=====
  const sizeChartData = useMemo(() => {
    const targetDate = selectedDate || (dailyStats.length > 0 ? dailyStats[dailyStats.length - 1].date : "");
    if (!targetDate) return [];
    const rows = salesSizeByDate.filter(
      s => s.date === targetDate && (channelView === "all" || s.channel === channelView)
    );
    if (rows.length === 0) return [];
    return ALL_SIZES.map(sz => ({
      size: `${sz}`,
      quantity: rows.reduce((sum, r) => sum + (Number(r[`size_${sz}`]) || 0), 0),
    })).filter(d => d.quantity > 0);
  }, [salesSizeByDate, selectedDate, dailyStats, channelView]);

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
      <div className="flex items-center justify-between gap-2 flex-wrap mb-6">
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-gray-900">
          <span className="highlight-blue">数据仪表盘</span>
        </h1>
        {/* 渠道切换: 全部/抖音/多多(多多=面单号"多多+日期"的记录, 其余含无面单号归抖音) */}
        <div className="flex gap-1.5">
          {([
            { v: "all", label: "全部" },
            { v: "douyin", label: "抖音" },
            { v: "duoduo", label: "多多" },
          ] as const).map((o) => (
            <button
              key={o.v}
              onClick={() => {
                setChannelView(o.v);
                // 切换视图时统一默认到该视图最新一个有实际售卖的日期(纯退货日不算)
                const chDays =
                  o.v === "all"
                    ? dailyStats
                    : dailyStats.filter(d => d.channel === o.v);
                const soldDays = chDays.filter(d => (d.quantity || 0) > 0);
                if (soldDays.length > 0) {
                  setSelectedDate(soldDays[soldDays.length - 1].date);
                }
              }}
              className={`px-3 sm:px-4 h-9 rounded-xl border-[3px] border-gray-900 text-xs sm:text-sm font-extrabold transition-all ${
                channelView === o.v
                  ? "bg-gray-900 text-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]"
                  : "bg-white text-gray-600 hover:bg-gray-100 shadow-[2px_2px_0px_0px_rgba(0,0,0,0.6)]"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* 数据加载失败横幅: 明确告知故障并支持重试, 避免误读 0 值 */}
      {dataError && (
        <ErrorState
          title="部分数据加载失败"
          message="以下统计数字可能不是最新数据，请重试。"
          onRetry={loadData}
          compact
          className="mb-4"
        />
      )}

      {/* 统计卡片 - 第一行: 业绩/盈利/售卖/快递费(共用日期下拉) */}
      <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        {/* 业绩 - 带日度/月度切换 + 日期下拉 */}
        <StatCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="业绩"
          numeric={performance}
          prefix="¥"
          decimals={2}
          color="bg-blue-500"
          modeToggle={
            <div className="flex gap-1">
              <button
                onClick={() => setPerfMode("day")}
                className={`px-1.5 py-0.5 rounded-md border-[2px] border-gray-900 text-[9px] font-extrabold transition-all ${perfMode === "day" ? "bg-gray-900 text-white" : "bg-white text-gray-600"}`}
              >日度</button>
              <button
                onClick={() => setPerfMode("month")}
                className={`px-1.5 py-0.5 rounded-md border-[2px] border-gray-900 text-[9px] font-extrabold transition-all ${perfMode === "month" ? "bg-gray-900 text-white" : "bg-white text-gray-600"}`}
              >月度</button>
            </div>
          }
          extra={
            <select
              value={perfMode === "day" ? selectedDate : selectedPerfMonth}
              onChange={e => {
                if (perfMode === "day") setSelectedDate(e.target.value);
                else setSelectedPerfMonth(e.target.value);
              }}
              className="mt-1 w-full text-[10px] sm:text-xs border-[2px] border-gray-900 rounded-lg px-1 py-0.5 bg-white font-bold text-gray-700 truncate"
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
          }
        />

        {/* 盈利 - 与业绩同步（带日期下拉）; 净利口径: 已扣退货损失+快递费+平台抽点 */}
        <StatCard
          icon={<DollarSign className="h-5 w-5" />}
          label="盈利"
          numeric={dailyProfit}
          prefix="¥"
          decimals={2}
          color="bg-yellow-500"
          modeToggle={
            <div className="flex gap-1">
              <button
                onClick={() => setPerfMode("day")}
                className={`px-1.5 py-0.5 rounded-md border-[2px] border-gray-900 text-[9px] font-extrabold transition-all ${perfMode === "day" ? "bg-gray-900 text-white" : "bg-white text-gray-600"}`}
              >日度</button>
              <button
                onClick={() => setPerfMode("month")}
                className={`px-1.5 py-0.5 rounded-md border-[2px] border-gray-900 text-[9px] font-extrabold transition-all ${perfMode === "month" ? "bg-gray-900 text-white" : "bg-white text-gray-600"}`}
              >月度</button>
            </div>
          }
          extra={
            <select
              value={perfMode === "day" ? selectedDate : selectedPerfMonth}
              onChange={e => {
                if (perfMode === "day") setSelectedDate(e.target.value);
                else setSelectedPerfMonth(e.target.value);
              }}
              className="mt-1 w-full text-[10px] sm:text-xs border-[2px] border-gray-900 rounded-lg px-1 py-0.5 bg-white font-bold text-gray-700 truncate"
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
          }
        />

        {/* 售卖 - 与业绩/盈利同步（带日期下拉） */}
        <StatCard
          icon={<ShoppingCart className="h-5 w-5" />}
          label="售卖"
          numeric={soldQuantity}
          suffix=" 件"
          color="bg-teal-500"
          modeToggle={
            <div className="flex gap-1">
              <button
                onClick={() => setPerfMode("day")}
                className={`px-1.5 py-0.5 rounded-md border-[2px] border-gray-900 text-[9px] font-extrabold transition-all ${perfMode === "day" ? "bg-gray-900 text-white" : "bg-white text-gray-600"}`}
              >日度</button>
              <button
                onClick={() => setPerfMode("month")}
                className={`px-1.5 py-0.5 rounded-md border-[2px] border-gray-900 text-[9px] font-extrabold transition-all ${perfMode === "month" ? "bg-gray-900 text-white" : "bg-white text-gray-600"}`}
              >月度</button>
            </div>
          }
          extra={
            <select
              value={perfMode === "day" ? selectedDate : selectedPerfMonth}
              onChange={e => {
                if (perfMode === "day") setSelectedDate(e.target.value);
                else setSelectedPerfMonth(e.target.value);
              }}
              className="mt-1 w-full text-[10px] sm:text-xs border-[2px] border-gray-900 rounded-lg px-1 py-0.5 bg-white font-bold text-gray-700 truncate"
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
          }
        />

        {/* 快递费 - 前移至售卖后面, 与业绩/盈利/售卖同步同一套日期/月份下拉 */}
        <StatCard
          icon={<Truck className="h-5 w-5" />}
          label="快递费"
          numeric={totalShippingFee}
          prefix="¥"
          decimals={2}
          color="bg-indigo-500"
          modeToggle={
            <div className="flex gap-1">
              <button
                onClick={() => setPerfMode("day")}
                className={`px-1.5 py-0.5 rounded-md border-[2px] border-gray-900 text-[9px] font-extrabold transition-all ${perfMode === "day" ? "bg-gray-900 text-white" : "bg-white text-gray-600"}`}
              >日度</button>
              <button
                onClick={() => setPerfMode("month")}
                className={`px-1.5 py-0.5 rounded-md border-[2px] border-gray-900 text-[9px] font-extrabold transition-all ${perfMode === "month" ? "bg-gray-900 text-white" : "bg-white text-gray-600"}`}
              >月度</button>
            </div>
          }
          extra={
            <select
              value={perfMode === "day" ? selectedDate : selectedPerfMonth}
              onChange={e => {
                if (perfMode === "day") setSelectedDate(e.target.value);
                else setSelectedPerfMonth(e.target.value);
              }}
              className="mt-1 w-full text-[10px] sm:text-xs border-[2px] border-gray-900 rounded-lg px-1 py-0.5 bg-white font-bold text-gray-700 truncate"
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
          }
        />
      </motion.div>

      {/* 统计卡片 - 第二行: 总售出/退货率/进货/库存(仅全部视图) + 最佳业绩/最佳商品(仅渠道视图) */}
      <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        {/* 总售出 - 带月份下拉, 移至退货率前面; 渠道视图隐藏 */}
        {channelView === "all" && (
          <StatCard
            icon={<ShoppingCart className="h-5 w-5" />}
            label="总售出"
            numeric={selectedMonthSales}
            suffix=" 件"
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
        )}

        {/* 退货率 - 仅全部视图(库存/厂家数据无渠道归属, 渠道视图隐藏) */}
        {channelView === "all" && (
          <StatCard
            icon={<Percent className="h-5 w-5" />}
            label="退货率"
            numeric={returnRate}
            suffix="%"
            decimals={2}
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
        )}

        {/* 最佳业绩 - 仅渠道视图展示该渠道历史单日最高业绩 */}
        {channelView !== "all" && (
          <StatCard
            icon={<TrendingUp className="h-5 w-5" />}
            label={`最佳业绩（${channelView === "douyin" ? "抖音" : "多多"}）`}
            numeric={bestPerf ? bestPerf.amount : 0}
            prefix="¥"
            decimals={2}
            color="bg-emerald-500"
            extra={
              <div className="mt-1 text-[10px] sm:text-xs font-bold text-gray-500">
                {bestPerf ? `日期: ${bestPerf.date}` : "暂无数据"}
              </div>
            }
          />
        )}

        {/* 最佳商品 - 仅渠道视图展示选中日期当日该渠道累计售出最多的商品编号 */}
        {channelView !== "all" && (
          <StatCard
            icon={<Package className="h-5 w-5" />}
            label={`最佳商品（${channelView === "douyin" ? "抖音" : "多多"}）`}
            value={bestProduct ? `${bestProduct.id} · ${bestProduct.qty}件` : "暂无数据"}
            color="bg-cyan-500"
            extra={
              <select
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                className="mt-1 w-full text-[10px] sm:text-xs border-[2px] border-gray-900 rounded-lg px-1 py-0.5 bg-white font-bold text-gray-700 truncate"
              >
                {availableDates.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            }
          />
        )}

        {/* 进货总花费 - 仅全部视图 */}
        {channelView === "all" && (
          <StatCard
            icon={<Package className="h-5 w-5" />}
            label="进货总花费"
            numeric={inboundCost}
            prefix="¥"
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
        )}

        {/* 库存剩余价值 - 仅全部视图 */}
        {channelView === "all" && (
          <StatCard
            icon={<RotateCcw className="h-5 w-5" />}
            label="库存剩余价值"
            numeric={remainingValue}
            prefix="¥"
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
        )}
      </motion.div>

      {/* 图表区 */}
      <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* 抖音直播情况 - 仅抖音视图, 放在售卖尺码分布前面 */}
        {channelView === "douyin" && (
          <ChartCard
            title="抖音直播情况"
            extra={
              <div className="flex gap-1">
                <button
                  onClick={() => setLiveMode("day")}
                  className={`px-3 py-1 rounded-lg border-[2px] border-gray-900 text-xs font-extrabold transition-all ${liveMode === "day" ? "bg-gray-900 text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,0.3)]" : "bg-white text-gray-600 hover:bg-gray-100"}`}
                >日度</button>
                <button
                  onClick={() => setLiveMode("month")}
                  className={`px-3 py-1 rounded-lg border-[2px] border-gray-900 text-xs font-extrabold transition-all ${liveMode === "month" ? "bg-gray-900 text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,0.3)]" : "bg-white text-gray-600 hover:bg-gray-100"}`}
                >月度</button>
              </div>
            }
          >
            {(liveMode === "day" ? liveDailyData.length === 0 : liveMonthlyData.length === 0) ? (
              <div className="flex flex-col items-center justify-center h-[300px] text-gray-400 text-sm font-bold gap-1">
                <span>{liveMode === "day" ? `${currentLiveMonth} 暂无单日售卖超过 ${LIVE_MIN_QTY} 件的直播` : "暂无直播数据"}</span>
                <span className="text-xs font-normal">单日抖音售卖大于 {LIVE_MIN_QTY} 件记为一场直播</span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={liveMode === "day" ? liveDailyData : liveMonthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey={liveMode === "day" ? "date" : "month"}
                    tick={{ fontSize: 11 }}
                    tickFormatter={v => liveMode === "day" ? String(v).slice(3) : String(v).slice(2)}
                  />
                  <YAxis yAxisId="left" tick={{ fontSize: 10 }} width={35} label={{ value: liveMode === "day" ? "件数" : "场数", angle: -90, position: "insideLeft", style: { fontSize: 10 }, offset: 0 }} />
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
                  />
                  <Legend wrapperStyle={{ fontSize: "12px", fontWeight: "bold", paddingTop: "10px" }} />
                  <Bar yAxisId="left" dataKey={liveMode === "day" ? "quantity" : "shows"} name={liveMode === "day" ? "售卖件数(件)" : "直播场数(场)"} fill="#FF6B7A" radius={[4, 4, 0, 0]} barSize={liveMode === "day" ? 16 : 24} />
                  <Line yAxisId="right" type="monotone" dataKey="amount" name={liveMode === "day" ? "当日售卖金额(¥)" : "直播营业额(¥)"} stroke="#4A90E2" strokeWidth={3} dot={{ r: 5, fill: "#4A90E2", strokeWidth: 2, stroke: "#fff" }} activeDot={{ r: 8 }} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        )}

        {/* 售卖尺码柱状图 - 仅当日数据 */}
        <ChartCard
          title="售卖尺码分布"
          extra={
            <select
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="text-[10px] sm:text-xs border-[2px] border-gray-900 rounded-lg px-1.5 py-0.5 bg-white font-bold text-gray-700"
            >
              {availableDates.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          }
        >
          {sizeChartData.length === 0 ? (
            <div className="flex items-center justify-center h-[300px] text-gray-400 text-sm font-bold">
              该日期无售卖数据
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

        {/* 退货尺码分布(按月汇总) - 放在售卖尺码分布下方 */}
        <ChartCard
          title="退货尺码分布（按月）"
          extra={
            <select
              value={selectedReturnSizeMonth}
              onChange={e => setSelectedReturnSizeMonth(e.target.value)}
              className="text-[10px] sm:text-xs border-[2px] border-gray-900 rounded-lg px-1.5 py-0.5 bg-white font-bold text-gray-700"
            >
              {availableReturnSizeMonths.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          }
        >
          {returnSizeChartData.length === 0 ? (
            <div className="flex items-center justify-center h-[300px] text-gray-400 text-sm font-bold">
              该月份无退货数据
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={returnSizeChartData} margin={{ left: 0, right: 20, top: 5, bottom: 5 }}>
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
                  formatter={(value: unknown) => `${Number(value).toLocaleString()} 件`}
                />
                <Bar dataKey="quantity" name="退货数量" fill="#FF6B6B" radius={[4, 4, 0, 0]} barSize={30} />
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

        {/* 厂家进货件数饼状图 - 仅全部视图(进货数据无渠道归属) */}
        {channelView === "all" && (
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
        )}

        {/* 厂家剩余库存柱状图 - 仅全部视图 */}
        {channelView === "all" && (
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
        )}

        {/* 各厂家售卖/退货数量 - 仅全部视图(厂家数据无渠道归属) */}
        {channelView === "all" && (
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
        )}

        {/* 厂家尺码剩余雷达图 - 仅全部视图 */}
        {channelView === "all" && (
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
        )}
      </motion.div>
    </PageWrapper>
  );
}

function StatCard({ icon, label, value, numeric, prefix, suffix, decimals, color, extra, modeToggle }: { icon: React.ReactNode; label: string; value?: string; numeric?: number; prefix?: string; suffix?: string; decimals?: number; color: string; extra?: React.ReactNode; modeToggle?: React.ReactNode }) {
  return (
    <motion.div variants={staggerItem} className="bg-white rounded-xl border-[3px] border-gray-900 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] p-3 sm:p-4 relative">
      <div className="flex items-center gap-2 mb-2">
        <div className={`${color} text-white p-1.5 rounded-lg`}>{icon}</div>
        <span className="text-xs sm:text-sm text-gray-500 font-bold">{label}</span>
        {modeToggle && <div className="ml-auto">{modeToggle}</div>}
      </div>
      <p className="text-lg sm:text-2xl font-extrabold text-gray-900">
        {numeric !== undefined ? (
          <CountUp value={numeric} prefix={prefix} suffix={suffix} decimals={decimals} />
        ) : (
          value
        )}
      </p>
      {extra && <div className="mt-2">{extra}</div>}
    </motion.div>
  );
}

function ChartCard({ title, children, extra }: { title: string; children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <motion.div variants={staggerItem} className="bg-white rounded-xl border-[3px] border-gray-900 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] p-3 sm:p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm sm:text-base font-extrabold text-gray-900">{title}</h3>
        {extra}
      </div>
      {children}
    </motion.div>
  );
}
