"use client";

import { useState, useRef } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Camera,
  Image,
  Plus,
  Minus,
  Settings2,
  PlusCircle,
  X,
  GripVertical,
} from "lucide-react";
import Link from "next/link";
import { PageWrapper } from "@/components/page-wrapper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const DEFAULT_MANUFACTURERS = [
  "大炳家", "小礼物", "海燕家", "曾姐姐", "程祥家", "老刘家",
  "茶七厘家", "大咖家", "梓东家", "米可鑫家", "红姐家", "一鸣家",
  "小渔家", "奇布鲁家", "笨笨家", "小绵羊家", "婴时尚家", "啊正家",
  "钱多多家", "化磊家", "喜宝家", "收购家", "衣品汇家", "程哲家",
  "梨子家", "韩瑞家", "静静家", "衣鞋柜家", "晓晓家", "晓丽家",
  "甜妈家", "番薯家", "圆啊圆", "可乐家", "可可家", "凑凑",
  "童优格", "艾衣诺", "幸运儿", "丹丹家", "百变童年", "大妞童装",
  "阿勇", "丫丫家", "陈丽家",
];

const SIZE_OPTIONS = [80, 90, 95, 100, 105, 110, 120, 130, 140, 150, 160, 170, 180];

const SEASON_CATEGORIES = ["春季", "夏季", "秋季", "冬季", "四季通用"];

const STYLE_CATEGORIES = ["T恤", "裤子", "裙子", "外套", "卫衣", "套装", "连体衣", "羽绒服", "衬衫", "内衣", "配饰", "其他"];

