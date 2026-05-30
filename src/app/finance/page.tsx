"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  BarChart3,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Wallet,
  Receipt,
  Calendar,
  Download,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageWrapper } from "@/components/page-wrapper";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend,
} from "recharts";

interface FinanceRow {
  name: string;
  revenue: number;
  cost: number;
  profit: number;
}

interface CategoryRow {
  name: string;
  value: number;
  color: string;
}

interface PlatformRow {
  name: string;
  revenue: number;
  cost: number;
}

interface TransactionRow {
  id: string;
  type: string;
  amount: number;
  description: string;
  date: string;
  platform: string;
}

export default function FinancePage() {
  const [period, setPeriod] = useState("month");
  const [monthlyData, setMonthlyData] = useState<FinanceRow[]>([]);
  const [categoryData, setCategoryData] = useState<CategoryRow[]>([]);
  const [platformData, setPlatformData] = useState<PlatformRow[]>([]);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchFinance();
  }, []);

  const fetchFinance = async () => {
    try {
      const res = await fetch("/api/finance");
      const data = await res.json();
      setMonthlyData(data.monthlyData || []);
      setCategoryData(data.categoryData || []);
      setPlatformData(data.platformData || []);
      setTransactions(data.transactions || []);
    } catch (err) {
      console.error("Fetch finance error:", err);
    } finally {
      setLoading(false);
    }
  };

  const totalRevenue = monthlyData.reduce((s, d) => s + (Number(d.revenue) || 0), 0);
  const totalCost = monthlyData.reduce((s, d) => s + (Number(d.cost) || 0), 0);
  const totalProfit = totalRevenue - totalCost;

  return (
    <PageWrapper>
      {/* Header */}
      <div className="mb-6 lg:mb-8">
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-gray-900 mb-2">
          <span className="highlight-blue">财务报表</span>
        </h1>
        <p className="text-sm lg:text-lg text-gray-600 font-medium">
          实时追踪营收、成本和利润，掌握财务状况
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 lg:gap-6 mb-6 lg:mb-8">
        <Card>
          <CardContent className="p-3 lg:p-6 flex items-center justify-between">
            <div>
              <p className="text-[10px] lg:text-sm font-bold text-gray-500">总营收</p>
              <p className="text-lg lg:text-3xl font-extrabold text-[#4CD964]">
                ¥{totalRevenue.toLocaleString()}
              </p>
            </div>
            <div className="flex h-8 w-8 lg:h-12 lg:w-12 items-center justify-center rounded-lg lg:rounded-xl border-[3px] border-gray-900 bg-[#4CD964]">
              <TrendingUp className="h-4 w-4 lg:h-6 lg:w-6 text-white" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 lg:p-6 flex items-center justify-between">
            <div>
              <p className="text-[10px] lg:text-sm font-bold text-gray-500">总成本</p>
              <p className="text-lg lg:text-3xl font-extrabold text-[#FF6B7A]">
                ¥{totalCost.toLocaleString()}
              </p>
            </div>
            <div className="flex h-8 w-8 lg:h-12 lg:w-12 items-center justify-center rounded-lg lg:rounded-xl border-[3px] border-gray-900 bg-[#FF6B7A]">
              <TrendingDown className="h-4 w-4 lg:h-6 lg:w-6 text-white" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 lg:p-6 flex items-center justify-between">
            <div>
              <p className="text-[10px] lg:text-sm font-bold text-gray-500">净利润</p>
              <p className="text-lg lg:text-3xl font-extrabold text-[#4A90E2]">
                ¥{totalProfit.toLocaleString()}
              </p>
            </div>
            <div className="flex h-8 w-8 lg:h-12 lg:w-12 items-center justify-center rounded-lg lg:rounded-xl border-[3px] border-gray-900 bg-[#4A90E2]">
              <DollarSign className="h-4 w-4 lg:h-6 lg:w-6 text-white" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Tabs */}
      <Tabs defaultValue="trend" className="mb-6 lg:mb-8">
        <TabsList className="mb-4 lg:mb-6 overflow-x-auto flex-nowrap">
          <TabsTrigger value="trend" className="text-xs lg:text-sm whitespace-nowrap">营收趋势</TabsTrigger>
          <TabsTrigger value="category" className="text-xs lg:text-sm whitespace-nowrap">品类占比</TabsTrigger>
          <TabsTrigger value="platform" className="text-xs lg:text-sm whitespace-nowrap">平台对比</TabsTrigger>
        </TabsList>

        <TabsContent value="trend">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base lg:text-xl">月度营收趋势</CardTitle>
                <div className="flex gap-2">
                  <span className="flex items-center gap-1.5 text-xs lg:text-sm font-bold">
                    <span className="h-3 w-3 rounded-full bg-[#FF6B7A] border-[2px] border-gray-900" />
                    营收
                  </span>
                  <span className="flex items-center gap-1.5 text-xs lg:text-sm font-bold">
                    <span className="h-3 w-3 rounded-full bg-[#4A90E2] border-[2px] border-gray-900" />
                    成本
                  </span>
                  <span className="flex items-center gap-1.5 text-xs lg:text-sm font-bold">
                    <span className="h-3 w-3 rounded-full bg-[#4CD964] border-[2px] border-gray-900" />
                    利润
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fontWeight: 700 }} />
                  <YAxis tick={{ fontSize: 10, fontWeight: 700 }} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: "12px",
                      border: "3px solid #171717",
                      boxShadow: "4px 4px 0px 0px rgba(0,0,0,1)",
                      fontWeight: 700,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="#FF6B7A"
                    fill="#FF6B7A"
                    fillOpacity={0.2}
                    strokeWidth={3}
                  />
                  <Area
                    type="monotone"
                    dataKey="cost"
                    stroke="#4A90E2"
                    fill="#4A90E2"
                    fillOpacity={0.2}
                    strokeWidth={3}
                  />
                  <Area
                    type="monotone"
                    dataKey="profit"
                    stroke="#4CD964"
                    fill="#4CD964"
                    fillOpacity={0.2}
                    strokeWidth={3}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="category">
          <Card>
            <CardHeader>
              <CardTitle className="text-base lg:text-xl">销售品类占比</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col md:flex-row items-center gap-8">
                <ResponsiveContainer width={300} height={260}>
                  <PieChart>
                    <Pie
                      data={categoryData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={90}
                      paddingAngle={4}
                      dataKey="value"
                      stroke="#171717"
                      strokeWidth={3}
                    >
                      {categoryData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        borderRadius: "12px",
                        border: "3px solid #171717",
                        boxShadow: "4px 4px 0px 0px rgba(0,0,0,1)",
                        fontWeight: 700,
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-4">
                  {categoryData.map((item) => (
                    <div key={item.name} className="flex items-center gap-3">
                      <span
                        className="h-4 w-4 rounded-full border-[2px] border-gray-900"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="text-sm font-bold w-20">{item.name}</span>
                      <span className="text-sm font-extrabold">{item.value}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="platform">
          <Card>
            <CardHeader>
              <CardTitle className="text-base lg:text-xl">各平台营收对比</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={platformData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fontWeight: 700 }} />
                  <YAxis tick={{ fontSize: 10, fontWeight: 700 }} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: "12px",
                      border: "3px solid #171717",
                      boxShadow: "4px 4px 0px 0px rgba(0,0,0,1)",
                      fontWeight: 700,
                    }}
                  />
                  <Legend />
                  <Bar
                    dataKey="revenue"
                    name="营收"
                    fill="#FF6B7A"
                    stroke="#171717"
                    strokeWidth={3}
                    radius={[8, 8, 0, 0]}
                  />
                  <Bar
                    dataKey="cost"
                    name="成本"
                    fill="#4A90E2"
                    stroke="#171717"
                    strokeWidth={3}
                    radius={[8, 8, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Transactions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base lg:text-xl">近期交易明细</CardTitle>
            <Button variant="secondary" className="flex items-center gap-2 text-xs lg:text-sm px-2.5 lg:px-4 py-1.5 lg:py-2">
              <Download className="h-3.5 w-3.5 lg:h-4 lg:w-4" />
              导出
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2.5 lg:space-y-3">
            {transactions.map((trx) => (
              <div
                key={trx.id}
                className="flex items-center justify-between p-3 lg:p-4 rounded-lg lg:rounded-xl border-[3px] border-gray-200 hover:border-gray-900 transition-colors gap-2"
              >
                <div className="flex items-center gap-2.5 lg:gap-4 min-w-0">
                  <div
                    className={`flex h-8 w-8 lg:h-10 lg:w-10 items-center justify-center rounded-lg border-[3px] border-gray-900 shrink-0 ${
                      trx.type === "income" ? "bg-[#4CD964]" : "bg-[#FF6B7A]"
                    }`}
                  >
                    {trx.type === "income" ? (
                      <TrendingUp className="h-4 w-4 lg:h-5 lg:w-5 text-white" />
                    ) : (
                      <TrendingDown className="h-4 w-4 lg:h-5 lg:w-5 text-white" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-gray-900 text-xs lg:text-sm truncate">{trx.description}</p>
                    <div className="flex items-center gap-1.5 lg:gap-2 text-[10px] lg:text-sm text-gray-500 flex-wrap">
                      <span className="font-mono font-bold">{trx.id}</span>
                      <span className="hidden sm:inline">·</span>
                      <span className="hidden sm:inline">{trx.date}</span>
                      {trx.platform !== "-" && (
                        <>
                          <span>·</span>
                          <span className="font-bold">{trx.platform}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <span
                  className={`text-sm lg:text-lg font-extrabold shrink-0 ${
                    trx.type === "income" ? "text-green-600" : "text-red-500"
                  }`}
                >
                  {trx.type === "income" ? "+" : "-"}¥{trx.amount}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </PageWrapper>
  );
}
