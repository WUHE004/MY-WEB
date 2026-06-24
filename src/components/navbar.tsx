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
  ChevronDown,
  Mail,
  Database,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const navItems = [
  { href: "/", label: "首页", icon: LayoutDashboard },
  { href: "/products", label: "商品", icon: Package },
  { href: "/links", label: "链接", icon: Link2 },
  { href: "/finance", label: "财务", icon: BarChart3 },
  { href: "/account", label: "账号", icon: Users },
  { href: "/data-import", label: "导入", icon: Database },
];

export function Navbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pagesOpen, setPagesOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full bg-white/95 backdrop-blur-sm py-3">
      <nav className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-center">
          {/* Centered pill nav */}
          <div className="flex items-center rounded-full border-[3px] border-gray-900 bg-white px-3 py-2 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-shadow hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
            {/* Logo circle */}
            <Link href="/" className="flex items-center justify-center h-9 w-9 rounded-full border-[3px] border-gray-900 bg-gradient-to-br from-pink-400 to-pink-600 mr-2 transition-transform hover:scale-110">
              <div className="h-4 w-4 rounded-full bg-white/50" />
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
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="navbar-indicator"
                      className="absolute inset-0 bg-gray-100 rounded-full border-[2px] border-gray-200 -z-10"
                      transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                    />
                  )}
                  <item.icon className={`h-4 w-4 ${isActive ? "text-pink-500" : ""}`} />
                  {item.label}
                </Link>
              );
            })}

            {/* Pages dropdown */}
            <div className="relative">
              <button
                onClick={() => setPagesOpen(!pagesOpen)}
                className="flex items-center gap-1 rounded-full px-4 py-2 text-sm font-bold text-gray-600 hover:text-gray-900 transition-all"
              >
                更多
                <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-300 ${pagesOpen ? "rotate-180" : ""}`} />
              </button>
              <AnimatePresence>
                {pagesOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                    className="absolute top-full left-0 mt-2 w-48 rounded-2xl border-[3px] border-gray-900 bg-white p-2 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]"
                  >
                    {navItems.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setPagesOpen(false)}
                        className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-100 transition-colors"
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
            <button className="flex items-center justify-center h-9 w-9 rounded-xl bg-gray-900 text-white ml-2 hover:bg-gray-800 transition-colors hover:scale-105 active:scale-95">
              <Mail className="h-4 w-4" />
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="md:hidden fixed top-4 right-4 z-50 flex h-11 w-11 items-center justify-center rounded-full border-[3px] border-gray-900 bg-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[2px] active:translate-y-[2px] transition-all"
      >
        <motion.div
          animate={{ rotate: mobileOpen ? 90 : 0 }}
          transition={{ duration: 0.2 }}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </motion.div>
      </button>

      {/* Mobile Nav */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="md:hidden border-b-[3px] border-gray-900 bg-white overflow-hidden"
          >
            <div className="space-y-1 px-4 py-4">
              {navItems.map((item, index) => {
                const isActive = pathname === item.href;
                return (
                  <motion.div
                    key={item.href}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <Link
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
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
