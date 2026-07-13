"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  PackagePlus,
  ShoppingCart,
  Undo2,
  Box,
  Image,
  Rows4,
  Banknote,
  TrendingUp,
  Video,
  Radio,
  Clapperboard,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PageWrapper } from "@/components/page-wrapper";
import Link from "next/link";

interface Stats {
  inboundCount: number;
  salesCount: number;
  returnCount: number;
}

interface LinkData {
  latest_shipping_fee: number;
  latest_platform_fee: number;
  latest_date: string;
  selected_count: number;
}

export default function LinksPage() {
  const [stats, setStats] = useState<Stats>({ inboundCount: 0, salesCount: 0, returnCount: 0 });
  const [linkData, setLinkData] = useState<LinkData>({
    latest_shipping_fee: 0,
    latest_platform_fee: 0,
    latest_date: "",
    selected_count: 0,
  });
  const [loading, setLoading] = useState(true);
  const [isOperator, setIsOperator] = useState(false);

  useEffect(() => {
    const role = localStorage.getItem("member_role") || "";
    setIsOperator(role === "operator");
    fetchStats();
    fetchLinkData();

    // 每 5 秒刷新选品数量
    const interval = setInterval(() => {
      fetchLinkData();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchStats = async () => {
    try {
      const res = await fetch("/api/stats");
      const data = await res.json();
      if (!data.error) {
        setStats(data);
      }
    } catch (err) {
      console.error("Fetch stats error:", err);
    }
  };

  const fetchLinkData = async () => {
    try {
      const res = await fetch("/api/links");
      const data = await res.json();
      if (!data.error) {
        setLinkData(data);
      }
    } catch (err) {
      console.error("Fetch link data error:", err);
    } finally {
      setLoading(false);
    }
  };

  const operationButtons = [
    { label: "打包找货", icon: Box, color: "bg-[#4A90E2]", href: "/operations/pack" },
    { label: "照片生成", icon: Image, color: "bg-[#9B59B6]", href: "/operations/photo-gen" },
    { label: "入库调整", icon: Rows4, color: "bg-[#FFC93C]", href: "/operations/adjust" },
  ];

  return (
    <PageWrapper>
      {/* Header */}
      <div className="mb-6 lg:mb-8">
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-gray-900 mb-2">
          <span className="highlight-yellow">库存操作台</span>
        </h1>
        <p className="text-sm lg:text-lg text-gray-600 font-medium">
          商品出入库总操作台
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 lg:gap-6 mb-6 lg:mb-8">
        <Link href="/operations/inbound">
          <Card className="cursor-pointer hover:-translate-y-1 transition-all" style={{ boxShadow: "4px 4px 0px 0px rgba(0,0,0,1)" }}>
            <CardContent className="p-3 lg:p-6 flex items-center justify-between">
              <div>
                <p className="text-[10px] lg:text-sm font-bold text-gray-500">入库登记</p>
                <p className="text-lg lg:text-3xl font-extrabold">
                  {loading ? "..." : stats.inboundCount.toLocaleString()}
                </p>
                <p className="text-[10px] lg:text-xs text-gray-400 font-medium">款</p>
              </div>
              <div className="flex h-8 w-8 lg:h-12 lg:w-12 items-center justify-center rounded-lg lg:rounded-xl border-[3px] border-gray-900 bg-[#4A90E2]">
                <PackagePlus className="h-4 w-4 lg:h-6 lg:w-6 text-white" />
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/operations/sales">
          <Card className="cursor-pointer hover:-translate-y-1 transition-all" style={{ boxShadow: "4px 4px 0px 0px rgba(0,0,0,1)" }}>
            <CardContent className="p-3 lg:p-6 flex items-center justify-between">
              <div>
                <p className="text-[10px] lg:text-sm font-bold text-gray-500">售卖登记</p>
                <p className="text-lg lg:text-3xl font-extrabold">
                  {loading ? "..." : stats.salesCount.toLocaleString()}
                </p>
                <p className="text-[10px] lg:text-xs text-gray-400 font-medium">单</p>
              </div>
              <div className="flex h-8 w-8 lg:h-12 lg:w-12 items-center justify-center rounded-lg lg:rounded-xl border-[3px] border-gray-900 bg-[#FFC93C]">
                <ShoppingCart className="h-4 w-4 lg:h-6 lg:w-6 text-gray-900" />
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/operations/returns">
        <Card className="cursor-pointer hover:-translate-y-1 transition-all" style={{ boxShadow: "4px 4px 0px 0px rgba(0,0,0,1)" }}>
          <CardContent className="p-3 lg:p-6 flex items-center justify-between">
            <div>
              <p className="text-[10px] lg:text-sm font-bold text-gray-500">退货登记</p>
              <p className="text-lg lg:text-3xl font-extrabold">
                {loading ? "..." : stats.returnCount.toLocaleString()}
              </p>
              <p className="text-[10px] lg:text-xs text-gray-400 font-medium">单</p>
            </div>
            <div className="flex h-8 w-8 lg:h-12 lg:w-12 items-center justify-center rounded-lg lg:rounded-xl border-[3px] border-gray-900 bg-[#4CD964]">
              <Undo2 className="h-4 w-4 lg:h-6 lg:w-6 text-white" />
            </div>
          </CardContent>
        </Card>
        </Link>
      </div>

      {/* Operation Buttons */}
      <div className="grid grid-cols-3 gap-3 lg:gap-6 mb-6 lg:mb-8">
        {operationButtons.map((btn, index) => (
          <motion.a
            key={btn.label}
            href={btn.href}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.1 }}
            className={`neo-card flex flex-col items-center justify-center gap-2 lg:gap-3 p-4 lg:p-8 cursor-pointer hover:-translate-y-1 transition-all ${btn.color}`}
            style={{ boxShadow: "4px 4px 0px 0px rgba(0,0,0,1)" }}
          >
            <btn.icon className="h-6 w-6 lg:h-10 lg:w-10 text-white" />
            <span className="text-xs lg:text-base font-extrabold text-white">{btn.label}</span>
          </motion.a>
        ))}
      </div>

      {/* 后台操作台 - 仅管理员可见 */}
      {!isOperator && (
      <div className="mb-6 lg:mb-8">
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-gray-900 mb-2">
          <span className="highlight-blue">后台操作台</span>
        </h1>
        <p className="text-sm lg:text-lg text-gray-600 font-medium mb-3 lg:mb-4">
          管理平台费用和直播选品
        </p>
        <div className="grid grid-cols-3 gap-3 lg:gap-6">
          <Link href="/finance/shipping">
            <Card className="cursor-pointer hover:-translate-y-1 transition-all" style={{ boxShadow: "4px 4px 0px 0px rgba(0,0,0,1)" }}>
              <CardContent className="p-3 lg:p-6 flex items-center justify-between">
                <div>
                  <p className="text-[10px] lg:text-sm font-bold text-gray-500">快递费用</p>
                  <p className="text-lg lg:text-3xl font-extrabold text-[#4A90E2]">
                    {loading ? "..." : `¥${linkData.latest_shipping_fee.toFixed(0)}`}
                  </p>
                  <p className="text-[10px] lg:text-xs text-gray-400 font-medium">
                    {linkData.latest_date ? `${linkData.latest_date} 快递费` : "管理运费"}
                  </p>
                </div>
                <div className="flex h-8 w-8 lg:h-12 lg:w-12 items-center justify-center rounded-lg lg:rounded-xl border-[3px] border-gray-900 bg-[#4A90E2]">
                  <Banknote className="h-4 w-4 lg:h-6 lg:w-6 text-white" />
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/finance/platform-fee">
            <Card className="cursor-pointer hover:-translate-y-1 transition-all" style={{ boxShadow: "4px 4px 0px 0px rgba(0,0,0,1)" }}>
              <CardContent className="p-3 lg:p-6 flex items-center justify-between">
                <div>
                  <p className="text-[10px] lg:text-sm font-bold text-gray-500">平台抽点</p>
                  <p className="text-lg lg:text-3xl font-extrabold text-[#FF6B7A]">
                    {loading ? "..." : `¥${linkData.latest_platform_fee.toFixed(0)}`}
                  </p>
                  <p className="text-[10px] lg:text-xs text-gray-400 font-medium">
                    {linkData.latest_date ? `${linkData.latest_date} 抽点` : "统计抽成"}
                  </p>
                </div>
                <div className="flex h-8 w-8 lg:h-12 lg:w-12 items-center justify-center rounded-lg lg:rounded-xl border-[3px] border-gray-900 bg-[#FF6B7A]">
                  <TrendingUp className="h-4 w-4 lg:h-6 lg:w-6 text-white" />
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/live/select">
            <Card className="cursor-pointer hover:-translate-y-1 transition-all" style={{ boxShadow: "4px 4px 0px 0px rgba(0,0,0,1)" }}>
              <CardContent className="p-3 lg:p-6 flex items-center justify-between">
                <div>
                  <p className="text-[10px] lg:text-sm font-bold text-gray-500">直播选品</p>
                  <p className="text-lg lg:text-3xl font-extrabold text-[#FFC93C]">
                    {loading ? "..." : linkData.selected_count}
                  </p>
                  <p className="text-[10px] lg:text-xs text-gray-400 font-medium">选品多少款</p>
                </div>
                <div className="flex h-8 w-8 lg:h-12 lg:w-12 items-center justify-center rounded-lg lg:rounded-xl border-[3px] border-gray-900 bg-[#FFC93C]">
                  <Video className="h-4 w-4 lg:h-6 lg:w-6 text-gray-900" />
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>
      )}

      {/* 运营操作台 - 仅管理员可见 */}
      {!isOperator && (
      <div className="mb-6 lg:mb-8">
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-gray-900 mb-2">
          <span className="highlight-pink">运营操作台</span>
        </h1>
        <p className="hidden lg:block text-sm lg:text-lg text-gray-600 font-medium mb-3 lg:mb-4">
          赛道资讯 · 直播数据 · 拍摄脚本
        </p>
        <div className="grid grid-cols-3 gap-3 lg:gap-6">
          <motion.a
            href="/live/track-news"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="neo-card flex flex-col items-center justify-center gap-2 lg:gap-3 p-3 lg:p-8 cursor-pointer hover:-translate-y-1 transition-all bg-[#4A90E2]"
            style={{ boxShadow: "4px 4px 0px 0px rgba(0,0,0,1)" }}
          >
            <TrendingUp className="h-5 w-5 lg:h-10 lg:w-10 text-white" />
            <span className="text-xs lg:text-base font-extrabold text-white">赛道资讯</span>
            <span className="hidden lg:block text-xs text-white/90 font-medium">童装母婴赛道每日资讯</span>
          </motion.a>
          <motion.a
            href="/live/sessions"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
            className="neo-card flex flex-col items-center justify-center gap-2 lg:gap-3 p-3 lg:p-8 cursor-pointer hover:-translate-y-1 transition-all bg-[#9B59B6]"
            style={{ boxShadow: "4px 4px 0px 0px rgba(0,0,0,1)" }}
          >
            <Radio className="h-5 w-5 lg:h-10 lg:w-10 text-white" />
            <span className="text-xs lg:text-base font-extrabold text-white">直播资讯</span>
            <span className="hidden lg:block text-xs text-white/90 font-medium">直播间每场数据分析</span>
          </motion.a>
          <motion.a
            href="/live/shoot-script"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.2 }}
            className="neo-card flex flex-col items-center justify-center gap-2 lg:gap-3 p-3 lg:p-8 cursor-pointer hover:-translate-y-1 transition-all bg-[#FFC93C]"
            style={{ boxShadow: "4px 4px 0px 0px rgba(0,0,0,1)" }}
          >
            <Clapperboard className="h-5 w-5 lg:h-10 lg:w-10 text-gray-900" />
            <span className="text-xs lg:text-base font-extrabold text-gray-900">拍摄脚本</span>
            <span className="hidden lg:block text-xs text-gray-800/80 font-medium">AI 生成拍摄分镜脚本</span>
          </motion.a>
        </div>
      </div>
      )}
    </PageWrapper>
  );
}