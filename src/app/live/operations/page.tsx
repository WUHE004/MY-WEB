"use client";

import { motion } from "framer-motion";
import { ArrowLeft, TrendingUp, Radio, Clapperboard } from "lucide-react";
import { PageWrapper } from "@/components/page-wrapper";
import Link from "next/link";

const operationButtons = [
  { label: "赛道资讯", desc: "童装母婴赛道每日热门话题/主播/运营参考", icon: TrendingUp, color: "bg-[#4A90E2]", href: "/live/track-news" },
  { label: "直播资讯", desc: "拉取抖音直播间每场数据(下单/留人/话术)", icon: Radio, color: "bg-[#9B59B6]", href: "/live/sessions" },
  { label: "拍摄脚本", desc: "AI 生成童装抖音拍摄分镜脚本", icon: Clapperboard, color: "bg-[#FFC93C]", href: "/live/shoot-script" },
];

export default function LiveOperationsPage() {
  return (
    <PageWrapper>
      {/* 返回入口 + 标题 */}
      <div className="mb-6 lg:mb-8">
        <Link href="/links" className="inline-flex items-center gap-2 text-sm lg:text-base text-gray-600 hover:text-gray-900 mb-3 font-medium">
          <ArrowLeft className="h-4 w-4" /> 返回操作台
        </Link>
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-gray-900 mb-2">
          <span className="highlight-pink">直播运营操作台</span>
        </h1>
        <p className="text-sm lg:text-lg text-gray-600 font-medium">
          赛道资讯 · 直播数据 · 拍摄脚本
        </p>
      </div>

      {/* 三个子按钮卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 lg:gap-6">
        {operationButtons.map((btn, index) => (
          <motion.a
            key={btn.label}
            href={btn.href}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.1 }}
            className={`neo-card flex flex-col items-start gap-2 lg:gap-3 p-4 lg:p-8 cursor-pointer hover:-translate-y-1 transition-all ${btn.color}`}
            style={{ boxShadow: "4px 4px 0px 0px rgba(0,0,0,1)" }}
          >
            <btn.icon className="h-8 w-8 lg:h-10 lg:w-10 text-white" />
            <span className="text-base lg:text-xl font-extrabold text-white">{btn.label}</span>
            <span className="text-xs lg:text-sm text-white/90 font-medium leading-snug">{btn.desc}</span>
          </motion.a>
        ))}
      </div>
    </PageWrapper>
  );
}
