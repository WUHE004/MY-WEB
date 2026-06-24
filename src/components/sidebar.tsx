"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Package,
  Link2,
  BarChart3,
  Users,
  LayoutDashboard,
  Settings,
  HelpCircle,
  Database,
} from "lucide-react";

const mainItems = [
  { href: "/", label: "首页", icon: LayoutDashboard },
  { href: "/products", label: "商品管理", icon: Package },
  { href: "/links", label: "链接制作", icon: Link2 },
  { href: "/finance", label: "财务报表", icon: BarChart3 },
  { href: "/account", label: "账号运营", icon: Users },
  { href: "/data-import", label: "数据导入", icon: Database },
];

const bottomItems = [
  { href: "#", label: "设置", icon: Settings },
  { href: "#", label: "帮助", icon: HelpCircle },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:flex flex-col w-64 h-[calc(100vh-5rem)] sticky top-20 border-r-[3px] border-gray-900 bg-white">
      <div className="flex-1 px-4 py-6 space-y-2">
        <div className="px-3 mb-4">
          <span className="text-xs font-extrabold text-gray-400 uppercase tracking-wider">
            主菜单
          </span>
        </div>
        {mainItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold transition-all border-[3px] ${
                isActive
                  ? "bg-gray-900 text-white border-gray-900 shadow-[3px_3px_0px_0px_rgba(0,0,0,0.2)]"
                  : "bg-white text-gray-700 border-transparent hover:border-gray-900 hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5"
              }`}
            >
              <item.icon className={`h-5 w-5 ${isActive ? "text-pink-400" : ""}`} />
              {item.label}
            </Link>
          );
        })}
      </div>

      <div className="px-4 py-6 border-t-[3px] border-gray-200 space-y-2">
        <div className="px-3 mb-4">
          <span className="text-xs font-extrabold text-gray-400 uppercase tracking-wider">
            其他
          </span>
        </div>
        {bottomItems.map((item) => (
          <button
            key={item.label}
            className="w-full flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold transition-all border-[3px] border-transparent bg-white text-gray-700 hover:border-gray-900 hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5"
          >
            <item.icon className="h-5 w-5" />
            {item.label}
          </button>
        ))}
      </div>
    </aside>
  );
}
