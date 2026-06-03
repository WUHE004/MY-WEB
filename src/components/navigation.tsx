"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  Link2,
  Users,
  BarChart3,
  Upload,
  Settings,
} from "lucide-react";

const navItems = [
  { href: "/", label: "首页", icon: LayoutDashboard },
  { href: "/products", label: "商品", icon: Package },
  { href: "/links", label: "操作", icon: Link2 },
  { href: "/finance", label: "管理", icon: BarChart3 },
  { href: "/data-import", label: "导入", icon: Upload },
  { href: "/profile", label: "信息", icon: Users },
];

export function Navigation() {
  const pathname = usePathname();

  return (
    <>
      {/* ---------- 桌面端：左侧竖向导航 ---------- */}
      <nav className="hidden md:flex flex-col fixed left-0 top-0 bottom-0 w-[72px] bg-white border-r-[3px] border-gray-900 z-50 py-4 px-2">
        <div className="flex items-center justify-center mb-6 mt-1">
          <Link
            href="/members"
            title="成员管理"
            className="flex h-10 w-10 items-center justify-center rounded-xl border-[3px] border-gray-900 bg-gray-900 hover:bg-gray-700 transition-colors"
          >
            <Settings className="h-5 w-5 text-white" />
          </Link>
        </div>

        <div className="flex flex-col gap-1 flex-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                className={`flex flex-col items-center justify-center gap-1 rounded-xl border-[3px] px-1 py-2.5 transition-all ${
                  isActive
                    ? "border-gray-900 bg-gray-900 text-white shadow-[3px_3px_0px_0px_rgba(0,0,0,0.3)]"
                    : "border-transparent text-gray-400 hover:border-gray-200 hover:text-gray-700"
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="text-[10px] font-extrabold leading-none">
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* ---------- 手机端：底部 Tab ---------- */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t-[3px] border-gray-900 z-50 safe-area-bottom">
        <div className="flex items-center justify-around px-1 py-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center justify-center gap-0.5 rounded-xl px-3 py-1.5 min-w-0 transition-all ${
                  isActive
                    ? "text-gray-900"
                    : "text-gray-400"
                }`}
              >
                <div
                  className={`flex items-center justify-center rounded-lg p-1 transition-all ${
                    isActive
                      ? "bg-gray-900 text-white"
                      : ""
                  }`}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <span className="text-[10px] font-extrabold leading-none">
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* 手机端底部导航占位 */}
      <div className="md:hidden h-2" />
    </>
  );
}