"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Package,
  Search,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  DollarSign,
  Layers,
  ShoppingCart,
  TrendingUp,
  RefreshCw,
  Clock,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PageWrapper } from "@/components/page-wrapper";

interface Product {
  id: string;
  sale_id: string;
  manufacturer: string;
  photo: string;
  name: string;
  total_stock: number;
  sold_qty: number;
  remaining_stock: number;
  shelf_no: string;
  size_80: number;
  size_90: number;
  size_95: number;
  size_100: number;
  size_105: number;
  size_110: number;
  size_120: number;
  size_130: number;
  size_140: number;
  size_150: number;
  size_160: number;
  size_170: number;
  size_180: number;
  stock_warning: number;
  cost_price: number;
  sell_price: number;
  profit: number;
  return_qty: number;
  return_rate: number;
  inventory_value: number;
  last_order_time: string;
  status: "active" | "low" | "out" | "warning";
}

const SIZE_LABELS: Record<string, string> = {
  size_80: "80", size_90: "90", size_95: "95", size_100: "100",
  size_105: "105", size_110: "110", size_120: "120", size_130: "130",
  size_140: "140", size_150: "150", size_160: "160", size_170: "170", size_180: "180",
};

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/products");
      const data = await res.json();
      const normalized = (Array.isArray(data) ? data : []).map((p: any) => ({
        ...p,
        total_stock: Number(p.total_stock) || 0,
        sold_qty: Number(p.sold_qty) || 0,
        remaining_stock: Number(p.remaining_stock) || 0,
        size_80: Number(p.size_80) || 0,
        size_90: Number(p.size_90) || 0,
        size_95: Number(p.size_95) || 0,
        size_100: Number(p.size_100) || 0,
        size_105: Number(p.size_105) || 0,
        size_110: Number(p.size_110) || 0,
        size_120: Number(p.size_120) || 0,
        size_130: Number(p.size_130) || 0,
        size_140: Number(p.size_140) || 0,
        size_150: Number(p.size_150) || 0,
        size_160: Number(p.size_160) || 0,
        size_170: Number(p.size_170) || 0,
        size_180: Number(p.size_180) || 0,
        stock_warning: Number(p.stock_warning) || 10,
        cost_price: Number(p.cost_price) || 0,
        sell_price: Number(p.sell_price) || 0,
        profit: Number(p.profit) || 0,
        return_qty: Number(p.return_qty) || 0,
        return_rate: Number(p.return_rate) || 0,
        inventory_value: Number(p.inventory_value) || 0,
      }));
      setProducts(normalized);
    } catch (err) {
      console.error("Fetch products error:", err);
    } finally {
      setLoading(false);
    }
  };

  const filtered = products.filter(
    (p) =>
      (p.name || "").toLowerCase().includes(search.toLowerCase()) ||
      (p.sale_id || "").toLowerCase().includes(search.toLowerCase()) ||
      (p.manufacturer || "").toLowerCase().includes(search.toLowerCase())
  );

  const totalInventory = products.reduce((sum, p) => sum + (p.inventory_value || 0), 0);
  const totalStock = products.reduce((sum, p) => sum + (p.remaining_stock || 0), 0);
  const warningCount = products.filter((p) => (p.remaining_stock || 0) <= (p.stock_warning || 10)).length;

  const getStatusConfig = (p: Product) => {
    const stock = p.remaining_stock || 0;
    const warning = p.stock_warning || 10;
    if (stock === 0) return { label: "缺货", variant: "pink" as const, icon: AlertTriangle };
    if (stock <= warning) return { label: "预警", variant: "yellow" as const, icon: AlertTriangle };
    return { label: "正常", variant: "green" as const, icon: CheckCircle2 };
  };

  const formatMoney = (v: number | null | undefined) => {
    const num = v ?? 0;
    return `¥${num.toLocaleString("zh-CN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  };

  return (
    <PageWrapper>
      <div className="mb-6 lg:mb-8">
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-gray-900 mb-2">
          <span className="highlight-blue">商品管理</span>
        </h1>
        <p className="text-sm lg:text-lg text-gray-600 font-medium">
          管理您的所有商品库存，实时监控库存状态
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-6 lg:mb-8">
        <Card>
          <CardContent className="p-3 lg:p-5 flex items-center justify-between">
            <div>
              <p className="text-[10px] lg:text-xs font-bold text-gray-500">商品总数</p>
              <p className="text-lg lg:text-2xl font-extrabold">{products.length}</p>
            </div>
            <div className="flex h-8 w-8 lg:h-11 lg:w-11 items-center justify-center rounded-lg border-[3px] border-gray-900 bg-[#4A90E2] shrink-0">
              <Package className="h-4 w-4 lg:h-5 lg:w-5 text-white" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 lg:p-5 flex items-center justify-between">
            <div>
              <p className="text-[10px] lg:text-xs font-bold text-gray-500">剩余库存</p>
              <p className="text-lg lg:text-2xl font-extrabold">{totalStock.toLocaleString()}</p>
            </div>
            <div className="flex h-8 w-8 lg:h-11 lg:w-11 items-center justify-center rounded-lg border-[3px] border-gray-900 bg-[#7B61FF] shrink-0">
              <Layers className="h-4 w-4 lg:h-5 lg:w-5 text-white" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 lg:p-5 flex items-center justify-between">
            <div>
              <p className="text-[10px] lg:text-xs font-bold text-gray-500">库存预警</p>
              <p className="text-lg lg:text-2xl font-extrabold text-[#FFC93C]">{warningCount}</p>
            </div>
            <div className="flex h-8 w-8 lg:h-11 lg:w-11 items-center justify-center rounded-lg border-[3px] border-gray-900 bg-[#FFC93C] shrink-0">
              <AlertTriangle className="h-4 w-4 lg:h-5 lg:w-5 text-gray-900" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 lg:p-5 flex items-center justify-between">
            <div>
              <p className="text-[10px] lg:text-xs font-bold text-gray-500">库存价值</p>
              <p className="text-xs lg:text-base font-extrabold">{formatMoney(totalInventory)}</p>
            </div>
            <div className="flex h-8 w-8 lg:h-11 lg:w-11 items-center justify-center rounded-lg border-[3px] border-gray-900 bg-[#FF6B7A] shrink-0">
              <DollarSign className="h-4 w-4 lg:h-5 lg:w-5 text-white" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 lg:gap-4 mb-4 lg:mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="搜索商品名、编号或厂家..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 lg:pl-12 text-sm"
          />
        </div>
        <button
          onClick={fetchProducts}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border-[3px] border-gray-900 bg-white font-bold text-xs lg:text-sm shadow-[3px_3px_0px_0px_rgba(0,0,0,0.3)] active:shadow-none active:translate-x-[3px] active:translate-y-[3px] transition-all"
        >
          <RefreshCw className="h-3.5 w-3.5 lg:h-4 lg:w-4" />
          刷新
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
            <Package className="h-12 w-12 text-gray-300" />
            <p className="font-bold text-gray-500 text-sm lg:text-base">暂无商品数据</p>
            <p className="text-xs text-gray-400">请在数据导入页面从 WPS 导入 CSV 数据</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2 lg:space-y-3">
          {filtered.map((product) => {
            const status = getStatusConfig(product);
            const isExpanded = expandedId === product.id;

            return (
              <Card
                key={product.id}
                className={`cursor-pointer transition-all ${isExpanded ? "border-gray-900 ring-2 ring-gray-900" : "hover:border-gray-400"}`}
                onClick={() => setExpandedId(isExpanded ? null : product.id)}
              >
                <CardContent className="p-3 lg:p-4">
                  <div className="flex items-start gap-2 lg:gap-3">
                    <div className="h-10 w-10 lg:h-12 lg:w-12 rounded-lg border-[3px] border-gray-900 bg-gray-100 flex items-center justify-center shrink-0 overflow-hidden">
                      {product.photo ? (
                        <img src={product.photo} alt={product.name} className="h-full w-full object-cover" />
                      ) : (
                        <Package className="h-5 w-5 lg:h-6 lg:w-6 text-gray-500" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 lg:gap-2 flex-wrap">
                            <span className="font-extrabold text-xs lg:text-base text-gray-900 truncate max-w-[120px] sm:max-w-[200px]">
                              {product.name || "未命名商品"}
                            </span>
                            {product.sale_id && (
                              <span className="text-[10px] lg:text-xs font-mono font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                                {product.sale_id}
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] lg:text-xs text-gray-500 font-medium truncate mt-0.5">
                            {product.manufacturer || "未填写厂家"}
                            {product.shelf_no ? ` · 货架 ${product.shelf_no}` : ""}
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5 lg:gap-2 shrink-0">
                          <Badge variant={status.variant} className="text-[10px] lg:text-xs">
                            {status.label}
                          </Badge>
                          <div className="flex items-center gap-1">
                            <div className={`flex h-6 w-6 lg:h-7 lg:w-7 items-center justify-center rounded border-[3px] border-gray-900 ${(product.remaining_stock || 0) > 0 ? "bg-[#7B61FF]" : "bg-gray-300"} shrink-0`}>
                              <span className="text-[10px] lg:text-xs font-extrabold text-white">
                                {(product.remaining_stock || 0) > 999 ? "999+" : (product.remaining_stock || 0)}
                              </span>
                            </div>
                            <span className="text-[10px] lg:text-xs font-bold text-gray-500 hidden sm:block">件</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 lg:gap-6 mt-1.5 lg:mt-2 text-[10px] lg:text-xs font-bold">
                        <div className="flex items-center gap-1 text-[#4A90E2]">
                          <TrendingUp className="h-2.5 w-2.5 lg:h-3 lg:w-3" />
                          <span>进价 {formatMoney(product.cost_price)}</span>
                        </div>
                        <div className="flex items-center gap-1 text-[#7B61FF]">
                          <DollarSign className="h-2.5 w-2.5 lg:h-3 lg:w-3" />
                          <span>售价 {formatMoney(product.sell_price)}</span>
                        </div>
                        <div className="flex items-center gap-1 text-[#FF6B7A]">
                          <TrendingUp className="h-2.5 w-2.5 lg:h-3 lg:w-3" />
                          <span>利润 {formatMoney(product.profit)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {isExpanded && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-3 lg:mt-4 pt-3 lg:pt-4 border-t-[2px] border-gray-200 space-y-3"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 lg:gap-3">
                        <div className="rounded-lg bg-gray-50 p-2 lg:p-3 border-[2px] border-gray-200">
                          <p className="text-[10px] text-gray-500 font-bold">入库总数</p>
                          <p className="text-sm lg:text-base font-extrabold text-gray-900">{product.total_stock || 0}</p>
                        </div>
                        <div className="rounded-lg bg-gray-50 p-2 lg:p-3 border-[2px] border-gray-200">
                          <p className="text-[10px] text-gray-500 font-bold">售出数量</p>
                          <p className="text-sm lg:text-base font-extrabold text-[#4A90E2]">{product.sold_qty || 0}</p>
                        </div>
                        <div className="rounded-lg bg-gray-50 p-2 lg:p-3 border-[2px] border-gray-200">
                          <p className="text-[10px] text-gray-500 font-bold">库存价值</p>
                          <p className="text-sm lg:text-base font-extrabold text-[#FF6B7A]">{formatMoney(product.inventory_value)}</p>
                        </div>
                        <div className="rounded-lg bg-gray-50 p-2 lg:p-3 border-[2px] border-gray-200">
                          <p className="text-[10px] text-gray-500 font-bold">退货数量</p>
                          <p className="text-sm lg:text-base font-extrabold text-gray-900">{product.return_qty || 0}</p>
                        </div>
                        <div className="rounded-lg bg-gray-50 p-2 lg:p-3 border-[2px] border-gray-200">
                          <p className="text-[10px] text-gray-500 font-bold">退货率</p>
                          <p className="text-sm lg:text-base font-extrabold text-gray-900">{(product.return_rate || 0)}%</p>
                        </div>
                        <div className="rounded-lg bg-gray-50 p-2 lg:p-3 border-[2px] border-gray-200">
                          <p className="text-[10px] text-gray-500 font-bold">最新下单</p>
                          <p className="text-[10px] lg:text-sm font-extrabold text-gray-900 truncate">{product.last_order_time || "-"}</p>
                        </div>
                      </div>

                      <div>
                        <p className="text-[10px] lg:text-xs font-bold text-gray-500 mb-2">各尺码库存</p>
                        <div className="flex flex-wrap gap-1.5 lg:gap-2">
                          {Object.entries(SIZE_LABELS).map(([key, label]) => {
                            const val = product[key as keyof Product] as number;
                            return (
                              <div
                                key={key}
                                className={`flex items-center gap-1 rounded-lg border-[2px] border-gray-200 px-2 py-1 ${
                                  val === 0 ? "bg-gray-50 opacity-40" : val <= 3 ? "bg-[#FFC93C]/20 border-[#FFC93C]" : "bg-[#7B61FF]/10 border-[#7B61FF]"
                                }`}
                              >
                                <span className="text-[10px] font-bold text-gray-600">{label}</span>
                                <span className="text-[10px] font-extrabold text-gray-900">{val || 0}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </PageWrapper>
  );
}