export default function InboundPage() {
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [saleId, setSaleId] = useState("");
  const [name, setName] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [sizes, setSizes] = useState<Record<number, number>>(
    Object.fromEntries(SIZE_OPTIONS.map((s) => [s, 0]))
  );
  const [shelfNo, setShelfNo] = useState("");
  const [notes, setNotes] = useState("");
  const [season, setSeason] = useState("");
  const [style, setStyle] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [manufacturers, setManufacturers] = useState<string[]>(DEFAULT_MANUFACTURERS);
  const [showMfrDialog, setShowMfrDialog] = useState(false);
  const [newMfrName, setNewMfrName] = useState("");
  const [mfrSortMode, setMfrSortMode] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoFile(file);
      const reader = new FileReader();
      reader.onload = (ev) => setPhoto(ev.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const updateSize = (size: number, delta: number) => {
    setSizes((prev) => ({
      ...prev,
      [size]: Math.max(0, (prev[size] || 0) + delta),
    }));
  };

  const setSizeValue = (size: number, value: string) => {
    const num = parseInt(value, 10);
    setSizes((prev) => ({
      ...prev,
      [size]: isNaN(num) ? 0 : Math.max(0, num),
    }));
  };

  const addManufacturer = () => {
    const trimmed = newMfrName.trim();
    if (trimmed && !manufacturers.includes(trimmed)) {
      setManufacturers((prev) => [...prev, trimmed]);
    }
    setNewMfrName("");
    setShowMfrDialog(false);
  };

  const removeManufacturer = (name: string) => {
    setManufacturers((prev) => prev.filter((m) => m !== name));
    if (manufacturer === name) setManufacturer("");
  };

  const moveManufacturer = (fromIndex: number, toIndex: number) => {
    setManufacturers((prev) => {
      const arr = [...prev];
      const [item] = arr.splice(fromIndex, 1);
      arr.splice(toIndex, 0, item);
      return arr;
    });
  };

  const handleSubmit = async () => {
    if (!saleId.trim()) {
      alert("请输入售卖编号");
      return;
    }
    if (!manufacturer) {
      alert("请选择厂家名称");
      return;
    }
    if (!costPrice || isNaN(Number(costPrice))) {
      alert("请输入有效的进价");
      return;
    }

    setSubmitting(true);

    const totalQty = Object.values(sizes).reduce((sum, v) => sum + v, 0);

    const product = {
      id: saleId.trim(),
      sale_id: saleId.trim(),
      manufacturer,
      photo: photo || "",
      name: name.trim(),
      total_stock: totalQty,
      sold_qty: 0,
      remaining_stock: totalQty,
      shelf_no: shelfNo.trim(),
      size_80: sizes[80] || 0,
      size_90: sizes[90] || 0,
      size_95: sizes[95] || 0,
      size_100: sizes[100] || 0,
      size_105: sizes[105] || 0,
      size_110: sizes[110] || 0,
      size_120: sizes[120] || 0,
      size_130: sizes[130] || 0,
      size_140: sizes[140] || 0,
      size_150: sizes[150] || 0,
      size_160: sizes[160] || 0,
      size_170: sizes[170] || 0,
      size_180: sizes[180] || 0,
      stock_warning: 10,
      cost_price: Number(costPrice),
      sell_price: 0,
      profit: 0,
      return_qty: 0,
      return_rate: 0,
      inventory_value: totalQty * Number(costPrice),
      last_order_time: new Date().toISOString().split("T")[0],
      status: "active",
      notes: notes.trim(),
      season: season,
      style_category: style,
    };

    try {
      const productRes = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(product),
      });

      if (!productRes.ok) {
        const err = await productRes.json();
        alert("商品入库失败: " + (err.error || "未知错误"));
        return;
      }

      const inboundRecord = {
        sale_id: saleId.trim(),
        photo: photo || "",
        name: name.trim(),
        manufacturer,
        size_80: sizes[80] || 0,
        size_90: sizes[90] || 0,
        size_95: sizes[95] || 0,
        size_100: sizes[100] || 0,
        size_105: sizes[105] || 0,
        size_110: sizes[110] || 0,
        size_120: sizes[120] || 0,
        size_130: sizes[130] || 0,
        size_140: sizes[140] || 0,
        size_150: sizes[150] || 0,
        size_160: sizes[160] || 0,
        size_170: sizes[170] || 0,
        size_180: sizes[180] || 0,
        shelf_no: shelfNo.trim(),
        cost_price: Number(costPrice),
        season,
        style_category: style,
        notes: notes.trim(),
      };

      const inboundRes = await fetch("/api/inbound-records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(inboundRecord),
      });

      if (inboundRes.ok) {
        alert("入库登记成功！");
        setPhoto(null);
        setPhotoFile(null);
        setSaleId("");
        setName("");
        setManufacturer("");
        setCostPrice("");
        setSizes(Object.fromEntries(SIZE_OPTIONS.map((s) => [s, 0])));
        setShelfNo("");
        setNotes("");
        setSeason("");
        setStyle("");
      } else {
        const err = await inboundRes.json();
        alert("入库记录写入失败: " + (err.error || "未知错误"));
      }
    } catch (err) {
      alert("网络错误，请重试");
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
          <span className="highlight-yellow">入库登记</span>
        </h1>
      </div>

      <div className="max-w-2xl mx-auto">
        {/* Photo Upload */}
        <div className="mb-6">
          <label className="text-sm lg:text-base font-extrabold text-gray-900 mb-2 block">
            商品照片
          </label>
          <div className="flex gap-3">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 h-[200px] rounded-xl border-[3px] border-dashed border-gray-400 bg-gray-50 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-gray-900 hover:bg-gray-100 transition-all"
            >
              {photo ? (
                <img src={photo} alt="Preview" className="w-full h-full object-cover rounded-lg" />
              ) : (
                <>
                  <Image className="h-8 w-8 text-gray-400" />
                  <span className="text-xs font-bold text-gray-400">点击上传照片</span>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoUpload}
                className="hidden"
              />
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => cameraInputRef.current?.click()}
                className="flex h-10 w-10 items-center justify-center rounded-xl border-[3px] border-gray-900 bg-[#4A90E2] shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[3px] active:translate-y-[3px] transition-all"
                title="拍照"
              >
                <Camera className="h-5 w-5 text-white" />
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex h-10 w-10 items-center justify-center rounded-xl border-[3px] border-gray-900 bg-[#FFC93C] shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[3px] active:translate-y-[3px] transition-all"
                title="从相册选择"
              >
                <Image className="h-5 w-5 text-gray-900" />
              </button>
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handlePhotoUpload}
                className="hidden"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 mb-6">
          {/* Sale ID */}
          <div>
            <label className="text-sm lg:text-base font-extrabold text-gray-900 mb-1 block">
              售卖编号 <span className="text-red-500">*</span>
            </label>
            <Input
              value={saleId}
              onChange={(e) => setSaleId(e.target.value)}
              placeholder="例如: WUHE001"
              className="text-sm"
            />
          </div>

          {/* Name */}
          <div>
            <label className="text-sm lg:text-base font-extrabold text-gray-900 mb-1 block">
              衣服名称 <span className="text-xs font-normal text-gray-400">(非必填)</span>
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如: 夏季短袖T恤"
              className="text-sm"
            />
          </div>

          {/* Manufacturer */}
          <div>
            <label className="text-sm lg:text-base font-extrabold text-gray-900 mb-1 block">
              厂家名称 <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <select
                  value={manufacturer}
                  onChange={(e) => setManufacturer(e.target.value)}
                  className="neo-input w-full text-sm pr-8"
                >
                  <option value="">请选择厂家</option>
                  {manufacturers.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={() => setShowMfrDialog(true)}
                className="flex h-10 w-10 items-center justify-center rounded-xl border-[3px] border-gray-900 bg-gray-100 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[3px] active:translate-y-[3px] transition-all"
                title="管理厂家"
              >
                <Settings2 className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Cost Price */}
          <div>
            <label className="text-sm lg:text-base font-extrabold text-gray-900 mb-1 block">
              进价 <span className="text-red-500">*</span>
            </label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={costPrice}
              onChange={(e) => setCostPrice(e.target.value)}
              placeholder="例如: 29.9"
              className="text-sm"
            />
          </div>

          {/* Shelf No */}
          <div>
            <label className="text-sm lg:text-base font-extrabold text-gray-900 mb-1 block">
              货架号
            </label>
            <Input
              value={shelfNo}
              onChange={(e) => setShelfNo(e.target.value)}
              placeholder="例如: A-01"
              className="text-sm"
            />
          </div>

          {/* Season */}
          <div>
            <label className="text-sm lg:text-base font-extrabold text-gray-900 mb-1 block">
              季节分类
            </label>
            <select
              value={season}
              onChange={(e) => setSeason(e.target.value)}
              className="neo-input w-full text-sm"
            >
              <option value="">请选择季节</option>
              {SEASON_CATEGORIES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Style */}
          <div>
            <label className="text-sm lg:text-base font-extrabold text-gray-900 mb-1 block">
              款式分类
            </label>
            <select
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              className="neo-input w-full text-sm"
            >
              <option value="">请选择款式</option>
              {STYLE_CATEGORIES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Sizes */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm lg:text-base font-extrabold text-gray-900">
              尺码数量
            </label>
            <span className="text-xs lg:text-sm font-bold text-gray-500">
              合计: {totalSizeCount} 件
            </span>
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-7 lg:grid-cols-7 gap-2 lg:gap-3">
            {SIZE_OPTIONS.map((size) => (
              <div
                key={size}
                className="rounded-xl border-[3px] border-gray-900 bg-white p-1.5 lg:p-2"
              >
                <div className="text-center text-[10px] lg:text-xs font-extrabold text-gray-500 mb-1">
                  {size}
                </div>
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => updateSize(size, -1)}
                    className="flex h-5 w-5 lg:h-6 lg:w-6 items-center justify-center rounded-md border-[2px] border-gray-900 bg-[#FF6B7A] text-white active:scale-90 transition-transform"
                  >
                    <Minus className="h-2.5 w-2.5 lg:h-3 lg:w-3" />
                  </button>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={sizes[size] || 0}
                    onChange={(e) => setSizeValue(size, e.target.value)}
                    className="w-full text-center text-xs lg:text-sm font-extrabold text-gray-900 border-none outline-none bg-transparent"
                  />
                  <button
                    type="button"
                    onClick={() => updateSize(size, 1)}
                    className="flex h-5 w-5 lg:h-6 lg:w-6 items-center justify-center rounded-md border-[2px] border-gray-900 bg-[#4CD964] text-white active:scale-90 transition-transform"
                  >
                    <Plus className="h-2.5 w-2.5 lg:h-3 lg:w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
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
          {submitting ? "提交中..." : "提交入库"}
        </Button>
      </div>

      {/* Manufacturer Dialog */}
      {showMfrDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-[90%] max-w-md max-h-[80vh] bg-white rounded-2xl border-[3px] border-gray-900 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] p-6 flex flex-col"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-extrabold">厂家管理</h2>
              <button
                onClick={() => {
                  setShowMfrDialog(false);
                  setMfrSortMode(false);
                }}
                className="flex h-8 w-8 items-center justify-center rounded-lg border-[2px] border-gray-900 hover:bg-gray-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Add new */}
            <div className="flex gap-2 mb-4">
              <Input
                value={newMfrName}
                onChange={(e) => setNewMfrName(e.target.value)}
                placeholder="输入新厂家名称"
                className="text-sm flex-1"
                onKeyDown={(e) => e.key === "Enter" && addManufacturer()}
              />
              <button
                onClick={addManufacturer}
                className="flex h-10 w-10 items-center justify-center rounded-xl border-[3px] border-gray-900 bg-[#4CD964] shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[3px] active:translate-y-[3px] transition-all"
              >
                <PlusCircle className="h-5 w-5 text-white" />
              </button>
            </div>

            {/* Toggle sort mode */}
            <button
              onClick={() => setMfrSortMode(!mfrSortMode)}
              className="text-xs font-bold text-[#4A90E2] mb-3 self-start"
            >
              {mfrSortMode ? "完成排序" : "拖拽排序"}
            </button>

            {/* Manufacturer list */}
            <div className="flex-1 overflow-y-auto space-y-1">
              {manufacturers.map((m, index) => (
                <div
                  key={m}
                  draggable={mfrSortMode}
                  onDragStart={() => mfrSortMode && setDragIndex(index)}
                  onDragOver={(e) => {
                    if (mfrSortMode && dragIndex !== null && dragIndex !== index) {
                      e.preventDefault();
                      moveManufacturer(dragIndex, index);
                      setDragIndex(index);
                    }
                  }}
                  onDragEnd={() => setDragIndex(null)}
                  className={`flex items-center justify-between p-2 rounded-lg border-[2px] border-gray-200 ${
                    mfrSortMode ? "cursor-grab active:cursor-grabbing" : ""
                  } ${index === dragIndex ? "bg-gray-100" : ""}`}
                >
                  <div className="flex items-center gap-2">
                    {mfrSortMode && <GripVertical className="h-4 w-4 text-gray-400" />}
                    <span className="text-sm font-bold">{m}</span>
                  </div>
                  <button
                    onClick={() => removeManufacturer(m)}
                    className="flex h-6 w-6 items-center justify-center rounded-md border-[2px] border-gray-300 text-red-400 hover:bg-red-50 hover:border-red-400"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      )}
    </PageWrapper>
  );
}