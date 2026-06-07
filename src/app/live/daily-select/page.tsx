"use client";

import { ArrowLeft, ClipboardCheck } from "lucide-react";
import Link from "next/link";
import { PageWrapper } from "@/components/page-wrapper";

export default function DailySelectPage() {
  return (
    <PageWrapper>
      <div className="mb-6 lg:mb-8">
        <Link
          href="/links"
          className="inline-flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-gray-900 mb-3"
        >
          <ArrowLeft className="h-4 w-4" />
          返回操作台
        </Link>
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-gray-900 mb-2">
          <ClipboardCheck className="h-6 w-6 lg:h-8 lg:w-8 inline mr-2" />
          <span className="highlight-green">当日选品</span>
        </h1>
        <p className="text-sm lg:text-lg text-gray-600 font-medium">
          当日推荐商品列表
        </p>
      </div>
      <div className="bg-white rounded-xl border-[3px] border-gray-900 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-8 text-center">
        <p className="text-gray-400 font-bold">当日选品功能开发中...</p>
      </div>
    </PageWrapper>
  );
}