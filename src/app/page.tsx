"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useState, useEffect } from "react";
import {
  Package,
  Link2,
  BarChart3,
  Users,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  Table,
  TrendingUp,
  TrendingDown,
  ChevronDown,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageWrapper } from "@/components/page-wrapper";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";

const stats = [
  {
    title: "总商品数",
    value: "1,284",
    change: "+12.5%",
    trend: "up",
    icon: Package,
    color: "bg-[#FF6B7A]",
  },
  {
    title: "活跃链接",
    value: "86",
    change: "+5.2%",
    trend: "up",
    icon: Link2,
    color: "bg-[#4A90E2]",
  },
  {
    title: "本月营收",
    value: "¥48,320",
    change: "+18.3%",
    trend: "up",
    icon: DollarSign,
    color: "bg-[#FFC93C]",
  },
  {
    title: "运营账号",
    value: "12",
    change: "-2.1%",
    trend: "down",
    icon: Users,
    color: "bg-[#7B61FF]",
  },
];

const revenueData = [
  { name: "1月", revenue: 32000, cost: 24000 },
  { name: "2月", revenue: 35000, cost: 26000 },
  { name: "3月", revenue: 38000, cost: 27000 },
  { name: "4月", revenue: 42000, cost: 30000 },
  { name: "5月", revenue: 40000, cost: 28000 },
  { name: "6月", revenue: 48320, cost: 32000 },
];

const topProducts = [
  { name: "无线蓝牙耳机 Pro", sales: 342, stock: 156, trend: "up" },
  { name: "智能手表 Series 8", sales: 289, stock: 89, trend: "up" },
  { name: "便携充电宝 20000mAh", sales: 256, stock: 234, trend: "down" },
  { name: "机械键盘 RGB", sales: 198, stock: 67, trend: "up" },
  { name: "降噪耳机 XM5", sales: 176, stock: 45, trend: "down" },
];

