"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  PackagePlus,
  ShoppingCart,
  Undo2,
  Box,
  AlertTriangle,
  Rows4,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PageWrapper } from "@/components/page-wrapper";
import Link from "next/link";

interface Product {
  id: string;
  total_stock: number;
  sold_qty: number;
  return_qty: number;
}

export default function LinksPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const res = await fetch("/api/products");
      const data = await res.json();
      if (Array.isArray(data)) {
        setProducts(data);
      }
    } catch (err) {
      console.error("Fetch products error:", err);
    } finally {
      setLoading(false);
    }
  };

  const totalStock = products.reduce((sum, p) => sum + (Number(p.total_stock) || 0), 0);
  const totalSold = products.reduce((sum, p) => sum + (Number(p.sold_qty) || 0), 0);
  const totalReturn = products.reduce((sum, p) => sum + (Number(p.return_qty) || 0), 0);

  const operationButtons = [
    { label: "打包找货", icon: Box, color: "bg-[#4A90E2]", href: "/operations/pack" },
    { label: "瑕疵出库", icon: AlertTriangle, color: "bg-[#FF6B7A]", href: "/operations/defect" },
    { label: "货架调整", icon: Rows4, color: "bg-[#FFC93C]", href: "/operations/shelf" },
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
          <Card className="cursor-pointer hover:-translate-y-1 transition-all">
            <CardContent className="p-3 lg:p-6 flex items-center justify-between">
              <div>
                <p className="text-[10px] lg:text-sm font-bold text-gray-500">入库登记</p>
                <p className="text-lg lg:text-3xl font-extrabold">
                  {loading ? "..." : totalStock.toLocaleString()}
                </p>
              </div>
              <div className="flex h-8 w-8 lg:h-12 lg:w-12 items-center justify-center rounded-lg lg:rounded-xl border-[3px] border-gray-900 bg-[#4A90E2]">
                <PackagePlus className="h-4 w-4 lg:h-6 lg:w-6 text-white" />
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/operations/sales">
          <Card className="cursor-pointer hover:-translate-y-1 transition-all">
            <CardContent className="p-3 lg:p-6 flex items-center justify-between">
              <div>
                <p className="text-[10px] lg:text-sm font-bold text-gray-500">售卖登记</p>
                <p className="text-lg lg:text-3xl font-extrabold">
                  {loading ? "..." : totalSold.toLocaleString()}
                </p>
              </div>
              <div className="flex h-8 w-8 lg:h-12 lg:w-12 items-center justify-center rounded-lg lg:rounded-xl border-[3px] border-gray-900 bg-[#FFC93C]">
                <ShoppingCart className="h-4 w-4 lg:h-6 lg:w-6 text-gray-900" />
              </div>
            </CardContent>
          </Card>
        </Link>
        <Card>
          <CardContent className="p-3 lg:p-6 flex items-center justify-between">
            <div>
              <p className="text-[10px] lg:text-sm font-bold text-gray-500">退货登记</p>
              <p className="text-lg lg:text-3xl font-extrabold">
                {loading ? "..." : totalReturn.toLocaleString()}
              </p>
            </div>
            <div className="flex h-8 w-8 lg:h-12 lg:w-12 items-center justify-center rounded-lg lg:rounded-xl border-[3px] border-gray-900 bg-[#4CD964]">
              <Undo2 className="h-4 w-4 lg:h-6 lg:w-6 text-white" />
            </div>
          </CardContent>
        </Card>
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
            className={`neo-card neo-shadow-hover flex flex-col items-center justify-center gap-2 lg:gap-3 p-4 lg:p-8 cursor-pointer hover:-translate-y-1 transition-all ${btn.color}`}
          >
            <btn.icon className="h-6 w-6 lg:h-10 lg:w-10 text-white" />
            <span className="text-xs lg:text-base font-extrabold text-white">{btn.label}</span>
          </motion.a>
        ))}
      </div>
    </PageWrapper>
  );
}