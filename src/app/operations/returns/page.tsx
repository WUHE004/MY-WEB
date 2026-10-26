"use client";

import { useState, useEffect, useRef } from "react";
import { ArrowLeft, Plus, Minus, AlertTriangle, Camera, Search, Package, Trash2, X } from "lucide-react";
import Link from "next/link";
import { PageWrapper, showToast } from "@/components/page-wrapper";
import { NumberPop } from "@/components/motion-primitives";
import { SizeGrid } from "@/components/size-grid";
import { SaleIdSearch } from "@/components/sale-id-search";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { BarcodeScanner } from "@/components/barcode-scanner";
import { ImageSearchDialog } from "@/components/image-search-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const SIZE_OPTIONS = [80, 90, 95, 100, 105, 110, 120, 130, 140, 150, 160, 170, 180];

// 售卖方式 / 退货原因 单选项(存库值为完整文案, 统计按前缀归类)
const SALE_METHOD_OPTIONS = ["抖音售卖", "多多售卖"];
const RETURN_REASON_OPTIONS = ["品退（瑕疵/破损）", "七天无理由", "尺码（尺码不符）"];
// 品退退货快递费: 每件 5 元, 计入每日统计的退货损失(见 src/lib/daily-stats.ts)
const PINHUI_EXPRESS_FEE_PER_ITEM = 5;

interface SalesRecord {
  id: number;
  sale_id: string;
  size: number;
  quantity: number;
  sell_price: number;
  product_name: string;
  photo: string;
  manufacturer: string;
  tracking_number?: string;
}

