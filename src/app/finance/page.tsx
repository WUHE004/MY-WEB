"use client";

import { useState, useEffect, useMemo } from "react";
import { Search, Package, TrendingUp, TrendingDown, DollarSign, Warehouse } from "lucide-react";
import { PageWrapper } from "@/components/page-wrapper";

const ALL_SIZES = [80, 90, 95, 100, 105, 110, 120, 130, 140, 150, 160, 170, 180] as const;

interface SummaryRow {
  sale_id: string;
  inbound_total: number;
  sold_total: number;
  return_total: number;
  remaining: number;
  profits: number;
  inventory_value: number;
  cost_price: number;
  sell_price: number;
  name: string;
  manufacturer: string;
  photo: string;
  [sizeKey: string]: unknown;
}

export default function FinancePage() {
  const [data, setData] = useState<SummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchSummary();
  }, []);

  const fetchSummary = async () => {
    try {
      const res = await fetch("/api/summary");
      const result = await res.json();
      if (Array.isArray(result)) {
        setData(result);
      }
    } catch (err) {
      console.error("Fetch summary error:", err);
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.trim().toLowerCase();
    return data.filter(
      (row) =>
        row.sale_id.toLowerCase().includes(q) ||
        (row.name && row.name.toLowerCase().includes(q)) ||
        (row.manufacturer && row.manufacturer.toLowerCase().includes(q))
    );
  }, [data, search]);

  // 汇总
  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, row) => ({
        inbound_total: acc.inbound_total + row.inbound_total,
        sold_total: acc.sold_total + row.sold_total,
        return_total: acc.return_total + row.return_total,
        remaining: acc.remaining + row.remaining,
        profits: acc.profits + row.profits,
        inventory_value: acc.inventory_value + row.inventory_value,
      }),
      { inbound_total: 0, sold_total: 0, return_total: 0, remaining: 0, profits: 0, inventory_value: 0 }
    );
  }, [filtered]);

  if (loading) {
    return (
      <PageWrapper>
        <div className="text-center py-20 text-gray-400">加载中...</div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-gray-900 mb-2">
          <span className="highlight-blue">商品管理总表</span>
        </h1>
        <p className="text-sm text-gray-500">实时汇总各售卖编号的入库、售卖、退货及库存情况</p>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
        <div className="bg-white rounded-xl border-[3px] border-gray-900 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] p-3">
          <div className="flex items-center gap-2 text-xs text-gray-500 font-bold mb-1">
            <Package className="h-3.5 w-3.5" /> 款数
          </div>
          <div className="text-xl font-extrabold text-gray-900">{filtered.length}</div>
        </div>
        <div className="bg-white rounded-xl border-[3px] border-gray-900 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] p-3">
          <div className="flex items-center gap-2 text-xs text-gray-500 font-bold mb-1">
            <Warehouse className="h-3.5 w-3.5" /> 入库总数
          </div>
          <div className="text-xl font-extrabold text-gray-900">{totals.inbound_total}</div>
        </div>
        <div className="bg-white rounded-xl border-[3px] border-gray-900 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] p-3">
          <div className="flex items-center gap-2 text-xs text-gray-500 font-bold mb-1">
            <TrendingUp className="h-3.5 w-3.5 text-green-500" /> 售出
          </div>
          <div className="text-xl font-extrabold text-green-600">{totals.sold_total}</div>
        </div>
        <div className="bg-white rounded-xl border-[3px] border-gray-900 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] p-3">
          <div className="flex items-center gap-2 text-xs text-gray-500 font-bold mb-1">
            <TrendingDown className="h-3.5 w-3.5 text-yellow-500" /> 退货
          </div>
          <div className="text-xl font-extrabold text-yellow-600">{totals.return_total}</div>
        </div>
        <div className="bg-white rounded-xl border-[3px] border-gray-900 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] p-3">
          <div className="flex items-center gap-2 text-xs text-gray-500 font-bold mb-1">
            <Warehouse className="h-3.5 w-3.5" /> 剩余库存
          </div>
          <div className="text-xl font-extrabold text-blue-600">{totals.remaining}</div>
        </div>
        <div className="bg-white rounded-xl border-[3px] border-gray-900 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] p-3">
          <div className="flex items-center gap-2 text-xs text-gray-500 font-bold mb-1">
            <DollarSign className="h-3.5 w-3.5" /> 库存价值
          </div>
          <div className="text-xl font-extrabold text-red-500">¥{totals.inventory_value.toFixed(0)}</div>
        </div>
      </div>

      {/* 搜索 */}
      <div className="relative mb-4 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索售卖编号、商品名称或厂家..."
          className="neo-input w-full text-sm pl-10"
        />
      </div>

      {/* 表格 - 桌面端 */}
      <div className="hidden lg:block overflow-x-auto">
        <div className="bg-white rounded-xl border-[3px] border-gray-900 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] overflow-hidden">
          <div className="overflow-x-auto max-h-[70vh]">
            <table className="w-full text-xs whitespace-nowrap">
              <thead className="sticky top-0 z-10 bg-gray-900 text-white">
                <tr>
                  <th className="px-2 py-2 text-left font-extrabold">售卖编号</th>
                  <th className="px-2 py-2 text-center font-extrabold">入库总数</th>
                  <th className="px-2 py-2 text-center font-extrabold">售出数量</th>
                  <th className="px-2 py-2 text-center font-extrabold">退货数量</th>
                  <th className="px-2 py-2 text-center font-extrabold">剩余库存</th>
                  {ALL_SIZES.map((s) => (
                    <th key={s} className="px-1 py-2 text-center font-extrabold w-10">{s}</th>
                  ))}
                  <th className="px-2 py-2 text-center font-extrabold">利润</th>
                  <th className="px-2 py-2 text-center font-extrabold">库存价值</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={18 + ALL_SIZES.length} className="py-8 text-center text-gray-400">
                      暂无数据
                    </td>
                  </tr>
                ) : (
                  filtered.map((row, idx) => (
                    <tr key={row.sale_id} className={`border-b border-gray-200 ${idx % 2 === 0 ? "bg-white" : "bg-gray-50"}`}>
                      <td className="px-2 py-2 font-extrabold text-gray-900">{row.sale_id}</td>
                      <td className="px-2 py-2 text-center font-bold">{row.inbound_total}</td>
                      <td className="px-2 py-2 text-center font-bold text-green-600">{row.sold_total}</td>
                      <td className="px-2 py-2 text-center font-bold text-yellow-600">{row.return_total}</td>
                      <td className="px-2 py-2 text-center font-extrabold text-blue-600">{row.remaining}</td>
                      {ALL_SIZES.map((s) => {
                        const val = Number(row[`size_${s}`]) || 0;
                        return (
                          <td key={s} className={`px-1 py-2 text-center font-bold ${val < 0 ? "text-red-500" : val > 0 ? "text-gray-900" : "text-gray-300"}`}>
                            {val}
                          </td>
                        );
                      })}
                      <td className="px-2 py-2 text-center font-extrabold text-red-500">¥{row.profits}</td>
                      <td className="px-2 py-2 text-center font-bold text-gray-700">¥{row.inventory_value.toFixed(0)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 移动端卡片 */}
      <div className="lg:hidden space-y-4">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400">暂无数据</div>
        ) : (
          filtered.map((row) => (
            <div key={row.sale_id} className="bg-white rounded-xl border-[3px] border-gray-900 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-sm font-extrabold text-gray-900">{row.sale_id}</div>
                  {row.name && <div className="text-xs text-gray-500 mt-0.5">{row.name}</div>}
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-400">库存价值</div>
                  <div className="text-sm font-extrabold text-red-500">¥{row.inventory_value.toFixed(0)}</div>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2 mb-3">
                <div className="text-center bg-gray-50 rounded-lg p-2 border-2 border-gray-200">
                  <div className="text-xs text-gray-400 mb-0.5">入库</div>
                  <div className="text-sm font-extrabold">{row.inbound_total}</div>
                </div>
                <div className="text-center bg-green-50 rounded-lg p-2 border-2 border-green-200">
                  <div className="text-xs text-gray-400 mb-0.5">售出</div>
                  <div className="text-sm font-extrabold text-green-600">{row.sold_total}</div>
                </div>
                <div className="text-center bg-yellow-50 rounded-lg p-2 border-2 border-yellow-200">
                  <div className="text-xs text-gray-400 mb-0.5">退货</div>
                  <div className="text-sm font-extrabold text-yellow-600">{row.return_total}</div>
                </div>
                <div className="text-center bg-blue-50 rounded-lg p-2 border-2 border-blue-200">
                  <div className="text-xs text-gray-400 mb-0.5">剩余</div>
                  <div className="text-sm font-extrabold text-blue-600">{row.remaining}</div>
                </div>
              </div>
              {/* 各尺码 */}
              <div className="flex flex-wrap gap-1">
                {ALL_SIZES.map((s) => {
                  const val = Number(row[`size_${s}`]) || 0;
                  return (
                    <span
                      key={s}
                      className={`text-xs px-1.5 py-0.5 rounded border font-bold ${
                        val < 0 ? "bg-red-50 border-red-300 text-red-600" :
                        val > 0 ? "bg-gray-100 border-gray-300 text-gray-700" :
                        "bg-white border-gray-200 text-gray-300"
                      }`}
                    >
                      {s}:{val}
                    </span>
                  );
                })}
              </div>
              <div className="flex justify-between mt-2 pt-2 border-t border-gray-200">
                <div className="text-xs">
                  <span className="text-gray-400">利润: </span>
                  <span className="font-extrabold text-red-500">¥{row.profits}</span>
                </div>
                {row.manufacturer && (
                  <div className="text-xs text-gray-400">{row.manufacturer}</div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </PageWrapper>
  );
}