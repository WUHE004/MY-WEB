"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useState, useEffect } from "react";
import {
  Package,
  User,
  ArrowUpRight,
  RefreshCw,
  LogIn,
  ShoppingBag,
  Flame,
  ShoppingCart,
  Edit3,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageWrapper } from "@/components/page-wrapper";

const hotProducts = [
  { id: 1, name: "夏季短袖T恤", image: "/images/product-1.png", stock: 180, price: 49.9, sold: 342 },
  { id: 2, name: "儿童运动裤", image: "/images/product-2.png", stock: 150, price: 59.9, sold: 289 },
  { id: 3, name: "女童连衣裙", image: "/images/product-3.png", stock: 20, price: 89.9, sold: 256 },
  { id: 4, name: "男童卫衣套装", image: "/images/product-4.png", stock: 95, price: 79.9, sold: 198 },
  { id: 5, name: "婴儿连体衣", image: "/images/product-5.png", stock: 230, price: 39.9, sold: 176 },
  { id: 6, name: "儿童羽绒服", image: "/images/product-6.png", stock: 45, price: 199.9, sold: 165 },
  { id: 7, name: "亲子装T恤", image: "/images/product-7.png", stock: 78, price: 69.9, sold: 148 },
  { id: 8, name: "儿童牛仔裤", image: "/images/product-8.png", stock: 120, price: 55.9, sold: 132 },
  { id: 9, name: "女童裙子套装", image: "/images/product-9.png", stock: 33, price: 99.9, sold: 115 },
  { id: 10, name: "儿童睡衣套装", image: "/images/product-10.png", stock: 210, price: 45.9, sold: 102 },
];

