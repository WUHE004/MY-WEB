"use client";

import { useState, useEffect, useMemo } from "react";
import { PageWrapper } from "@/components/page-wrapper";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ComposedChart, Line, PieChart, Pie, Cell, Legend,
} from "recharts";
import { TrendingUp, Package, ShoppingCart, RotateCcw, DollarSign } from "lucide-react";

const COLORS = ["#4A90E2", "#50C878", "#FFC93C", "#FF6B6B", "#9B59B6", "#F39C12", "#1ABC9C", "#E74C3C", "#3498DB", "#2ECC71", "#E67E22", "#8E44AD", "#16A085", "#D35400", "#2980B9", "#27AE60"];

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
}

export default function DashboardPage() {
  const [salesData, setSalesData] = useState<SalesSummary[]>([]);
  const [products, setProducts] = useState<InboundRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [trendMode, setTrendMode] = useState<"day" | "month">("day");
  const [trendData, setTrendData] = useState<TrendItem[]>([]);
  const [returnData, setReturnData] = useState<ReturnSummary[]>([]);
  const [dailyStats, setDailyStats] = useState<DailyProfit[]>([]);
  const [mfrMode, setMfrMode] = useState<"sales" | "returns">("sales");

  // 下拉选择状态
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedMfrCost, setSelectedMfrCost] = useState<string>("全部");
  const [selectedMfrValue, setSelectedMfrValue] = useState<string>("全部");

  useEffect(() => {
    async function loadData() {
      try {
        const [salesRes, prodsRes, trendRes, returnsRes, dailyRes] = await Promise.all([
          fetch("/api/sales-summary").then(r => r.json()).catch(() => []),
          fetch("/api/inbound-records").then(r => r.json()).catch(() => []),
          fetch("/api/sales-trend").then(r => r.json()).catch(() => []),
          fetch("/api/returns-summary").then(r => r.json()).catch(() => []),
          fetch("/api/daily-profit").then(r => r.json()).catch(() => []),
        ]);
        if (Array.isArray(salesRes)) setSalesData(salesRes);
        if (Array.isArray(prodsRes)) setProducts(prodsRes);
        // 兼容 /api/sales-trend 的新格式 { salesTrend, returnsTrend }
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
        if (Array.isArray(returnsRes)) setReturnData(returnsRes);
        // 兼容 /api/daily-profit 的新格式 { stats: [...] }
        const dailyArr = Array.isArray(dailyRes)
          ? dailyRes
          : Array.isArray(dailyRes?.stats)
            ? dailyRes.stats.map((r: any) => ({
                date: r.date,
                amount: Number(r.total_amount) || 0,
                quantity: Number(r.total_quantity) || 0,
                profit: Number(r.total_profit) || 0,
              }))
            : [];
        if (dailyArr.length > 0) {
          setDailyStats(dailyArr);
          // 默认选中最新日期
          setSelectedDate(dailyArr[dailyArr.length - 1].date);
        }
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

  // sale_id -> manufacturer 映射（以入库表为准，回退用汇总表的 manufacturer）
  const saleIdToMfr = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of products) {
      if (p.sale_id && p.manufacturer) {
        map[String(p.sale_id).toUpperCase()] = p.manufacturer;
      }
    }
    return map;
  }, [products]);

  // 各厂家售卖数量（manufacturer 优先用入库表，回退用 sales_summary 的 manufacturer）
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

  // 当前展示的厂家数据（售出或退货）
  const currentMfrBar = mfrMode === "sales" ? mfrSalesBar : mfrReturnsBar;

  // 厂家列表
  const manufacturers = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) {
      if (p.manufacturer) set.add(p.manufacturer);
    }
    return Array.from(set).sort();
  }, [products]);

  // 可用月份列表（从 trendData 中提取）
  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    for (const t of trendData) {
      set.add(t.date.slice(0, 7));
    }
    return Array.from(set).sort().reverse();
  }, [trendData]);

  // 可用日期列表（从 dailyStats 中提取，用于业绩/盈利下拉）
  const availableDates = useMemo(() => {
    return dailyStats.map(d => d.date).sort().reverse();
  }, [dailyStats]);

  // 各月售卖件数（用于总售出卡下拉）
  const monthlySales = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of trendData) {
      const month = t.date.slice(0, 7);
      map[month] = (map[month] || 0) + (t.quantity || 0);
    }
    return map;
  }, [trendData]);

  // 当月售卖件数
  const selectedMonthSales = useMemo(() => {
    if (!selectedMonth) return salesData.reduce((s, i) => s + (i.total_sold || 0), 0);
    return monthlySales[selectedMonth] || 0;
  }, [selectedMonth, monthlySales, salesData]);

  // 业绩 = 当日售卖总金额
  const performance = useMemo(() => {
    if (!selectedDate) return 0;
    const found = dailyStats.find(d => d.date === selectedDate);
    return found ? found.amount : 0;
  }, [dailyStats, selectedDate]);

  // 盈利 = 当日利润之和 = (售价-进价) × 当日售卖数量
  const dailyProfit = useMemo(() => {
    if (!selectedDate) return 0;
    const found = dailyStats.find(d => d.date === selectedDate);
    return found ? found.profit : 0;
  }, [dailyStats, selectedDate]);

  // 进货总花费 = ∑(进货数量 × 进价)
  const inboundCost = useMemo(() => {
    const filtered = selectedMfrCost === "全部"
      ? products
      : products.filter(p => p.manufacturer === selectedMfrCost);
    return filtered.reduce((s, p) => s + (p.total_stock || 0) * (p.cost_price || 0), 0);
  }, [products, selectedMfrCost]);

  // 库存剩余价值 = ∑(剩余库存 × 进价)
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

      {/* 统计卡片 */}
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

        {/* 业绩 - 带日期下拉 */}
        <StatCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="业绩"
          value={`¥${performance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          color="bg-blue-500"
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

        {/* 盈利 - 带日期下拉 */}
        <StatCard
          icon={<DollarSign className="h-5 w-5" />}
          label="盈利"
          value={`¥${dailyProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          color="bg-yellow-500"
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

        {/* 进货总花费 - 带厂家下拉 */}
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
      </div>

      {/* 第二行：库存剩余价值 */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
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
              <Legend
                wrapperStyle={{ fontSize: "12px", fontWeight: "bold", paddingTop: "10px" }}
              />
              <Bar yAxisId="left" dataKey="quantity" name="数量(件)" fill="#50C878" radius={[4, 4, 0, 0]} barSize={trendMode === "day" ? 16 : 24}>
                <animate attributeName="opacity" values="0;1;0" dur="2s" repeatCount="indefinite" />
              </Bar>
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
                <Bar dataKey="value" name="剩余库存" fill="#4A90E2" radius={[0, 4, 4, 0]} barSize={20}>
                  <animate attributeName="opacity" values="0;1" dur="0.5s" fill="freeze" />
                </Bar>
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
                <Bar dataKey="value" name={mfrMode === "sales" ? "售出(件)" : "退货(件)"} fill={mfrMode === "sales" ? "#50C878" : "#FF6B6B"} radius={[4, 4, 0, 0]}>
                  <animate attributeName="opacity" values="0;1" dur="0.5s" fill="freeze" />
                </Bar>
              </BarChart>
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