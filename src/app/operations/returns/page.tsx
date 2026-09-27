"use client";

import { useState, useEffect, useRef } from "react";
import { ArrowLeft, Plus, Minus, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { PageWrapper, showToast } from "@/components/page-wrapper";
import { NumberPop } from "@/components/motion-primitives";
import { SizeGrid } from "@/components/size-grid";
import { SaleIdSearch } from "@/components/sale-id-search";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const SIZE_OPTIONS = [80, 90, 95, 100, 105, 110, 120, 130, 140, 150, 160, 170, 180];

interface SalesRecord {
  sale_id: string;
  size: number;
  quantity: number;
  sell_price: number;
  product_name: string;
  photo: string;
  manufacturer: string;
}

export default function ReturnsPage() {
  const [remarks, setRemarks] = useState("");
  const [returnTime, setReturnTime] = useState("");
  const [sizes, setSizes] = useState<Record<number, number>>(
    Object.fromEntries(SIZE_OPTIONS.map((s) => [s, 0]))
  );
  const [submitting, setSubmitting] = useState(false);

  const [filteredRecords, setFilteredRecords] = useState<SalesRecord[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSaleId, setSelectedSaleId] = useState("");
  const [selectedSaleInfo, setSelectedSaleInfo] = useState<SalesRecord[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [totalReturnCount, setTotalReturnCount] = useState(0);
  // 退货统计加载失败标记(角标显示 ? 而非 0)
  const [countError, setCountError] = useState(false);
  // 该编号各尺码已退数量（可退数量 = 已售 - 已退）
  const [returnedBySize, setReturnedBySize] = useState<Record<number, number>>({});

  const selectedSaleIdRef = useRef("");

  useEffect(() => {
    fetchTotalReturnCount();
  }, []);

  // 点击外部关闭下拉的逻辑已内置于 <SaleIdSearch> 组件

  const fetchTotalReturnCount = async () => {
    try {
      const res = await fetch("/api/returns-summary");
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      if (Array.isArray(data)) {
        const total = data.reduce((sum: number, item: any) => sum + (Number(item.total_returned) || 0), 0);
        setTotalReturnCount(total);
        setCountError(false);
      }
    } catch {
      // 失败显示 "?" 而非误导性的 0 件
      setCountError(true);
    }
  };

  // 输入时按编号模糊检索(走数据库查询, 避免全表拉取超过 Vercel 4.5MB 响应限制被截断)
  // 防抖 350ms: 停止输入才发请求; 序号作废过期响应: 防止先发后至的旧结果覆盖新结果
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchSeqRef = useRef(0);
  const handleSearch = (query: string) => {
    setSearchQuery(query);
    setNotFound(false);
    setSelectedSaleId("");
    selectedSaleIdRef.current = "";
    setSelectedSaleInfo([]);
    setSizes(Object.fromEntries(SIZE_OPTIONS.map((s) => [s, 0])));
    setReturnedBySize({});

    const q = query.trim();
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!q) {
      searchSeqRef.current += 1; // 作废在途请求
      setFilteredRecords([]);
      setShowDropdown(false);
      return;
    }
    searchTimerRef.current = setTimeout(async () => {
      const seq = ++searchSeqRef.current;
      try {
        const res = await fetch(`/api/sales-records?search=${encodeURIComponent(q)}`, { cache: "no-store" });
        const data = await res.json();
        if (seq !== searchSeqRef.current) return; // 已有更新的搜索, 丢弃
        if (Array.isArray(data)) {
          setFilteredRecords(data);
          setShowDropdown(true);
          return;
        }
      } catch (err) {
        console.error("Search sales records error:", err);
        if (seq !== searchSeqRef.current) return;
      }
      setFilteredRecords([]);
      setShowDropdown(false);
    }, 350);
  };

  // 获取该编号各尺码的已退数量
  const fetchReturnedData = async (saleId: string) => {
    try {
      const res = await fetch(`/api/return-records?sale_id=${encodeURIComponent(saleId)}`);
      const data = await res.json();
      const ret: Record<number, number> = {};
      if (Array.isArray(data)) {
        for (const r of data) {
          const size = Number(r.size);
          ret[size] = (ret[size] || 0) + (Number(r.quantity) || 0);
        }
      }
      setReturnedBySize(ret);
    } catch {
      setReturnedBySize({});
    }
  };

  const handleSelectRecord = async (saleId: string) => {
    setSelectedSaleId(saleId);
    selectedSaleIdRef.current = saleId;
    setSearchQuery(saleId);
    setShowDropdown(false);
    setNotFound(false);
    setSizes(Object.fromEntries(SIZE_OPTIONS.map((s) => [s, 0])));

    // 按编号精确查询该编号的所有尺码售卖记录
    try {
      const res = await fetch(`/api/sales-records?sale_id=${encodeURIComponent(saleId)}`, { cache: "no-store" });
      const data = await res.json();
      setSelectedSaleInfo(Array.isArray(data) ? data : []);
    } catch {
      setSelectedSaleInfo([]);
    }
    fetchReturnedData(saleId);
  };

  const handleBlur = () => {
    const query = searchQuery.trim();
    if (!query) return;
    if (selectedSaleIdRef.current && selectedSaleIdRef.current.toLowerCase() === query.toLowerCase()) {
      return;
    }
    // 从当前检索结果中找精确匹配
    const exactMatch = filteredRecords.find(
      (r) => r.sale_id.toLowerCase() === query.toLowerCase()
    );
    if (exactMatch) {
      handleSelectRecord(exactMatch.sale_id);
    } else {
      setNotFound(true);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      const query = searchQuery.trim();
      if (!query) return;
      const exactMatch = filteredRecords.find(
        (r) => r.sale_id.toLowerCase() === query.toLowerCase()
      );
      if (exactMatch) {
        handleSelectRecord(exactMatch.sale_id);
      } else {
        setSelectedSaleId("");
        selectedSaleIdRef.current = "";
        setSelectedSaleInfo([]);
        setShowDropdown(false);
        setNotFound(true);
      }
    }
  };

  const getSoldQuantity = (size: number): number => {
    // 同一尺码可能有多条售出记录，需要 SUM 而非取第一条
    return selectedSaleInfo
      .filter((r) => r.size === size)
      .reduce((sum, r) => sum + (Number(r.quantity) || 0), 0);
  };

  const getMaxReturnable = (size: number): number => {
    // 可退数量 = 已售合计 - 已退合计
    return Math.max(0, getSoldQuantity(size) - (returnedBySize[size] || 0));
  };

  const hasAnySizeSelected = Object.values(sizes).some((v) => v > 0);

  const isSizeDisabled = (size: number): boolean => {
    if (!selectedSaleId) return true;
    if (getMaxReturnable(size) === 0) return true;
    if (hasAnySizeSelected && (sizes[size] || 0) === 0) return true;
    return false;
  };

  const updateSize = (size: number, delta: number) => {
    if (isSizeDisabled(size) && delta > 0) return;
    const maxReturnable = getMaxReturnable(size);
    setSizes((prev) => {
      const current = prev[size] || 0;
      const next = Math.max(0, Math.min(current + delta, maxReturnable));
      return { ...prev, [size]: next };
    });
  };

  const setSizeValue = (size: number, value: string) => {
    if (isSizeDisabled(size)) return;
    const num = parseInt(value, 10);
    const maxReturnable = getMaxReturnable(size);
    const clamped = isNaN(num) ? 0 : Math.max(0, Math.min(num, maxReturnable));
    setSizes((prev) => ({ ...prev, [size]: clamped }));
  };

  const handleSubmit = async () => {
    if (!selectedSaleId) {
      showToast("请选择有效的售卖编号", "error");
      return;
    }

    const totalQty = Object.values(sizes).reduce((sum, v) => sum + v, 0);
    if (totalQty === 0) {
      showToast("请至少选择一个尺码并输入退货数量", "error");
      return;
    }

    setSubmitting(true);

    const registrant = localStorage.getItem("member_name") || "未知";

    try {
      const returnData = SIZE_OPTIONS.filter((s) => (sizes[s] || 0) > 0).map((size) => {
        const quantity = sizes[size] || 0;
        const salesRecord = selectedSaleInfo.find((r) => r.size === size);
        return {
          sale_id: selectedSaleId,
          size,
          quantity,
          return_price: salesRecord ? salesRecord.sell_price : 0,
          remarks: remarks.trim(),
          registrant,
          return_time: returnTime || new Date().toISOString(),
        };
      });

      const res = await fetch("/api/return-records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(returnData),
      });

      if (res.ok) {
        showToast("退货登记成功！", "success");
        setSelectedSaleId("");
        selectedSaleIdRef.current = "";
        setSelectedSaleInfo([]);
        setSearchQuery("");
        setRemarks("");
        setNotFound(false);
        setSizes(Object.fromEntries(SIZE_OPTIONS.map((s) => [s, 0])));
      } else {
        const err = await res.json();
        showToast("退货登记失败: " + (err.error || "未知错误"), "error");
      }
    } catch {
      showToast("网络错误，请重试", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const totalSizeCount = Object.values(sizes).reduce((sum, v) => sum + v, 0);

  return (
    <PageWrapper>
      {/* Header */}
      <div className="flex items-center gap-3 lg:gap-4 mb-6 lg:mb-8">
        <Link
          href="/links"
          className="flex h-10 w-10 items-center justify-center rounded-xl border-[3px] border-gray-900 bg-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-gray-900">
          <span className="highlight-yellow">退货登记</span>
        </h1>
        <p className="text-lg lg:text-3xl font-extrabold text-yellow-600 ml-auto">{countError ? "?" : totalReturnCount} 件</p>
      </div>

      <div className="max-w-2xl mx-auto">
        {/* Sale ID */}
        <div className="mb-6">
          <label className="text-sm lg:text-base font-extrabold text-gray-900 mb-1 block">
            售卖编号 <span className="text-red-500">*</span>
          </label>
          <p className="text-[10px] lg:text-xs text-gray-400 mb-2">
            输入售卖编号搜索已售商品，自动关联售卖信息
          </p>
          <SaleIdSearch
            value={searchQuery}
            onValueChange={handleSearch}
            open={showDropdown}
            onOpenChange={setShowDropdown}
            options={Array.from(new Set(filteredRecords.map((r) => r.sale_id))).map((saleId) => {
              const record = filteredRecords.find((r) => r.sale_id === saleId);
              return {
                key: saleId,
                title: saleId,
                subtitle: `${record?.product_name || "未命名"} · ${record?.manufacturer}`,
                photoUrl: record?.photo,
              };
            })}
            onSelect={(opt) => handleSelectRecord(opt.key)}
            onInputFocus={() => {
              if (searchQuery.trim() && filteredRecords.length > 0 && !selectedSaleId) {
                setShowDropdown(true);
              }
            }}
            onInputBlur={handleBlur}
            onKeyDown={handleKeyDown}
            placeholder="输入售卖编号搜索..."
          />

          {/* 未售卖提示 */}
          {notFound && (
            <div className="mt-3 p-4 rounded-xl border-[3px] border-red-400 bg-red-50 flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
              <div>
                <p className="text-sm font-extrabold text-red-600">未售卖</p>
                <p className="text-xs text-red-500">
                  编号 "{searchQuery}" 未在售卖记录中找到，无法退货
                </p>
              </div>
            </div>
          )}

          {/* Selected Sale Info */}
          {selectedSaleId && selectedSaleInfo.length > 0 && (
            <div className="mt-3 p-4 rounded-xl border-[3px] border-gray-900 bg-gray-50">
              <div className="flex items-center gap-3">
                {selectedSaleInfo[0]?.photo && (
                  <img
                    src={selectedSaleInfo[0].photo}
                    alt=""
                    className="w-16 h-16 rounded-lg object-cover border-2 border-gray-300"
                  />
                )}
                <div className="text-sm">
                  <p className="font-extrabold text-gray-900">{selectedSaleInfo[0]?.manufacturer}</p>
                  <p className="text-gray-500">{selectedSaleInfo[0]?.product_name || "未命名"}</p>
                  <p className="text-gray-400 text-xs">
                    已售尺码: {SIZE_OPTIONS.map((s) => {
                      const sold = getSoldQuantity(s);
                      return sold > 0 ? `${s}(${sold}件)` : null;
                    }).filter(Boolean).join(", ")}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sizes */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm lg:text-base font-extrabold text-gray-900">
              尺码与退货数量
            </label>
            <span className="text-xs lg:text-sm font-bold text-gray-500">
              合计: <NumberPop value={totalSizeCount} /> 件
            </span>
          </div>
          {!selectedSaleId && (
            <p className="text-xs text-gray-400 mb-3">请先选择售卖编号后再选择尺码</p>
          )}
          <SizeGrid
            sizeList={SIZE_OPTIONS}
            sizes={sizes}
            onDelta={updateSize}
            onSetValue={setSizeValue}
            limitOf={getSoldQuantity}
            disabledOf={isSizeDisabled}
            badgeOf={(size) => {
              const sold = getSoldQuantity(size);
              return sold > 0 ? `已售:${sold}` : "未售";
            }}
          />
        </div>

        {/* Return Time */}
        <div className="mb-6">
          <label className="text-sm lg:text-base font-extrabold text-gray-900 mb-1 block">
            退货时间 <span className="text-xs font-normal text-gray-400">(可选)</span>
          </label>
          <input
            type="datetime-local"
            value={returnTime}
            onChange={(e) => setReturnTime(e.target.value)}
            className="neo-input w-full text-sm"
          />
        </div>

        {/* Remarks */}
        <div className="mb-8">
          <label className="text-sm lg:text-base font-extrabold text-gray-900 mb-1 block">
            备注 <span className="text-xs font-normal text-gray-400">(非必填)</span>
          </label>
          <textarea
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="请输入退货原因等备注信息..."
            rows={3}
            className="neo-input w-full text-sm resize-none"
          />
        </div>

        {/* Submit */}
        <Button
          variant="primary"
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full py-4 text-base lg:text-lg font-extrabold"
        >
          {submitting ? "提交中..." : "提交退货"}
        </Button>
      </div>
    </PageWrapper>
  );
}