const recentOrders = [
  { id: "DD20240601001", product: "夏季短袖T恤 x2", customer: "张女士", amount: "¥99.80", time: "2分钟前", status: "已发货" },
  { id: "DD20240531002", product: "儿童运动裤 x1", customer: "李先生", amount: "¥59.90", time: "15分钟前", status: "待发货" },
  { id: "DD20240531003", product: "女童连衣裙 x1", customer: "王女士", amount: "¥89.90", time: "32分钟前", status: "已完成" },
  { id: "DD20240531004", product: "男童卫衣套装 x2", customer: "赵先生", amount: "¥159.80", time: "1小时前", status: "已发货" },
  { id: "DD20240530005", product: "婴儿连体衣 x3", customer: "刘女士", amount: "¥119.70", time: "2小时前", status: "已完成" },
  { id: "DD20240530006", product: "儿童羽绒服 x1", customer: "陈女士", amount: "¥199.90", time: "3小时前", status: "待发货" },
  { id: "DD20240530007", product: "亲子装T恤 x2", customer: "孙先生", amount: "¥139.80", time: "5小时前", status: "已完成" },
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
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [memberName, setMemberName] = useState<string | null>(null);
  const [memberRole, setMemberRole] = useState<string | null>(null);

  useEffect(() => {
    const name = localStorage.getItem("member_name");
    const role = localStorage.getItem("member_role");
    setMemberName(name);
    setMemberRole(role);
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const accessToken = typeof window !== "undefined" ? localStorage.getItem("wps_access_token") : null;
      const url = accessToken 
        ? `/api/wps-data?access_token=${encodeURIComponent(accessToken)}` 
        : "/api/wps-data";
      const response = await fetch(url);
      const result = await response.json();
      setData(result);
    } catch (err) {
      console.error("Error fetching data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const roleLabel: Record<string, string> = {
    admin: "管理员",
    operator: "后台操作",
    customer: "顾客",
  };
  const roleColor: Record<string, string> = {
    admin: "bg-[#FF6B7A]",
    operator: "bg-[#FFC93C]",
    customer: "bg-[#4A90E2]",
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
          <div className="grid grid-cols-3 items-center gap-2 lg:gap-0">
            {/* 总商品数 */}
            <div className="flex items-center justify-center gap-2 lg:gap-3">
              <div className="flex flex-col">
                <span className="text-[10px] lg:text-xs font-bold text-gray-500">总商品数</span>
                <span className="text-base lg:text-lg font-extrabold text-gray-900">1,284</span>
                <div className="flex items-center gap-0.5">
                  <ArrowUpRight className="h-3 w-3 text-green-600" />
                  <span className="text-[10px] lg:text-xs font-bold text-green-600">+12.5%</span>
                </div>
              </div>
              <div className="flex h-8 w-8 lg:h-10 lg:w-10 items-center justify-center rounded-lg border-[3px] border-gray-900 bg-[#FF6B7A] shrink-0">
                <Package className="h-4 w-4 lg:h-5 lg:w-5 text-white" />
              </div>
            </div>

            {/* 用户信息 */}
            <div className="flex items-center justify-center gap-2 lg:gap-3">
              <div className="flex flex-col items-center text-center">
                <span className="text-sm lg:text-base font-extrabold text-gray-900 truncate max-w-[80px] lg:max-w-[120px]">
                  {memberName || "游客"}
                </span>
                {memberName && memberRole ? (
                  <span className={`text-[10px] lg:text-xs font-bold text-white px-2 py-0.5 rounded-full mt-0.5 ${roleColor[memberRole] || "bg-gray-400"}`}>
                    {roleLabel[memberRole] || memberRole}
                  </span>
                ) : (
                  <span className="text-[10px] lg:text-xs font-bold text-gray-400 mt-0.5">
                    未登录
                  </span>
                )}
              </div>
              <div className="flex h-8 w-8 lg:h-10 lg:w-10 items-center justify-center rounded-lg border-[3px] border-gray-900 bg-[#4A90E2] shrink-0">
                <User className="h-4 w-4 lg:h-5 lg:w-5 text-white" />
              </div>
            </div>

            {/* 登录/个人信息 */}
            {memberName ? (
              <Link
                href="/profile"
                className="flex items-center justify-center gap-2 lg:gap-3 hover:opacity-80 transition-opacity"
              >
                <div className="flex flex-col">
                  <span className="text-[10px] lg:text-xs font-bold text-gray-500">
                    {memberName}
                  </span>
                  <span className="text-base lg:text-lg font-extrabold text-gray-900">
                    完善信息
                  </span>
                  <span className="text-[10px] lg:text-xs font-bold text-[#7B61FF] flex items-center gap-0.5">
                    <Edit3 className="h-3 w-3" />
                    个人信息
                  </span>
                </div>
                <div className="flex h-8 w-8 lg:h-10 lg:w-10 items-center justify-center rounded-lg border-[3px] border-gray-900 bg-[#7B61FF] shrink-0">
                  <Edit3 className="h-4 w-4 lg:h-5 lg:w-5 text-white" />
                </div>
              </Link>
            ) : (
              <Link
                href="/login"
                className="flex items-center justify-center gap-2 lg:gap-3 hover:opacity-80 transition-opacity"
              >
                <div className="flex flex-col">
                  <span className="text-[10px] lg:text-xs font-bold text-gray-500">
                    账户
                  </span>
                  <span className="text-base lg:text-lg font-extrabold text-gray-900">
                    登录
                  </span>
                  <span className="text-[10px] lg:text-xs font-bold text-[#7B61FF]">
                    注册/登录
                  </span>
                </div>
                <div className="flex h-8 w-8 lg:h-10 lg:w-10 items-center justify-center rounded-lg border-[3px] border-gray-900 bg-[#7B61FF] shrink-0">
                  <LogIn className="h-4 w-4 lg:h-5 lg:w-5 text-white" />
                </div>
              </Link>
            )}
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
                  <span className="inline-block text-2xl sm:text-4xl lg:text-[60px] align-bottom">欢迎来到</span>
                  <span className="inline-block bg-[#FF6B7A] text-white px-2 lg:px-3 py-0.5 lg:py-1 mx-1 text-4xl sm:text-6xl lg:text-[100px] align-bottom">
                    点冰童装
                  </span>
                </h1>
                <h2 className="mt-2 whitespace-nowrap flex items-baseline">
                  <span className="inline-block bg-[#4A90E2] text-white px-2 lg:px-3 py-0.5 lg:py-1 mx-1 text-4xl sm:text-6xl lg:text-[6rem] font-extrabold leading-none">
                    选购前
                  </span>
                  <span className="text-4xl sm:text-6xl lg:text-[85px] font-extrabold text-gray-900">登录哦</span>
                </h2>
              </div>
              
              {/* 手机端按钮 */}
              <div className="lg:hidden mt-2">
                <Link
                  href="/products"
                  className="neo-btn neo-btn-primary flex items-center gap-2 px-5 py-2.5 text-sm"
                >
                  <ShoppingCart className="h-4 w-4" />
                  去选购吧
                </Link>
              </div>
            </div>
            
            <p className="text-sm lg:text-lg font-medium text-gray-700 mb-6 lg:mb-8 ml-1">
              粉丝群里的商品都可以在这里选购哦
            </p>
            
            {/* 桌面端按钮 */}
            <div className="hidden lg:inline-block">
              <Link
                href="/products"
                className="neo-btn neo-btn-primary flex items-center gap-2 px-8 py-4"
              >
                <ShoppingCart className="h-5 w-5" />
                去选购吧
              </Link>
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
                className="w-full"
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 mb-8 lg:mb-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Flame className="h-5 w-5 text-[#FF6B7A]" />
                  热卖爆款
                </CardTitle>
                <button
                  onClick={fetchData}
                  disabled={loading}
                  className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-gray-600 hover:text-gray-900 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${loading ? "animate-spin" : ""}`} />
                  {loading ? "刷新中..." : "刷新"}
                </button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="lg:overflow-x-auto lg:pb-2">
                <div className="grid grid-cols-2 gap-3 lg:flex lg:min-w-max lg:gap-3">
                  {hotProducts.map((product) => (
                    <div
                      key={product.id}
                      className="w-full lg:w-[200px] lg:flex-shrink-0 rounded-xl border-[3px] border-gray-900 bg-white overflow-hidden shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-1 transition-all"
                    >
                      <div className="h-[120px] sm:h-[140px] lg:h-[160px] bg-gray-100 flex items-center justify-center">
                        <img
                          src={product.image}
                          alt={product.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = "none";
                            const parent = target.parentElement;
                            if (parent && !parent.querySelector(".fallback")) {
                              const fallback = document.createElement("div");
                              fallback.className = "fallback flex items-center justify-center w-full h-full";
                              fallback.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-gray-300"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><circle cx="12" cy="8" r="5"/></svg>`;
                              parent.appendChild(fallback);
                            }
                          }}
                        />
                      </div>
                      <div className="p-3">
                        <p className="text-xs sm:text-sm font-extrabold text-gray-900 truncate mb-1.5">
                          {product.name}
                        </p>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] sm:text-xs font-bold text-gray-500">
                            库存: {product.stock}
                          </span>
                          <span className="text-xs sm:text-sm font-extrabold text-[#FF6B7A]">
                            ¥{product.price}
                          </span>
                        </div>
                        <div className="mt-1.5 flex items-center gap-1 text-[10px] font-bold text-gray-400">
                          <ShoppingBag className="h-3 w-3" />
                          已售 {product.sold}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <Card className="h-[400px] flex flex-col">
            <CardHeader>
              <CardTitle>最近订单</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden">
              <div className="space-y-3 h-full overflow-y-auto">
                {recentOrders.map((order) => {
                  const statusColors: Record<string, string> = {
                    "已发货": "bg-[#4A90E2]",
                    "待发货": "bg-[#FFC93C]",
                    "已完成": "bg-[#4CD964]",
                  };
                  return (
                    <div
                      key={order.id}
                      className="flex items-center justify-between p-3 rounded-xl border-[2px] border-gray-200 hover:border-gray-900 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-bold text-gray-400">
                            {order.id}
                          </span>
                          <span className={`text-[10px] font-bold text-white px-1.5 py-0.5 rounded ${statusColors[order.status] || "bg-gray-400"}`}>
                            {order.status}
                          </span>
                        </div>
                        <p className="text-xs sm:text-sm font-bold text-gray-900 truncate">
                          {order.product}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] font-medium text-gray-500">
                            {order.customer}
                          </span>
                          <span className="text-[10px] font-bold text-gray-400">
                            {order.time}
                          </span>
                        </div>
                      </div>
                      <span className="text-sm font-extrabold text-gray-900 ml-3 shrink-0">
                        {order.amount}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </PageWrapper>
  );
}