const recentActivities = [
  { action: "新增商品", detail: "无线蓝牙耳机 Pro", time: "2分钟前", type: "add" },
  { action: "链接更新", detail: "淘宝店铺-夏季促销", time: "15分钟前", type: "update" },
  { action: "订单完成", detail: "订单 #202406001", time: "32分钟前", type: "order" },
  { action: "库存预警", detail: "降噪耳机 XM5 库存不足", time: "1小时前", type: "warning" },
  { action: "账号发布", detail: "小红书-新品测评", time: "2小时前", type: "post" },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

export default function DashboardPage() {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [dropdownOpenDesktop, setDropdownOpenDesktop] = useState(false);
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const accessToken = typeof window !== "undefined" ? localStorage.getItem("wps_access_token") : null;
      const url = accessToken 
        ? `/api/wps-data?access_token=${encodeURIComponent(accessToken)}` 
        : "/api/wps-data";
      const response = await fetch(url);
      const result = await response.json();
      setData(result);
    } catch (err) {
      setError("获取数据失败，请稍后重试");
      console.error("Error fetching data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // 每30秒刷新一次数据
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  // Use fetched data or fallback to mock data
  const salesData = (data?.salesData || revenueData) as Array<{ name: string; month: string; revenue: number; cost: number }>;
  const topProductsData = (data?.topProducts || topProducts) as Array<{ name: string; sales: number; stock: number; trend: string }>;
  const statsData = data?.stats || {
    totalProducts: 1284,
    activeLinks: 86,
    monthlyRevenue: 48320,
    operatingAccounts: 12,
    todayRevenue: 48320,
  };

  return (
    <PageWrapper>
      {/* Stats Bar - Pill style */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-8 lg:mb-12"
      >
        <div className="rounded-2xl lg:rounded-full border-[3px] border-gray-900 bg-white px-4 lg:px-10 py-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <div className="grid grid-cols-2 lg:flex lg:items-center lg:justify-evenly gap-3 lg:gap-0">
            {stats.map((stat, index) => (
              <div key={stat.title} className="flex items-center justify-between lg:justify-center gap-2 lg:gap-3">
                <div className="flex flex-col">
                  <span className="text-[10px] lg:text-xs font-bold text-gray-500">
                    {stat.title}
                  </span>
                  <span className="text-base lg:text-lg font-extrabold text-gray-900">
                    {stat.value}
                  </span>
                  <div className="flex items-center gap-0.5">
                    {stat.trend === "up" ? (
                      <ArrowUpRight className="h-3 w-3 text-green-600" />
                    ) : (
                      <ArrowDownRight className="h-3 w-3 text-red-500" />
                    )}
                    <span
                      className={`text-[10px] lg:text-xs font-bold ${
                        stat.trend === "up" ? "text-green-600" : "text-red-500"
                      }`}
                    >
                      {stat.change}
                    </span>
                  </div>
                </div>
                <div
                  className={`flex h-8 w-8 lg:h-10 lg:w-10 items-center justify-center rounded-lg border-[3px] border-gray-900 ${stat.color} shrink-0`}
                >
                  <stat.icon className="h-4 w-4 lg:h-5 lg:w-5 text-white" />
                </div>
                {index < stats.length - 1 && (
                  <div className="hidden lg:block w-[2px] h-10 bg-gray-200 mx-4" />
                )}
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Hero Section */}
      <section className="mb-10 lg:mb-16">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-12 items-center">
          {/* Left Content */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="flex flex-col lg:flex-row lg:items-end gap-3 lg:gap-4 mb-3">
              <div className="flex-shrink-0">
                <h1 className="text-3xl sm:text-5xl lg:text-7xl font-extrabold text-gray-900 leading-[1.1] whitespace-nowrap">
                  <span className="inline-block text-2xl sm:text-4xl lg:text-6xl">今日营业额</span>
                  <span className="inline-block bg-[#FF6B7A] text-white px-2 lg:px-3 py-0.5 lg:py-1 mx-1 align-middle">
                    ¥48,320
                  </span>
                </h1>
                <h2 className="mt-2 whitespace-nowrap flex items-baseline">
                  <span className="inline-block bg-[#4A90E2] text-white px-2 lg:px-3 py-0.5 lg:py-1 mx-1 text-5xl sm:text-7xl lg:text-[9rem] font-extrabold leading-none">
                    点冰
                  </span>
                  <span className="text-4xl sm:text-6xl lg:text-8xl font-extrabold text-gray-900">加油</span>
                </h2>
              </div>
              
              {/* 手机端：标题下紧凑按钮 */}
              <div className="lg:hidden mt-2 relative">
                <button
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="neo-btn neo-btn-primary flex items-center gap-2 px-5 py-2.5 text-sm"
                >
                  <Table className="h-4 w-4" />
                  点冰出入库表
                  <ChevronDown className={`h-3 w-3 transition-transform ${dropdownOpen ? "rotate-180" : ""}`} />
                </button>
                
                {dropdownOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="absolute top-full left-0 mt-2 w-44 rounded-xl border-[3px] border-gray-900 bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] z-50"
                  >
                    <div className="p-1.5">
                      <Link
                        href="https://www.kdocs.cn/wo/sl/v12CnUqU"
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setDropdownOpen(false)}
                        className="block w-full text-left px-3 py-2 rounded-lg hover:bg-gray-100 font-bold text-gray-900 transition-colors text-sm"
                      >
                        直播前选品
                      </Link>
                      <Link
                        href="https://www.kdocs.cn/wo/sl/v129vGIo"
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setDropdownOpen(false)}
                        className="block w-full text-left px-3 py-2 rounded-lg hover:bg-gray-100 font-bold text-gray-900 transition-colors text-sm"
                      >
                        出入库
                      </Link>
                      <Link
                        href="https://www.kdocs.cn/wo/sl/v13w0pRp"
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setDropdownOpen(false)}
                        className="block w-full text-left px-3 py-2 rounded-lg hover:bg-gray-100 font-bold text-gray-900 transition-colors text-sm"
                      >
                        总仪表
                      </Link>
                    </div>
                  </motion.div>
                )}
              </div>
            </div>
            
            <p className="text-sm lg:text-lg font-medium text-gray-700 mb-6 lg:mb-8 ml-1">
              高效管理您的电商库存、推广链接、财务报表和账号运营
            </p>
            
            {/* 桌面端按钮 */}
            <div className="relative hidden lg:inline-block">
              <button
                onClick={() => setDropdownOpenDesktop(!dropdownOpenDesktop)}
                className="neo-btn neo-btn-primary flex items-center gap-2 px-8 py-4"
              >
                <Table className="h-5 w-5" />
                点冰出入库表
                <ChevronDown className={`h-4 w-4 transition-transform ${dropdownOpenDesktop ? "rotate-180" : ""}`} />
              </button>
              
              {dropdownOpenDesktop && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="absolute top-full left-0 mt-2 w-full rounded-xl border-[3px] border-gray-900 bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] z-50"
                >
                  <div className="p-2">
                    <Link
                      href="https://www.kdocs.cn/wo/sl/v12CnUqU"
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setDropdownOpenDesktop(false)}
                      className="block w-full text-left px-4 py-3 rounded-lg hover:bg-gray-100 font-bold text-gray-900 transition-colors"
                    >
                      直播前选品
                    </Link>
                    <Link
                      href="https://www.kdocs.cn/wo/sl/v129vGIo"
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setDropdownOpenDesktop(false)}
                      className="block w-full text-left px-4 py-3 rounded-lg hover:bg-gray-100 font-bold text-gray-900 transition-colors"
                    >
                      出入库
                    </Link>
                    <Link
                      href="https://www.kdocs.cn/wo/sl/v13w0pRp"
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setDropdownOpenDesktop(false)}
                      className="block w-full text-left px-4 py-3 rounded-lg hover:bg-gray-100 font-bold text-gray-900 transition-colors"
                    >
                      总仪表
                    </Link>
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>

          {/* Right Image */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="flex justify-center lg:justify-end"
          >
            <div className="relative w-[280px] sm:w-[380px] lg:w-[500px] h-[300px] sm:h-[420px] lg:h-[540px]">
              <img
                src="/images/girl%201.png"
                alt="Girl body"
                className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full h-auto object-contain"
              />
              
              <motion.div
                animate={{ rotate: [-3, 3, -3] }}
                transition={{ 
                  duration: 2, 
                  repeat: Infinity, 
                  ease: "easeInOut" 
                }}
                style={{ transformOrigin: "bottom bottom" }}
                className="absolute top-1 sm:top-2 lg:top-4 left-1/2 -translate-x-1/2 w-full"
              >
                <img
                  src="/images/girl%202.png"
                  alt="Girl head"
                  className="w-full h-auto object-contain"
                />
              </motion.div>
              
              <motion.div
                animate={{ rotate: [-15, 15, -15] }}
                transition={{ 
                  duration: 1.8, 
                  repeat: Infinity, 
                  ease: "easeInOut" 
                }}
                style={{ transformOrigin: "bottom center" }}
                className="absolute bottom-[1px] right-[20px] sm:right-[30px] lg:right-[40px] w-[110px] sm:w-[150px] lg:w-[200px]"
              >
                <img
                  src="/images/girl%203.png"
                  alt="Girl hand"
                  className="w-full h-auto object-contain"
                />
              </motion.div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6 mb-8 lg:mb-10">
        {/* Revenue Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="lg:col-span-2"
        >
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <CardTitle>营收趋势</CardTitle>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={fetchData}
                    disabled={loading}
                    className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-gray-600 hover:text-gray-900 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${loading ? "animate-spin" : ""}`} />
                    {loading ? "刷新中..." : "刷新"}
                  </button>
                  <span className="flex items-center gap-1 text-xs sm:text-sm font-bold">
                    <span className="h-2.5 w-2.5 sm:h-3 sm:w-3 rounded-full bg-[#FF6B7A] border-[2px] border-gray-900" />
                    营收
                  </span>
                  <span className="flex items-center gap-1 text-xs sm:text-sm font-bold">
                    <span className="h-2.5 w-2.5 sm:h-3 sm:w-3 rounded-full bg-[#4A90E2] border-[2px] border-gray-900" />
                    成本
                  </span>
                  <span className="flex items-center gap-1 text-xs sm:text-sm font-bold">
                    <span className="h-2.5 w-2.5 sm:h-3 sm:w-3 rounded-full bg-[#4CD964] border-[2px] border-gray-900" />
                    库存
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="h-[250px] sm:h-[300px] flex items-center justify-center">
                  <RefreshCw className="h-8 w-8 text-gray-400 animate-spin" />
                </div>
              ) : error ? (
                <div className="h-[250px] sm:h-[300px] flex items-center justify-center text-red-500 font-bold">
                  {error}
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={250}>
                  <AreaChart data={salesData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fontWeight: 700 }} />
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
                      dataKey="sales"
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
                      dataKey="inventory"
                      stroke="#4CD964"
                      fill="#4CD964"
                      fillOpacity={0.2}
                      strokeWidth={3}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Top Products */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <Card>
            <CardHeader>
              <CardTitle>热销商品</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 lg:space-y-4">
              {topProductsData.map((product, i) => (
                <div
                  key={product.name}
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center gap-2 lg:gap-3">
                    <div className="flex h-7 w-7 lg:h-9 lg:w-9 items-center justify-center rounded-lg border-[3px] border-gray-900 bg-gray-100 text-xs lg:text-sm font-extrabold">
                      {i + 1}
                    </div>
                    <div>
                      <p className="text-xs lg:text-sm font-bold text-gray-900 truncate max-w-[120px] lg:max-w-[160px]">
                        {product.name}
                      </p>
                      <p className="text-[10px] lg:text-xs font-medium text-gray-500">
                        库存: {product.stock}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {product.trend === "up" ? (
                      <TrendingUp className="h-3 w-3 lg:h-4 lg:w-4 text-green-600" />
                    ) : (
                      <TrendingDown className="h-3 w-3 lg:h-4 lg:w-4 text-red-500" />
                    )}
                    <span className="text-xs lg:text-sm font-bold text-gray-900">
                      {product.sales}
                    </span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Bottom Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
        {/* Sales Bar Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          <Card>
            <CardHeader>
              <CardTitle>销售渠道分布</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart
                  data={[
                    { name: "淘宝", value: 45 },
                    { name: "京东", value: 30 },
                    { name: "拼多多", value: 15 },
                    { name: "抖音", value: 25 },
                    { name: "小红书", value: 20 },
                  ]}
                >
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
                  <Bar
                    dataKey="value"
                    fill="#FFC93C"
                    stroke="#171717"
                    strokeWidth={3}
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>

        {/* Recent Activities */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
        >
          <Card>
            <CardHeader>
              <CardTitle>最近动态</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {recentActivities.map((activity) => {
                const typeColors: Record<string, string> = {
                  add: "bg-[#4CD964]",
                  update: "bg-[#4A90E2]",
                  order: "bg-[#FFC93C]",
                  warning: "bg-[#FF6B7A]",
                  post: "bg-[#7B61FF]",
                };
                return (
                  <div
                    key={activity.detail + activity.time}
                    className="flex items-start gap-3"
                  >
                    <div
                      className={`mt-1 h-3 w-3 rounded-full border-[2px] border-gray-900 ${
                        typeColors[activity.type]
                      }`}
                    />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-gray-900">
                          {activity.action}
                        </span>
                        <span className="text-xs font-medium text-gray-400">
                          {activity.time}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-gray-600">
                        {activity.detail}
                      </p>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </PageWrapper>
  );
}