export default function ReturnsPage() {
  const [remarks, setRemarks] = useState("");
  const [returnTime, setReturnTime] = useState("");
  // 售卖方式 / 退货原因(单选, 提交时必选)
  const [saleMethod, setSaleMethod] = useState("");
  const [returnReason, setReturnReason] = useState("");
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

  // ===== 面单退货(发货前退货: 直接删除售卖记录, 不计入退货表) =====
  const [waybillOpen, setWaybillOpen] = useState(false);
  const [waybillInput, setWaybillInput] = useState("");
  const [waybillSearching, setWaybillSearching] = useState(false);
  const [waybillSearched, setWaybillSearched] = useState(false);
  const [waybillNotFound, setWaybillNotFound] = useState(false);
  const [waybillResults, setWaybillResults] = useState<SalesRecord[]>([]);
  const [matchedWaybills, setMatchedWaybills] = useState<string[]>([]);
  const [showWaybillScanner, setShowWaybillScanner] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<SalesRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ===== 以图搜图(拍立淘式: 相机拍摄/相册选图 → 向量检索 → 点卡片选中; 未售出的结果标红框不可选) =====
  const [imgSearchOpen, setImgSearchOpen] = useState(false);

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

  // 面单退货: 按面单号(支持后六位)查询售卖记录(与打包找货同款逻辑)
  const doWaybillSearch = async (query: string) => {
    const q = query.trim();
    if (!q) return;
    setWaybillSearching(true);
    setWaybillSearched(false);
    setWaybillNotFound(false);
    setWaybillResults([]);
    setMatchedWaybills([]);
    try {
      const res = await fetch(`/api/sales-records?tracking_number=${encodeURIComponent(q)}`, { cache: "no-store" });
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        setWaybillResults(data);
        setWaybillSearched(true);
        // 短输入(≤6位)后缀匹配: 唯一命中时自动补全完整面单号
        if (q.length <= 6) {
          const distinct = Array.from(new Set(data.map((d: SalesRecord) => (d.tracking_number || "").trim()).filter(Boolean)));
          if (distinct.length === 1) setWaybillInput(distinct[0]);
          else if (distinct.length > 1) setMatchedWaybills(distinct);
        }
      } else {
        setWaybillNotFound(true);
        setWaybillSearched(true);
      }
    } catch {
      setWaybillNotFound(true);
      setWaybillSearched(true);
    } finally {
      setWaybillSearching(false);
    }
  };

  // 扫码识别成功: 填入面单号并自动搜索
  const handleWaybillScan = (code: string) => {
    setWaybillInput(code);
    setShowWaybillScanner(false);
    setTimeout(() => doWaybillSearch(code), 200);
  };

  // 删除售卖记录(发货前退货, 不写入退货表; 删除后打包找货不再能找到该商品)
  const handleDeleteRecord = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/sales-records?id=${pendingDelete.id}`, { method: "DELETE", cache: "no-store" });
      if (res.ok) {
        showToast("已删除该售卖记录", "success");
        setWaybillResults((prev) => prev.filter((r) => r.id !== pendingDelete.id));
        setPendingDelete(null);
      } else {
        const err = await res.json().catch(() => ({}));
        showToast("删除失败: " + (err.error || "未知错误"), "error");
      }
    } catch {
      showToast("网络错误，请重试", "error");
    } finally {
      setDeleting(false);
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
    if (!saleMethod) {
      showToast("请选择售卖方式", "error");
      return;
    }
    if (!returnReason) {
      showToast("请选择退货原因", "error");
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
          sale_method: saleMethod,
          return_reason: returnReason,
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
        setSaleMethod("");
        setReturnReason("");
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
        <button
          onClick={() => setWaybillOpen(true)}
          className="ml-auto flex items-center gap-1.5 px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl border-[3px] border-gray-900 bg-[#4A90E2] text-white font-extrabold text-xs sm:text-sm shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
        >
          <Camera className="h-4 w-4" />
          面单退货
        </button>
        <p className="text-lg lg:text-3xl font-extrabold text-yellow-600">{countError ? "?" : totalReturnCount} 件</p>
      </div>

      <div className="max-w-2xl mx-auto">
        {/* Sale ID */}
        <div className="mb-6">
          <label className="text-sm lg:text-base font-extrabold text-gray-900 mb-1 block">
            售卖编号 <span className="text-red-500">*</span>
          </label>
          <p className="text-[10px] lg:text-xs text-gray-400 mb-2">
            输入售卖编号或商品名称搜索已售商品，自动关联售卖信息
          </p>
          {/* 售卖编号搜索 + 拍照识图入口 */}
          <div className="flex items-stretch gap-2">
            <div className="flex-1 min-w-0">
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
                placeholder="输入售卖编号/商品名称..."
              />
            </div>
            <button
              type="button"
              onClick={() => setImgSearchOpen(true)}
              title="拍照识图，搜索库中相似商品"
              aria-label="拍照识图搜索"
              className="shrink-0 w-12 sm:w-14 flex items-center justify-center rounded-xl border-[3px] border-gray-900 bg-[#9B59B6] text-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] active:translate-y-[2px] transition-all"
            >
              <Camera className="h-5 w-5" />
            </button>
          </div>

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

        {/* 售卖方式(单选) */}
        <div className="mb-6">
          <label className="text-sm lg:text-base font-extrabold text-gray-900 mb-2 block">
            售卖方式 <span className="text-red-500">*</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {SALE_METHOD_OPTIONS.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setSaleMethod(opt)}
                className={`px-4 py-2 rounded-lg border-2 text-xs lg:text-sm font-extrabold transition-all ${
                  saleMethod === opt
                    ? "border-gray-900 bg-gray-900 text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                    : "border-gray-300 bg-white text-gray-500 hover:border-gray-900 hover:text-gray-900"
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>

        {/* 退货原因(单选) */}
        <div className="mb-6">
          <label className="text-sm lg:text-base font-extrabold text-gray-900 mb-2 block">
            退货原因 <span className="text-red-500">*</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {RETURN_REASON_OPTIONS.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setReturnReason(opt)}
                className={`px-4 py-2 rounded-lg border-2 text-xs lg:text-sm font-extrabold transition-all ${
                  returnReason === opt
                    ? "border-gray-900 bg-gray-900 text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                    : "border-gray-300 bg-white text-gray-500 hover:border-gray-900 hover:text-gray-900"
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
          {returnReason.startsWith("品退") && (
            <p className="mt-2 text-xs font-bold text-red-500">
              品退将按 {PINHUI_EXPRESS_FEE_PER_ITEM} 元/件 在总利润中扣除退货快递费
            </p>
          )}
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

      {/* ===== 面单退货弹窗 ===== */}
      {waybillOpen && (
        <div
          className="fixed inset-0 z-[90] bg-black/70 flex items-start justify-center p-3 sm:p-6 overflow-y-auto"
          onClick={() => setWaybillOpen(false)}
        >
          <div
            className="w-full max-w-lg bg-white rounded-2xl border-[3px] border-gray-900 shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] p-4 sm:p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-lg sm:text-xl font-extrabold text-gray-900">面单退货</h2>
              <button
                onClick={() => setWaybillOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border-2 border-gray-900 bg-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[2px] active:translate-y-[2px] transition-all"
                title="关闭"
              >
                <X className="h-4 w-4 text-gray-900" />
              </button>
            </div>
            <p className="text-[11px] text-gray-400 mb-3">
              发货前有人退货: 查出该面单下的售卖记录, 点删除直接从售卖表中移除(不计入退货统计, 打包找货中将无法找到)
            </p>

            {/* 面单搜索: 输入框 + 扫码 + 查找(与打包找货同款) */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  value={waybillInput}
                  onChange={(e) => { setWaybillInput(e.target.value); setMatchedWaybills([]); }}
                  onKeyDown={(e) => e.key === "Enter" && doWaybillSearch(waybillInput)}
                  placeholder="面单号 / 后六位"
                  className="neo-input w-full text-sm pl-10"
                />
              </div>
              <button
                type="button"
                onClick={() => setShowWaybillScanner(true)}
                className="flex items-center justify-center h-[42px] w-[42px] rounded-xl border-[3px] border-gray-900 bg-[#4A90E2] text-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:translate-y-[2px] transition-all shrink-0"
                title="扫码识别面单号"
              >
                <Camera className="h-4 w-4" />
              </button>
              <button
                onClick={() => doWaybillSearch(waybillInput)}
                disabled={waybillSearching || !waybillInput.trim()}
                className="flex items-center justify-center h-[42px] px-4 rounded-xl border-[3px] border-gray-900 bg-[#FFC93C] text-gray-900 font-extrabold text-sm shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:translate-y-[2px] transition-all disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
              >
                {waybillSearching ? "搜索中..." : "查找"}
              </button>
            </div>

            {/* 后六位匹配到多个面单号: 点击选择 */}
            {matchedWaybills.length > 1 && (
              <div className="mt-3 p-3 rounded-xl border-[3px] border-yellow-400 bg-yellow-50">
                <p className="text-xs font-extrabold text-yellow-700 mb-2">
                  后六位匹配到 {matchedWaybills.length} 个面单号，请点击选择：
                </p>
                <div className="flex flex-wrap gap-2">
                  {matchedWaybills.map((tn) => (
                    <button
                      key={tn}
                      onClick={() => { setWaybillInput(tn); doWaybillSearch(tn); }}
                      className="px-3 py-1.5 rounded-lg border-[2px] border-gray-900 bg-white text-xs font-extrabold text-gray-900 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:translate-y-[1px] transition-all"
                    >
                      {tn}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 未找到 */}
            {waybillSearched && waybillNotFound && (
              <div className="mt-3 p-4 rounded-xl border-[3px] border-red-400 bg-red-50 text-center">
                <p className="text-sm font-extrabold text-red-600">未找到面单号 "{waybillInput}" 对应的售卖记录</p>
              </div>
            )}

            {/* 售卖记录列表 */}
            {waybillResults.length > 0 && (
              <div className="mt-3 space-y-2.5 max-h-[60vh] overflow-y-auto pr-0.5">
                {waybillResults.map((r) => (
                  <div key={r.id} className="rounded-xl border-[3px] border-gray-900 bg-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] p-2.5 flex gap-2.5">
                    <div className="w-16 h-16 rounded-lg bg-gray-100 border-2 border-gray-300 overflow-hidden shrink-0 flex items-center justify-center">
                      {r.photo ? <img src={r.photo} alt="" className="w-full h-full object-cover" /> : <Package className="h-8 w-8 text-gray-300" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="text-base font-extrabold text-gray-900">{r.sale_id}</span>
                        <span className="text-xs text-gray-500 truncate">{r.product_name || "未命名"}</span>
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5 truncate">{r.manufacturer || "-"}</div>
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        <span className="px-2 py-0.5 rounded-md border-2 border-gray-900 bg-[#FF6B7A] text-white text-xs font-extrabold">尺码 {r.size}</span>
                        <span className="px-2 py-0.5 rounded-md border-2 border-gray-900 bg-[#FFC93C] text-gray-900 text-xs font-extrabold">×{r.quantity}</span>
                        <span className="text-xs font-extrabold text-red-500">¥{r.sell_price}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => setPendingDelete(r)}
                      disabled={deleting}
                      className="self-center shrink-0 flex items-center gap-1 px-2.5 py-2 rounded-lg border-[2px] border-gray-900 bg-[#FF6B7A] text-white text-xs font-extrabold shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[2px] active:translate-y-[2px] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      删除
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== 以图搜图弹窗(共享组件; 未售出的结果标红框且不可选) ===== */}
      <ImageSearchDialog
        open={imgSearchOpen}
        onClose={() => setImgSearchOpen(false)}
        onPick={handleSelectRecord}
        scope="all"
        markUnsold
      />

      {/* 扫码弹窗 */}
      <BarcodeScanner
        open={showWaybillScanner}
        onClose={() => setShowWaybillScanner(false)}
        onResult={handleWaybillScan}
        title="扫描面单号条形码"
        hint="将面单号条形码对准扫描框，识别成功自动搜索"
      />

      {/* 删除二次确认 */}
      <ConfirmDialog
        open={pendingDelete !== null}
        title="确认删除该售卖记录？"
        description={`编号 ${pendingDelete?.sale_id || ""} 尺码 ${pendingDelete?.size ?? ""} ×${pendingDelete?.quantity ?? 1} 将从售卖表中直接删除, 不计入退货统计, 打包找货中将无法找到。`}
        confirmText="确认删除"
        onCancel={() => setPendingDelete(null)}
        onConfirm={handleDeleteRecord}
      />
    </PageWrapper>
  );
}