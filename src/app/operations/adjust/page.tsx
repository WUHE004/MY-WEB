"use client";

import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Camera,
  Image,
  Rows4,
  Tags,
  Type,
  Upload,
  CheckCircle2,
  Loader2,
  Search,
  X,
  Settings2,
} from "lucide-react";
import Link from "next/link";
import { PageWrapper } from "@/components/page-wrapper";

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

const SEASON_CATEGORIES = ["春季", "夏季", "秋季", "冬季", "四季通用"];
const DEFAULT_SIZE_STYLES = ["T恤", "裤子", "裙子", "外套", "卫衣", "套装", "连体衣", "羽绒服", "衬衫", "内衣", "其他"];
const DEFAULT_NO_SIZE_STYLES = ["母婴", "日用", "配饰"];
const DEFAULT_SHELF_DATA: Record<string, number[]> = { A: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], B: [1, 2], C: [1, 2, 3, 4, 5] };
const DEFAULT_LAYERS = [1, 2, 3, 4, 5];

type TabType = "photo" | "shelf" | "category" | "name";

interface Product {
  sale_id: string;
  name: string;
  photo: string;
  shelf_no: string;
  season: string;
  style_category: string;
  manufacturer: string;
}

export default function AdjustPage() {
  const [activeTab, setActiveTab] = useState<TabType>("photo");
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // 当前选中商品
  const [selectedId, setSelectedId] = useState("");

  // 照片调整
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoSaving, setPhotoSaving] = useState(false);

  // 货架调整
  const [shelfLevel1, setShelfLevel1] = useState("");
  const [shelfLevel2, setShelfLevel2] = useState("");
  const [shelfLevel3, setShelfLevel3] = useState("");
  const [shelfSaving, setShelfSaving] = useState(false);

  // 分类调整
  const [season, setSeason] = useState("");
  const [style, setStyle] = useState("");
  const [categorySaving, setCategorySaving] = useState(false);

  // 名称调整
  const [newName, setNewName] = useState("");
  const [nameSaving, setNameSaving] = useState(false);

  // 设置数据
  const [manufacturers, setManufacturers] = useState<string[]>(DEFAULT_MANUFACTURERS);
  const [shelfData, setShelfData] = useState<Record<string, number[]>>(DEFAULT_SHELF_DATA);
  const [sizeStyles, setSizeStyles] = useState<string[]>(DEFAULT_SIZE_STYLES);
  const [noSizeStyles, setNoSizeStyles] = useState<string[]>(DEFAULT_NO_SIZE_STYLES);

  // 保存反馈
  const [saveMsg, setSaveMsg] = useState("");

  useEffect(() => {
    fetchProducts();
    fetchSettings();
  }, []);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/inbound-records");
      const data = await res.json();
      if (Array.isArray(data)) {
        setProducts(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch("/api/settings");
      const data = await res.json();
      if (data.manufacturers && Array.isArray(data.manufacturers)) setManufacturers(data.manufacturers);
      if (data.shelf_data && typeof data.shelf_data === "object") setShelfData(data.shelf_data as Record<string, number[]>);
      if (data.size_styles && Array.isArray(data.size_styles)) setSizeStyles(data.size_styles);
      if (data.no_size_styles && Array.isArray(data.no_size_styles)) setNoSizeStyles(data.no_size_styles);
    } catch { /* ignore */ }
  };

  // 根据当前 tab 筛选缺少对应字段的商品
  const filteredProducts = useMemo(() => {
    let result = products;
    if (activeTab === "photo") {
      result = result.filter((p) => !p.photo || p.photo.trim() === "");
    } else if (activeTab === "shelf") {
      result = result.filter((p) => !p.shelf_no || p.shelf_no.trim() === "" || p.shelf_no === "0");
    } else if (activeTab === "category") {
      result = result.filter((p) => (!p.season || p.season.trim() === "") || (!p.style_category || p.style_category.trim() === ""));
    } else if (activeTab === "name") {
      result = result.filter((p) => !p.name || p.name.trim() === "");
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((p) => p.sale_id.toLowerCase().includes(q) || (p.name && p.name.toLowerCase().includes(q)));
    }
    return result;
  }, [products, activeTab, search]);

  // 货架号选项
  const shelfOptions = useMemo(() => {
    const options: string[] = [];
    for (const [row, nums] of Object.entries(shelfData)) {
      for (const num of nums) {
        for (const layer of DEFAULT_LAYERS) {
          options.push(`${row}-${num}-${layer}`);
        }
      }
    }
    return options.sort();
  }, [shelfData]);

  // 款式选项
  const styleOptions = useMemo(() => {
    return [...sizeStyles, ...noSizeStyles].sort();
  }, [sizeStyles, noSizeStyles]);

  const selectedProduct = products.find((p) => p.sale_id === selectedId);

  const getShelfNo = () => {
    if (shelfLevel1 && shelfLevel2 && shelfLevel3) {
      return `${shelfLevel1}-${shelfLevel2}-${shelfLevel3}`;
    }
    return "";
  };

  // 切换 Tab 时重置
  const switchTab = (tab: TabType) => {
    setActiveTab(tab);
    setSelectedId("");
    setSearch("");
    setSaveMsg("");
    setPhotoFile(null);
    setPhotoPreview(null);
    setShelfLevel1("");
    setShelfLevel2("");
    setShelfLevel3("");
    setSeason("");
    setStyle("");
    setNewName("");
  };

  // 照片上传
  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const uploadPhoto = async (): Promise<string> => {
    if (!photoFile) throw new Error("未选择照片");
    setPhotoUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", photoFile);
      formData.append("folder", "products");
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (!res.ok) throw new Error("上传失败");
      const data = await res.json();
      return data.url || "";
    } finally {
      setPhotoUploading(false);
    }
  };

  // 保存照片
  const savePhoto = async () => {
    if (!selectedId) return;
    setPhotoSaving(true);
    setSaveMsg("");
    try {
      let photoUrl = "";
      if (photoFile) {
        photoUrl = await uploadPhoto();
      }
      if (!photoUrl) { setSaveMsg("请先选择照片"); return; }

      const res = await fetch("/api/inbound-records", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sale_id: selectedId, photo: photoUrl }),
      });
      if (!res.ok) throw new Error("保存失败");
      setSaveMsg("照片保存成功");
      setPhotoFile(null);
      setPhotoPreview(null);
      fetchProducts();
    } catch (err) {
      setSaveMsg("保存失败: " + (err instanceof Error ? err.message : ""));
    } finally {
      setPhotoSaving(false);
    }
  };

  // 保存货架
  const saveShelf = async () => {
    const shelfNo = getShelfNo();
    if (!selectedId || !shelfNo) { setSaveMsg("请选择货架号"); return; }
    setShelfSaving(true);
    setSaveMsg("");
    try {
      const res = await fetch("/api/inbound-records", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sale_id: selectedId, shelf_no: shelfNo }),
      });
      if (!res.ok) throw new Error("保存失败");
      setSaveMsg("货架号保存成功");
      setShelfLevel1(""); setShelfLevel2(""); setShelfLevel3("");
      fetchProducts();
    } catch (err) {
      setSaveMsg("保存失败: " + (err instanceof Error ? err.message : ""));
    } finally {
      setShelfSaving(false);
    }
  };

  // 保存分类
  const saveCategory = async () => {
    if (!selectedId) return;
    if (!season && !style) { setSaveMsg("请至少选择季节或款式"); return; }
    setCategorySaving(true);
    setSaveMsg("");
    try {
      const body: Record<string, string> = { sale_id: selectedId };
      if (season) body.season = season;
      if (style) body.style_category = style;

      const res = await fetch("/api/inbound-records", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("保存失败");
      setSaveMsg("分类保存成功");
      setSeason(""); setStyle("");
      fetchProducts();
    } catch (err) {
      setSaveMsg("保存失败: " + (err instanceof Error ? err.message : ""));
    } finally {
      setCategorySaving(false);
    }
  };

  // 保存名称
  const saveName = async () => {
    if (!selectedId || !newName.trim()) { setSaveMsg("请输入名称"); return; }
    setNameSaving(true);
    setSaveMsg("");
    try {
      const res = await fetch("/api/inbound-records", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sale_id: selectedId, name: newName.trim() }),
      });
      if (!res.ok) throw new Error("保存失败");
      setSaveMsg("名称保存成功");
      setNewName("");
      fetchProducts();
    } catch (err) {
      setSaveMsg("保存失败: " + (err instanceof Error ? err.message : ""));
    } finally {
      setNameSaving(false);
    }
  };

  const tabs: { key: TabType; label: string; icon: React.ReactNode }[] = [
    { key: "photo", label: "照片调整", icon: <Camera className="h-4 w-4" /> },
    { key: "shelf", label: "货架调整", icon: <Rows4 className="h-4 w-4" /> },
    { key: "category", label: "分类调整", icon: <Tags className="h-4 w-4" /> },
    { key: "name", label: "名称调整", icon: <Type className="h-4 w-4" /> },
  ];

  const tabDescription: Record<TabType, string> = {
    photo: "为没有图片的商品上传照片",
    shelf: "为没有货架号的商品添加货架号",
    category: "为没有季节/款式分类的商品补齐分类",
    name: "为没有名称的商品添加名称",
  };

  return (
    <PageWrapper>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/links"
          className="flex items-center gap-1 px-3 py-2 rounded-xl border-[3px] border-gray-900 bg-white font-bold text-xs shadow-[3px_3px_0px_0px_rgba(0,0,0,0.3)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,0.3)] hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          返回
        </Link>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900">
          <span className="highlight-yellow">入库调整</span>
        </h1>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-4">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => switchTab(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl border-[3px] font-bold text-xs lg:text-sm transition-all ${
              activeTab === tab.key
                ? "border-gray-900 bg-gray-900 text-white shadow-[3px_3px_0px_0px_rgba(0,0,0,0.3)]"
                : "border-gray-300 bg-white text-gray-600 hover:border-gray-900"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      <p className="text-sm text-gray-500 mb-4">{tabDescription[activeTab]}</p>

      {/* 商品选择 */}
      <div className="bg-white rounded-2xl border-[3px] border-gray-900 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Search className="h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="搜索商品编号..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 text-sm border-2 border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:border-gray-900"
          />
          <span className="text-xs text-gray-400 shrink-0">{filteredProducts.length} 个待处理</span>
        </div>
        <select
          value={selectedId}
          onChange={(e) => {
            setSelectedId(e.target.value);
            setSaveMsg("");
            // 重置表单
            setPhotoFile(null); setPhotoPreview(null);
            setShelfLevel1(""); setShelfLevel2(""); setShelfLevel3("");
            setSeason(""); setStyle(""); setNewName("");
          }}
          className="w-full text-sm border-2 border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-gray-900 font-bold"
        >
          <option value="">-- 请选择商品编号 --</option>
          {filteredProducts.map((p) => (
            <option key={p.sale_id} value={p.sale_id}>
              {p.sale_id} {p.name ? `- ${p.name}` : ""}
            </option>
          ))}
        </select>
      </div>

      {/* 调整表单 */}
      {selectedId && selectedProduct && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl border-[3px] border-gray-900 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-4 mb-4"
        >
          <div className="flex items-center gap-3 mb-4 pb-3 border-b-2 border-gray-200">
            <div className="w-16 h-16 rounded-lg border-2 border-gray-200 overflow-hidden bg-gray-100 shrink-0">
              {selectedProduct.photo ? (
                <img src={selectedProduct.photo} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center"><Image className="h-6 w-6 text-gray-300" /></div>
              )}
            </div>
            <div>
              <div className="font-extrabold text-gray-900">{selectedProduct.sale_id}</div>
              <div className="text-xs text-gray-500">{selectedProduct.name || "未命名"}</div>
              <div className="text-xs text-gray-400">
                {selectedProduct.manufacturer || "未知厂家"} | {selectedProduct.shelf_no || "无货架"} | {selectedProduct.season || "无季节"} | {selectedProduct.style_category || "无款式"}
              </div>
            </div>
          </div>

          {/* 照片调整 */}
          {activeTab === "photo" && (
            <div>
              <label className="text-sm font-extrabold text-gray-900 mb-2 block">上传商品照片</label>
              <div className="flex gap-3 items-start">
                <div className="w-32 h-40 rounded-lg border-2 border-dashed border-gray-300 overflow-hidden bg-gray-50 flex items-center justify-center cursor-pointer hover:border-gray-900 transition-colors"
                  onClick={() => document.getElementById("photo-input")?.click()}
                >
                  {photoPreview ? (
                    <img src={photoPreview} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex flex-col items-center gap-1 text-gray-400">
                      <Upload className="h-6 w-6" />
                      <span className="text-[10px] font-bold">点击上传</span>
                    </div>
                  )}
                </div>
                <input id="photo-input" type="file" accept="image/*" onChange={handlePhotoSelect} className="hidden" />
                <div className="flex-1">
                  <p className="text-xs text-gray-500 mb-2">选择商品照片后点击保存，照片将上传到云端并关联到该商品。</p>
                  <button
                    onClick={savePhoto}
                    disabled={photoSaving || photoUploading || !photoFile}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl border-[3px] border-gray-900 bg-[#4A90E2] text-white font-extrabold text-sm shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {photoSaving || photoUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    保存照片
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 货架调整 */}
          {activeTab === "shelf" && (
            <div>
              <label className="text-sm font-extrabold text-gray-900 mb-2 block">添加货架号</label>
              <div className="flex gap-2">
                <select
                  value={shelfLevel1}
                  onChange={(e) => { setShelfLevel1(e.target.value); setShelfLevel2(""); setShelfLevel3(""); }}
                  className="flex-1 text-sm border-2 border-gray-300 rounded-lg px-2 py-2 focus:outline-none focus:border-gray-900 font-bold"
                >
                  <option value="">一排</option>
                  {Object.keys(shelfData).map((k) => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>
                <select
                  value={shelfLevel2}
                  onChange={(e) => { setShelfLevel2(e.target.value); setShelfLevel3(""); }}
                  disabled={!shelfLevel1}
                  className="flex-1 text-sm border-2 border-gray-300 rounded-lg px-2 py-2 focus:outline-none focus:border-gray-900 font-bold disabled:opacity-40"
                >
                  <option value="">货架号</option>
                  {shelfLevel1 && (shelfData[shelfLevel1] || []).map((n) => (
                    <option key={n} value={String(n)}>{n}</option>
                  ))}
                </select>
                <select
                  value={shelfLevel3}
                  onChange={(e) => setShelfLevel3(e.target.value)}
                  disabled={!shelfLevel2}
                  className="flex-1 text-sm border-2 border-gray-300 rounded-lg px-2 py-2 focus:outline-none focus:border-gray-900 font-bold disabled:opacity-40"
                >
                  <option value="">层</option>
                  {DEFAULT_LAYERS.map((n) => (
                    <option key={n} value={String(n)}>{n}</option>
                  ))}
                </select>
              </div>
              {getShelfNo() && (
                <p className="text-xs text-gray-500 mt-1 font-bold">当前选择: {getShelfNo()}</p>
              )}
              <button
                onClick={saveShelf}
                disabled={shelfSaving || !getShelfNo()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl border-[3px] border-gray-900 bg-[#FFC93C] text-gray-900 font-extrabold text-sm shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-3"
              >
                {shelfSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                保存货架号
              </button>
            </div>
          )}

          {/* 分类调整 */}
          {activeTab === "category" && (
            <div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="text-sm font-extrabold text-gray-900 mb-1 block">季节分类</label>
                  <select
                    value={season}
                    onChange={(e) => setSeason(e.target.value)}
                    className="w-full text-sm border-2 border-gray-300 rounded-lg px-2 py-2 focus:outline-none focus:border-gray-900 font-bold"
                  >
                    <option value="">请选择季节</option>
                    {SEASON_CATEGORIES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-extrabold text-gray-900 mb-1 block">款式分类</label>
                  <select
                    value={style}
                    onChange={(e) => setStyle(e.target.value)}
                    className="w-full text-sm border-2 border-gray-300 rounded-lg px-2 py-2 focus:outline-none focus:border-gray-900 font-bold"
                  >
                    <option value="">请选择款式</option>
                    <optgroup label="── 含尺码分类 ──">
                      {sizeStyles.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </optgroup>
                    <optgroup label="── 不含尺码分类 ──">
                      {noSizeStyles.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </optgroup>
                  </select>
                </div>
              </div>
              <button
                onClick={saveCategory}
                disabled={categorySaving || (!season && !style)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl border-[3px] border-gray-900 bg-[#4CD964] text-white font-extrabold text-sm shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {categorySaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                保存分类
              </button>
            </div>
          )}

          {/* 名称调整 */}
          {activeTab === "name" && (
            <div>
              <label className="text-sm font-extrabold text-gray-900 mb-2 block">商品名称</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="请输入商品名称..."
                className="w-full text-sm border-2 border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-gray-900 font-bold mb-3"
              />
              <button
                onClick={saveName}
                disabled={nameSaving || !newName.trim()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl border-[3px] border-gray-900 bg-[#FF6B7A] text-white font-extrabold text-sm shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {nameSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                保存名称
              </button>
            </div>
          )}
        </motion.div>
      )}

      {/* 保存提示 */}
      {saveMsg && (
        <div className={`p-3 rounded-xl border-2 font-bold text-sm ${saveMsg.includes("成功") ? "bg-green-50 border-green-500 text-green-700" : "bg-red-50 border-red-500 text-red-700"}`}>
          {saveMsg}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      )}
    </PageWrapper>
  );
}