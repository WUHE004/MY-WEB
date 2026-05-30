"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Package,
  Link2,
  BarChart3,
  Users,
  LayoutDashboard,
  Menu,
  X,
  Warehouse,
  ChevronDown,
  Mail,
  Database,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const navItems = [
  { href: "/", label: "仪表盘", icon: LayoutDashboard },
  { href: "/products", label: "商品管理", icon: Package },
  { href: "/links", label: "链接制作", icon: Link2 },
  { href: "/finance", label: "财务报表", icon: BarChart3 },
  { href: "/account", label: "账号运营", icon: Users },
  { href: "/data-import", label: "数据导入", icon: Database },
];

export function Navbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pagesOpen, setPagesOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full bg-white py-4">
      <nav className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-center">
          {/* Centered pill nav - matching the image exactly */}
          <div className="flex items-center rounded-full border-[3px] border-gray-900 bg-white px-3 py-2 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            {/* Logo circle */}
            <Link href="/" className="flex items-center justify-center h-9 w-9 rounded-full border-[3px] border-gray-900 bg-white mr-2">
              <div className="h-4 w-4 rounded-full border-[3px] border-gray-900" />
            </Link>

            {/* Nav links */}
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`relative flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold transition-all ${
                    isActive
                      ? "text-gray-900"
                      : "text-gray-700 hover:text-gray-900"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}

            {/* Pages dropdown */}
            <div className="relative">
              <button
                onClick={() => setPagesOpen(!pagesOpen)}
                className="flex items-center gap-1 rounded-full px-4 py-2 text-sm font-bold text-gray-700 hover:text-gray-900 transition-all"
              >
                页面
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${pagesOpen ? "rotate-180" : ""}`} />
              </button>
              <AnimatePresence>
                {pagesOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute top-full left-0 mt-2 w-48 rounded-2xl border-[3px] border-gray-900 bg-white p-2 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]"
                  >
                    {navItems.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setPagesOpen(false)}
                        className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-100 transition-all"
                      >
                        <item.icon className="h-4 w-4" />
                        {item.label}
                      </Link>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Mail icon button */}
            <button className="flex items-center justify-center h-9 w-9 rounded-xl bg-gray-900 text-white ml-2 hover:bg-gray-800 transition-colors">
              <Mail className="h-4 w-4" />
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile hamburger - positioned fixed right */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="md:hidden fixed top-4 right-4 z-50 flex h-11 w-11 items-center justify-center rounded-full border-[3px] border-gray-900 bg-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[2px] active:translate-y-[2px] transition-all"
      >
        {mobileOpen ? (
          <X className="h-5 w-5" />
        ) : (
          <Menu className="h-5 w-5" />
        )}
      </button>

      {/* Mobile Nav */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden border-b-[3px] border-gray-900 bg-white overflow-hidden"
          >
            <div className="space-y-1 px-4 py-4">
              {navItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold transition-all border-[3px] ${
                      isActive
                        ? "bg-gray-900 text-white border-gray-900"
                        : "bg-white text-gray-700 border-gray-200 hover:border-gray-900"
                    }`}
                  >
                    <item.icon className="h-5 w-5" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
