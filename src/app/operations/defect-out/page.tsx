"use client";

import { useState, useEffect } from "react";
import { ArrowLeft, AlertTriangle, Plus, X, Settings2 } from "lucide-react";
import Link from "next/link";
import { PageWrapper, showToast } from "@/components/page-wrapper";
import { NumberPop } from "@/components/motion-primitives";
import { SizeGrid } from "@/components/size-grid";
import { SaleIdSearch } from "@/components/sale-id-search";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const SIZE_OPTIONS = [80, 90, 95, 100, 105, 110, 120, 130, 140, 150, 160, 170, 180];

// 瑕疵细节预设(首次使用时写入 settings, 之后可在页面自由增删)
const DEFAULT_DEFECT_OPTIONS = ["一级瑕疵：破损", "二级瑕疵：污渍", "三级瑕疵：线头"];
const DEFECT_KEY = "defect_options";

interface InboundRecord {
  sale_id: string;
  photo: string;
  name: string;
  manufacturer: string;
  cost_price: number;
  shelf_no: string;
  [sizeKey: string]: number | string;
}

function getStock(record: InboundRecord, size: number): number {
  return Number(record[`size_${size}`]) || 0;
}

export default function DefectOutPage() {
  const [returnPrice, setReturnPrice] = useState("");
  const [defectType, setDefectType] = useState("");
  const [notes, setNotes] = useState("");
  const [sizes, setSizes] = useState<Record<number, number>>(
    Object.fromEntries(SIZE_OPTIONS.map((s) => [s, 0]))
  );
  const [submitting, setSubmitting] = useState(false);

  const [inboundRecords, setInboundRecords] = useState<InboundRecord[]>([]);
  const [filteredRecords, setFilteredRecords] = useState<InboundRecord[]>([]);
  const [totalOutQty, setTotalOutQty] = useState(0);
  const [soldBySize, setSoldBySize] = useState<Record<number, number>>({});
  const [returnedBySize, setReturnedBySize] = useState<Record<number, number>>({});
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRecord, setSelectedRecord] = useState<InboundRecord | null>(null);
  const [notFound, setNotFound] = useState(false);

  // 瑕疵细节选项(settings 持久化, 可自由增删)
  const [defectOptions, setDefectOptions] = useState<string[]>(DEFAULT_DEFECT_OPTIONS);
  const [showDefectManage, setShowDefectManage] = useState(false);
  const [newDefect, setNewDefect] = useState("");

  const fetchTotalOutQty = async () => {
    try {
      const res = await fetch("/api/defect-out");
      const data = await res.json();
      if (!data.error) setTotalOutQty(data.total_qty || 0);
    } catch { /* ignore */ }
  };

  const fetchInboundRecords = async () => {
    try {
      const res = await fetch("/api/inbound-records");
      const data = await res.json();
      if (Array.isArray(data)) setInboundRecords(data);
    } catch { /* ignore */ }
  };

  const fetchDefectOptions = async () => {
    try {
      const res = await fetch("/api/settings");
      const data = await res.json();
      if (Array.isArray(data?.[DEFECT_KEY]) && data[DEFECT_KEY].length > 0) {
        setDefectOptions(data[DEFECT_KEY]);
      }
    } catch { /* ignore */ }
  };

  const saveDefectOptions = async (options: string[]) => {
    setDefectOptions(options);
    try {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [DEFECT_KEY]: options }),
      });
    } catch {
      showToast("瑕疵细节保存失败", "error");
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 挂载时拉取数据, 与售卖登记等页面同模式
    fetchInboundRecords();
    fetchTotalOutQty();
    fetchDefectOptions();
  }, []);

  // 该编号各尺码已售/已退数量(计算剩余库存用), 与售卖登记同口径
  const fetchSaleDetails = async (saleId: string) => {
    try {
      const [salesRes, returnRes] = await Promise.all([
        fetch(`/api/sales-records?sale_id=${encodeURIComponent(saleId)}`),
        fetch(`/api/return-records?sale_id=${encodeURIComponent(saleId)}`),
      ]);
      const data = await salesRes.json();
      const returnData = await returnRes.json();
      const sold: Record<number, number> = {};
      if (Array.isArray(data)) {
        for (const r of data) {
          const size = Number(r.size);
          sold[size] = (sold[size] || 0) + (Number(r.quantity) || 0);
        }
      }
      setSoldBySize(sold);
      const ret: Record<number, number> = {};
      if (Array.isArray(returnData)) {
        for (const r of returnData) {
          const size = Number(r.size);
          ret[size] = (ret[size] || 0) + (Number(r.quantity) || 0);
        }
      }
      setReturnedBySize(ret);
    } catch {
      setSoldBySize({});
      setReturnedBySize({});
    }
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    setNotFound(false);
    setSelectedRecord(null);
    setSizes(Object.fromEntries(SIZE_OPTIONS.map((s) => [s, 0])));
    setSoldBySize({});
    setReturnedBySize({});
    if (query.trim()) {
      const filtered = inboundRecords.filter(
        (r) =>
          r.sale_id.toLowerCase().includes(query.toLowerCase()) ||
          r.name.toLowerCase().includes(query.toLowerCase())
      );
      setFilteredRecords(filtered);
      setShowDropdown(true);
    } else {
      setFilteredRecords([]);
      setShowDropdown(false);
    }
  };

  const handleSelectRecord = (record: InboundRecord) => {
    setSelectedRecord(record);
    setSearchQuery(record.sale_id);
    setShowDropdown(false);
    setNotFound(false);
    setSizes(Object.fromEntries(SIZE_OPTIONS.map((s) => [s, 0])));
    setReturnPrice(String(record.cost_price || ""));
    fetchSaleDetails(record.sale_id);
  };

  const handleBlur = () => {
    const query = searchQuery.trim();
    if (!query) return;
    const exactMatch = inboundRecords.find(
      (r) => r.sale_id.toLowerCase() === query.toLowerCase()
    );
    if (exactMatch) {
      handleSelectRecord(exactMatch);
    } else {
      setNotFound(true);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      const query = searchQuery.trim();
      if (!query) return;
      const exactMatch = inboundRecords.find(
        (r) => r.sale_id.toLowerCase() === query.toLowerCase()
      );
      if (exactMatch) {
        handleSelectRecord(exactMatch);
        setShowDropdown(false);
      } else {
        setSelectedRecord(null);
        setShowDropdown(false);
        setNotFound(true);
      }
    }
  };

  // 剩余库存 = 入库合计 - 已售 + 已退(与售卖登记同口径)
  const getAvailableStock = (size: number): number => {
    if (!selectedRecord) return 0;
    const inboundTotal = inboundRecords
      .filter((r) => r.sale_id.toLowerCase() === selectedRecord.sale_id.toLowerCase())
      .reduce((sum, r) => sum + getStock(r, size), 0);
    return Math.max(0, inboundTotal - (soldBySize[size] || 0) + (returnedBySize[size] || 0));
  };

  const hasAnySizeSelected = Object.values(sizes).some((v) => v > 0);

  const isSizeDisabled = (size: number): boolean => {
    if (!selectedRecord) return true;
    if (getAvailableStock(size) === 0) return true;
    if (hasAnySizeSelected && (sizes[size] || 0) === 0) return true;
    return false;
  };

  const updateSize = (size: number, delta: number) => {
    if (isSizeDisabled(size) && delta > 0) return;
    const maxStock = getAvailableStock(size);
    setSizes((prev) => {
      const current = prev[size] || 0;
      const next = Math.max(0, Math.min(current + delta, maxStock));
      return { ...prev, [size]: next };
    });
  };

  const setSizeValue = (size: number, value: string) => {
    if (isSizeDisabled(size)) return;
    const num = parseInt(value, 10);
    const maxStock = getAvailableStock(size);
    const clamped = isNaN(num) ? 0 : Math.max(0, Math.min(num, maxStock));
    setSizes((prev) => ({ ...prev, [size]: clamped }));
  };

  const handleSubmit = async () => {
    if (!selectedRecord) {
      showToast("请选择有效的售卖编号(须已入库)", "error");
      return;
    }
    const items = SIZE_OPTIONS.filter((s) => (sizes[s] || 0) > 0).map((size) => ({
      size,
      quantity: sizes[size] || 0,
    }));
    if (items.length === 0) {
      showToast("请至少选择一个尺码并输入数量", "error");
      return;
    }
    if (!defectType) {
      showToast("请选择瑕疵细节", "error");
      return;
    }

    setSubmitting(true);
    const registrant = localStorage.getItem("member_name") || "未知";
    try {
      const res = await fetch("/api/defect-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sale_id: selectedRecord.sale_id,
          items,
          cost_price: Number(returnPrice) || selectedRecord.cost_price || 0,
          defect_type: defectType,
          notes: notes.trim(),
          registrant,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`瑕疵出库成功, 共 ${data.total_qty} 件已从入库登记扣减`, "success");
        setSelectedRecord(null);
        setSearchQuery("");
        setReturnPrice("");
        setDefectType("");
        setNotes("");
        setSizes(Object.fromEntries(SIZE_OPTIONS.map((s) => [s, 0])));
        setNotFound(false);
        fetchTotalOutQty();
      } else {
        showToast("瑕疵出库失败: " + (data.error || "未知错误"), "error");
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
          <span className="highlight-pink">瑕疵出库</span>
        </h1>
        <p className="text-lg lg:text-3xl font-extrabold text-[#FF6B7A] ml-auto">{totalOutQty} 件</p>
      </div>

      <div className="max-w-2xl mx-auto">
        {/* Sale ID */}
        <div className="mb-6">
          <label className="text-sm lg:text-base font-extrabold text-gray-900 mb-1 block">
            售卖编号 <span className="text-red-500">*</span>
          </label>
          <p className="text-[10px] lg:text-xs text-gray-400 mb-2">
            输入编号搜索已入库商品，未入库的编号不能瑕疵出库
          </p>
          <SaleIdSearch
            value={searchQuery}
            onValueChange={handleSearch}
            open={showDropdown}
            onOpenChange={setShowDropdown}
            options={filteredRecords.map((r) => ({
              key: r.sale_id,
              title: r.sale_id,
              subtitle: `${r.name || "未命名"} · ${r.manufacturer} · 进价: ¥${r.cost_price}`,
              photoUrl: r.photo,
            }))}
            onSelect={(opt) => {
              const rec = inboundRecords.find((r) => r.sale_id === opt.key);
              if (rec) handleSelectRecord(rec);
            }}
            onInputFocus={() => {
              if (searchQuery.trim() && filteredRecords.length > 0 && !selectedRecord) {
                setShowDropdown(true);
              }
            }}
            onInputBlur={handleBlur}
            onKeyDown={handleKeyDown}
            placeholder="输入售卖编号或名称搜索..."
          />

          {/* 未入库提示 */}
          {notFound && (
            <div className="mt-3 p-4 rounded-xl border-[3px] border-red-400 bg-red-50 flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
              <div>
                <p className="text-sm font-extrabold text-red-600">未入库商品</p>
                <p className="text-xs text-red-500">
                  编号 &quot;{searchQuery}&quot; 未在入库记录中找到，不能瑕疵出库
                </p>
              </div>
            </div>
          )}

          {/* Selected Record Info */}
          {selectedRecord && (
            <div className="mt-3 p-4 rounded-xl border-[3px] border-gray-900 bg-gray-50">
              <div className="flex items-center gap-3">
                {selectedRecord.photo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={selectedRecord.photo}
                    alt=""
                    className="w-16 h-16 rounded-lg object-cover border-2 border-gray-300"
                  />
                )}
                <div className="text-sm">
                  <p className="font-extrabold text-gray-900">{selectedRecord.manufacturer}</p>
                  <p className="text-gray-500">{selectedRecord.name || "未命名"}</p>
                  <p className="text-[#4A90E2] font-bold">货架: {selectedRecord.shelf_no || "无"}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 厂家退货价 */}
        <div className="mb-6">
          <label className="text-sm lg:text-base font-extrabold text-gray-900 mb-1 block">
            厂家退货价(元/件)
          </label>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={returnPrice}
            onChange={(e) => setReturnPrice(e.target.value)}
            placeholder={selectedRecord ? "已按入库进价自动填入" : "请先选择售卖编号"}
            className="text-sm"
            readOnly={!selectedRecord}
          />
          {selectedRecord && (
            <p className="text-xs font-bold text-gray-400 mt-1">
              已自动识别入库进价 ¥{selectedRecord.cost_price}，如与厂家协商价不同可修改
            </p>
          )}
        </div>

        {/* Sizes */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm lg:text-base font-extrabold text-gray-900">
              尺码与数量
            </label>
            <span className="text-xs lg:text-sm font-bold text-gray-500">
              合计: <NumberPop value={totalSizeCount} /> 件
            </span>
          </div>
          <p className="text-[10px] lg:text-xs text-gray-400 mb-2">
            仅入库后仍有剩余库存的尺码可选，出库后自动从入库登记中扣减
          </p>
          {!selectedRecord && (
            <p className="text-xs text-gray-400 mb-3">请先选择售卖编号后再选择尺码</p>
          )}
          <SizeGrid
            sizeList={SIZE_OPTIONS}
            sizes={sizes}
            onDelta={updateSize}
            onSetValue={setSizeValue}
            limitOf={getAvailableStock}
            disabledOf={isSizeDisabled}
            badgeOf={(size) => {
              const stock = getAvailableStock(size);
              return stock > 0 ? `库存:${stock}` : "无库存";
            }}
          />
        </div>

        {/* 瑕疵细节 */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm lg:text-base font-extrabold text-gray-900">
              瑕疵细节 <span className="text-red-500">*</span>
            </label>
            <button
              type="button"
              onClick={() => setShowDefectManage((v) => !v)}
              className="flex items-center gap-1 text-xs font-bold text-[#4A90E2] hover:underline"
            >
              <Settings2 className="h-3.5 w-3.5" />管理瑕疵细节
            </button>
          </div>
          <select
            value={defectType}
            onChange={(e) => setDefectType(e.target.value)}
            className="neo-input w-full text-sm"
          >
            <option value="">请选择瑕疵细节...</option>
            {defectOptions.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>

          {/* 瑕疵细节管理(增删, 存 settings 表) */}
          {showDefectManage && (
            <div className="mt-3 p-3 rounded-xl border-[3px] border-gray-900 bg-gray-50">
              <div className="flex gap-2 mb-2">
                <Input
                  value={newDefect}
                  onChange={(e) => setNewDefect(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newDefect.trim()) {
                      if (!defectOptions.includes(newDefect.trim())) {
                        saveDefectOptions([...defectOptions, newDefect.trim()]);
                      }
                      setNewDefect("");
                    }
                  }}
                  placeholder="输入新瑕疵细节，回车添加..."
                  className="text-sm flex-1"
                />
                <Button
                  type="button"
                  onClick={() => {
                    if (!newDefect.trim()) return;
                    if (defectOptions.includes(newDefect.trim())) {
                      showToast("该瑕疵细节已存在", "error");
                      return;
                    }
                    saveDefectOptions([...defectOptions, newDefect.trim()]);
                    setNewDefect("");
                  }}
                  className="neo-btn px-3 h-[42px] bg-[#4CD964] text-white shrink-0"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {defectOptions.map((opt) => (
                  <span
                    key={opt}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border-[2px] border-gray-900 bg-white text-xs font-bold"
                  >
                    {opt}
                    <button
                      type="button"
                      aria-label={`删除 ${opt}`}
                      onClick={() => saveDefectOptions(defectOptions.filter((o) => o !== opt))}
                      className="text-red-400 hover:text-red-600"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
              </div>
              <p className="text-[10px] text-gray-400 mt-2">增删后会保存到设置，全站生效</p>
            </div>
          )}
        </div>

        {/* Notes */}
        <div className="mb-8">
          <label className="text-sm lg:text-base font-extrabold text-gray-900 mb-1 block">
            备注 <span className="text-xs font-normal text-gray-400">(非必填)</span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="请输入备注信息..."
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
          {submitting ? "提交中..." : "提交瑕疵出库"}
        </Button>
      </div>
    </PageWrapper>
  );
}
