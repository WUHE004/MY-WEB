"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useState, useEffect } from "react";
import {
  Package,
  User,
  Monitor,
  RefreshCw,
  LogIn,
  ShoppingBag,
  Flame,
  ShoppingCart,
  Edit3,
  X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageWrapper } from "@/components/page-wrapper";

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
  const [imgPreview, setImgPreview] = useState<string | null>(null);
  const [memberName, setMemberName] = useState<string | null>(null);
  const [memberRole, setMemberRole] = useState<string | null>(null);
  const [hotProducts, setHotProducts] = useState<Array<{sale_id: string; name: string; total_sold: number; sell_price: number; photo: string; manufacturer: string}>>([]);
  const [availableSaleIds, setAvailableSaleIds] = useState<Set<string>>(new Set());
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    const name = localStorage.getItem("member_name");
    const role = localStorage.getItem("member_role");
    setMemberName(name);
    setMemberRole(role);

    // 监听 PWA 安装事件
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  const fetchHotProducts = async () => {
    try {
      const res = await fetch("/api/sales-summary");
      const data = await res.json();
      if (Array.isArray(data)) {
        const top10 = data
          .sort((a: {total_sold?: number}, b: {total_sold?: number}) => (b.total_sold || 0) - (a.total_sold || 0))
          .slice(0, 10)
          .map((s: {sale_id: string; name?: string; total_sold?: number; sell_price?: number; manufacturer?: string; photo?: string}) => ({
            sale_id: s.sale_id,
            name: s.name || s.sale_id,
            total_sold: s.total_sold || 0,
            sell_price: s.sell_price || 0,
            photo: s.photo || "",
            manufacturer: s.manufacturer || "",
          }));
        setHotProducts(top10);
      }
    } catch (err) {
      console.error("Fetch hot products error:", err);
    }
  };

  useEffect(() => {
    const name = localStorage.getItem("member_name");
    const role = localStorage.getItem("member_role");
    setMemberName(name);
    setMemberRole(role);
    fetchHotProducts();
    fetchAvailableProducts();
  }, []);

  const fetchAvailableProducts = async () => {
    try {
      const res = await fetch("/api/products");
      const data = await res.json();
      if (Array.isArray(data)) {
        setAvailableSaleIds(new Set(data.map((p: { sale_id: string }) => p.sale_id)));
      }
    } catch (err) {
      console.error("Fetch available products error:", err);
    }
  };

  const handleHotProductClick = (saleId: string) => {
    if (availableSaleIds.has(saleId)) {
      window.location.href = `/products?open=${saleId}`;
    } else {
      alert("该商品暂停售卖啦");
    }
  };

  const handleAddToDesktop = async () => {
    // 移动端：使用 PWA 安装提示
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const result = await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      if (result.outcome === "accepted") return;
    }

    // 桌面端：下载 .url 快捷方式文件
    const siteName = "点冰童装";
    const siteUrl = window.location.origin;
    const iconUrl = `${siteUrl}/favicon.ico`;

    const urlContent = `[InternetShortcut]\nURL=${siteUrl}\nIconFile=${iconUrl}\nIconIndex=0`;
    const blob = new Blob([urlContent], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${siteName}.url`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    alert(`已下载"${siteName}.url"快捷方式文件，请将其保存到桌面即可。`);
  };

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
            {/* 固定到桌面 */}
            <div className="flex items-center justify-center gap-2 lg:gap-3">
              <button
                onClick={handleAddToDesktop}
                className="flex items-center gap-2 hover:opacity-80 transition-opacity cursor-pointer"
              >
                <div className="flex flex-col">
                  <span className="text-xs lg:text-sm font-extrabold text-gray-900">点击添加</span>
                  <span className="text-[8px] lg:text-[10px] font-bold text-[#4A90E2]">桌面快捷方式</span>
                </div>
                <div className="flex h-10 w-10 lg:h-12 lg:w-12 items-center justify-center rounded-lg border-[3px] border-gray-900 bg-[#FF6B7A] shrink-0">
                  <Monitor className="h-5 w-5 lg:h-6 lg:w-6 text-white" />
                </div>
              </button>
            </div>

            {/* 用户信息 */}
            <div className="flex items-center justify-center gap-2 lg:gap-3">
              <div className="flex flex-col items-center text-center">
                <span className="text-xs lg:text-sm font-extrabold text-gray-900 truncate max-w-[80px] lg:max-w-[120px]">
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
              <div className="flex h-10 w-10 lg:h-12 lg:w-12 items-center justify-center rounded-lg border-[3px] border-gray-900 bg-[#4A90E2] shrink-0">
                <User className="h-5 w-5 lg:h-6 lg:w-6 text-white" />
              </div>
            </div>

            {/* 登录/个人信息 */}
            {memberName ? (
              <Link
                href="/profile"
                className="flex items-center justify-center gap-2 lg:gap-3 hover:opacity-80 transition-opacity"
              >
                <div className="flex flex-col">
                  <span className="text-xs lg:text-sm font-extrabold text-gray-900 truncate max-w-[80px] lg:max-w-[120px]">
                    {memberName}
                  </span>
                  <span className="text-[8px] lg:text-[10px] font-bold text-[#7B61FF] flex items-center gap-0.5">
                    <Edit3 className="h-3 w-3" />
                    个人信息
                  </span>
                </div>
                <div className="flex h-10 w-10 lg:h-12 lg:w-12 items-center justify-center rounded-lg border-[3px] border-gray-900 bg-[#7B61FF] shrink-0">
                  <Edit3 className="h-5 w-5 lg:h-6 lg:w-6 text-white" />
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
                  <span className="text-xs lg:text-sm font-extrabold text-gray-900">
                    登录
                  </span>
                  <span className="text-[8px] lg:text-[10px] font-bold text-[#7B61FF]">
                    注册/登录
                  </span>
                </div>
                <div className="flex h-10 w-10 lg:h-12 lg:w-12 items-center justify-center rounded-lg border-[3px] border-gray-900 bg-[#7B61FF] shrink-0">
                  <LogIn className="h-5 w-5 lg:h-6 lg:w-6 text-white" />
                </div>
              </Link>
            )}
          </div>
        </div>
      </motion.div>

      {/* Hero Section */}
      <section className="mb-10 lg:mb-16">
        <div className="flex flex-col lg:grid lg:grid-cols-2 gap-6 lg:gap-12 items-center">
          {/* Left Content */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            className="order-1 lg:order-1"
          >
            <div className="flex flex-col lg:flex-row lg:items-end gap-3 lg:gap-4 mb-3 mt-6 lg:mt-0">
              <div className="flex-shrink-0">
                <h1 className="text-4xl sm:text-5xl lg:text-7xl font-extrabold text-gray-900 leading-[1.1] whitespace-nowrap">
                  <span className="inline-block text-3xl sm:text-4xl lg:text-[60px] align-bottom">欢迎来到</span>
                  <span className="inline-block bg-[#FF6B7A] text-white px-2 lg:px-3 py-0.5 lg:py-1 mx-1 text-5xl sm:text-6xl lg:text-[100px] align-bottom">
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
            </div>
            
            <p className="text-sm lg:text-lg font-medium text-gray-700 mb-6 lg:mb-8 ml-1 mt-4 lg:mt-0">
              粉丝群里的商品都可以在这里选购哦
            </p>
            
            {/* 手机端按钮 - 移到 p 下面 */}
            <div className="lg:hidden flex justify-center mb-8">
              <Link
                href="/products"
                className="neo-btn neo-btn-primary flex items-center gap-2 px-10 py-2.5 text-sm w-full max-w-xs"
              >
                <ShoppingCart className="h-4 w-4" />
                去选购吧
              </Link>
            </div>
            
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

          {/* Right Image - 竖屏模式排在第二位 */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="flex justify-center order-2 lg:order-2 lg:justify-end lg:mt-0 mt-8"
          >
            <div className="relative w-[320px] sm:w-[420px] lg:w-[500px] h-[340px] sm:h-[460px] lg:h-[540px]">
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
                className="absolute bottom-[1px] right-[20px] sm:right-[30px] lg:right-[40px] w-[120px] sm:w-[170px] lg:w-[200px]"
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
                  {hotProducts.length === 0 ? (
                    <div className="w-full flex items-center justify-center py-8">
                      <p className="text-sm text-gray-400 font-bold">加载中...</p>
                    </div>
                  ) : (
                    hotProducts.map((product, idx) => (
                      <button
                        key={product.sale_id}
                        onClick={() => handleHotProductClick(product.sale_id)}
                        className="w-full lg:w-[200px] lg:flex-shrink-0 rounded-xl border-[3px] border-gray-900 bg-white overflow-hidden shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-1 transition-all block text-left cursor-pointer"
                      >
                        <div className="h-[120px] sm:h-[140px] lg:h-[160px] bg-gray-100 flex items-center justify-center">
                          {product.photo ? (
                            <img src={product.photo} alt="" className="w-full h-full object-cover cursor-pointer" onClick={() => setImgPreview(product.photo)} />
                          ) : (
                            <Package className="h-10 w-10 text-gray-300" />
                          )}
                        </div>
                        <div className="p-3">
                          <div className="flex items-center gap-1 mb-1">
                            <span className={`inline-flex items-center justify-center h-4 w-4 rounded-full text-[8px] font-extrabold text-white ${
                              idx === 0 ? "bg-[#FF6B7A]" : idx === 1 ? "bg-[#FFC93C]" : idx === 2 ? "bg-[#4A90E2]" : "bg-gray-400"
                            }`}>{idx + 1}</span>
                            <p className="text-xs sm:text-sm font-extrabold text-gray-900 truncate">{product.name}</p>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs sm:text-sm font-extrabold text-[#FF6B7A]">
                              ¥{product.sell_price}
                            </span>
                          </div>
                          <div className="mt-1.5 flex items-center gap-1 text-[10px] font-bold text-gray-400">
                            <ShoppingBag className="h-3 w-3" />
                            已售 {product.total_sold}
                          </div>
                        </div>
                      </button>
                    ))
                  )}
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
      {/* 图片大图预览 */}
      <div
        className={`fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 transition-opacity duration-150 ${imgPreview ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
        onClick={() => setImgPreview(null)}
      >
        <div className="relative max-w-[90vw] max-h-[90vh]">
          <button onClick={() => setImgPreview(null)} className="absolute -top-3 -right-3 z-10 w-8 h-8 bg-white rounded-full border-[3px] border-gray-900 flex items-center justify-center shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:bg-gray-100">
            <X className="h-4 w-4" />
          </button>
          {imgPreview && <img src={imgPreview} alt="" className="max-w-full max-h-[90vh] rounded-xl border-[3px] border-gray-900 object-contain bg-white" />}
        </div>
      </div>
      </div>
    </PageWrapper>
  );
}
