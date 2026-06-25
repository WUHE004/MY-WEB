"use client";

import { useState, useEffect, useRef } from "react";
import { ArrowLeft, Search, Package, Sparkles, UserRound, Loader2, Send, Settings2, Plus, Trash2, X, Zap, Shirt, Camera, Video } from "lucide-react";
import Link from "next/link";
import { PageWrapper } from "@/components/page-wrapper";
import { ModelLibraryDialog } from "@/components/model-library-dialog";

interface Product {
  id: string;
  sale_id: string;
  name: string;
  photo: string;
  shelf_no: string;
  manufacturer: string;
  sell_price: number;
  cost_price: number;
  total_stock: number;
}

interface Model {
  id: string;
  name: string;
  photo_url: string;
}

interface CustomModel {
  id: string;
  name: string;
  apiEndpoint: string;
  apiKey: string;
  modelId: string;
  requestTemplate: string;
  responseImagePath: string;
  extraHeaders: string;
}

export default function PhotoGenPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [models, setModels] = useState<Model[]>([]);

  // Tab 切换: oneshot=一键生成(Agnes) | dressup=AI穿衣
  const [activeTab, setActiveTab] = useState<"oneshot" | "dressup">("oneshot");

  // 一键生成 (Agnes) 状态
  const [agnesUsage, setAgnesUsage] = useState(0);

  // 模特选择弹窗（AI穿衣 Tab）
  const [showModelSelect, setShowModelSelect] = useState(false);
  const [showModelLibrary, setShowModelLibrary] = useState(false);
  const [activeProduct, setActiveProduct] = useState<Product | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<string>("");

  // 模特选择弹窗（一键生成 Tab，独立状态）
  const [oneshotShowModelSelect, setOneshotShowModelSelect] = useState(false);
  const [oneshotActiveProduct, setOneshotActiveProduct] = useState<Product | null>(null);
  const [oneshotSelectedModelId, setOneshotSelectedModelId] = useState<string>("");

  // 图片预览（统一顶层状态，避免在 .map() 内使用 useState）
  const [imgPreview, setImgPreview] = useState<string | null>(null);

  // 换图生成：临时上传的图片URL（不存入数据库）
  const [tempPhotoUrl, setTempPhotoUrl] = useState<Record<string, string>>({});
  const [uploadingPhoto, setUploadingPhoto] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const pendingProductRef = useRef<string | null>(null);

  // 照片选择器弹窗（相机/图库）
  const [showPhotoPicker, setShowPhotoPicker] = useState(false);
  const [photoPickerProduct, setPhotoPickerProduct] = useState<Product | null>(null);

  // 生成状态
  const [generating, setGenerating] = useState<string | null>(null); // sale_id
  const [generatedImages, setGeneratedImages] = useState<Record<string, string>>({});
  const [generatedFlatImages, setGeneratedFlatImages] = useState<Record<string, string>>({}); // 一键生成的白底图
  const [generatingError, setGeneratingError] = useState<Record<string, string>>({});
  const [aiModel, setAiModel] = useState<"doubao" | "qwen" | "aitryon" | "agnes" | "custom">("agnes");

  // 模型使用量追踪（从服务端 Supabase 读取，跨设备同步）
  const FREE_QUOTA: Record<string, number> = {
    doubao: -1,     // 豆包无公开免费额度，仅计数
    qwen: 100,      // 通义万相约100张免费额度
    aitryon: 400,   // AI试衣 Plus 400张免费额度
  };
  const [modelUsage, setModelUsage] = useState<Record<string, number>>({});

  const fetchUsage = async () => {
    const mid = typeof window !== "undefined" ? (localStorage.getItem("member_id") || localStorage.getItem("member_phone") || localStorage.getItem("member_name")) : null;
    if (!mid) return;
    try {
      const res = await fetch(`/api/photo-gen/usage?member_id=${encodeURIComponent(mid)}`);
      const data = await res.json();
      if (!data.error) {
        setModelUsage(data);
        setAgnesUsage(data.agnes || 0);
      }
    } catch { /* 静默 */ }
  };

  const getUsage = (model: string) => modelUsage[model] || 0;
  const getQuotaRemaining = (model: string) => {
    const limit = FREE_QUOTA[model];
    if (limit === undefined || limit < 0) return null; // 无限制
    return Math.max(0, limit - getUsage(model));
  };

  // 自定义模型
  const [customModels, setCustomModels] = useState<CustomModel[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("custom_ai_models") || "[]");
    } catch { return []; }
  });
  const [selectedCustomModelId, setSelectedCustomModelId] = useState<string>("");
  const [showModelConfig, setShowModelConfig] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);

  // 编辑自定义模型
  const [editingModel, setEditingModel] = useState<CustomModel>(getDefaultModelConfig());

  function getDefaultModelConfig(): CustomModel {
    return {
      id: "",
      name: "",
      apiEndpoint: "",
      apiKey: "",
      modelId: "",
      requestTemplate: '{\n  "model": "{{MODEL_ID}}",\n  "input": {\n    "product_image": "{{PRODUCT_IMAGE}}",\n    "model_image": "{{MODEL_IMAGE}}",\n    "prompt": "让模特穿上这件衣服，保持衣服细节不变"\n  }\n}',
      responseImagePath: "output.0",
      extraHeaders: "",
    };
  }

  const saveCustomModels = (models: CustomModel[]) => {
    setCustomModels(models);
    localStorage.setItem("custom_ai_models", JSON.stringify(models));
  };

  const handleAddCustomModel = () => {
    setEditingModel(getDefaultModelConfig());
    setShowModelConfig(true);
  };

  const handleEditCustomModel = (model: CustomModel) => {
    setEditingModel({ ...model });
    setShowModelConfig(true);
  };

  const handleSaveModel = () => {
    if (!editingModel.name || !editingModel.apiEndpoint || !editingModel.modelId) {
      alert("请填写模型名称、API地址和模型ID");
      return;
    }
    let updated: CustomModel[];
    if (editingModel.id) {
      updated = customModels.map((m) => (m.id === editingModel.id ? editingModel : m));
    } else {
      const newModel = { ...editingModel, id: "custom_" + Date.now() };
      updated = [...customModels, newModel];
      setSelectedCustomModelId(newModel.id);
    }
    saveCustomModels(updated);
    setShowModelConfig(false);
  };

  const handleDeleteCustomModel = (id: string) => {
    const updated = customModels.filter((m) => m.id !== id);
    saveCustomModels(updated);
    if (selectedCustomModelId === id) setSelectedCustomModelId("");
  };

  useEffect(() => {
    fetchProducts();
    fetchModels();
    fetchUsage();
  }, []);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/products");
      const data = await res.json();
      setProducts(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Fetch products error:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchModels = async () => {
    try {
      const res = await fetch("/api/photo-gen/models");
      const data = await res.json();
      setModels(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Fetch models error:", err);
    }
  };

  const filteredProducts = search
    ? products.filter(
        (p) =>
          (p.name || "").toLowerCase().includes(search.toLowerCase()) ||
          (p.sale_id || "").toLowerCase().includes(search.toLowerCase())
      )
    : products;

  // ===== 换图生成：上传临时图片 =====
  const handleChangePhoto = (product: Product) => {
    setPhotoPickerProduct(product);
    setShowPhotoPicker(true);
  };

  // 从图库选择
  const handlePickGallery = () => {
    setShowPhotoPicker(false);
    if (photoPickerProduct) {
      pendingProductRef.current = photoPickerProduct.sale_id;
    }
    fileInputRef.current?.click();
  };

  // 拍照
  const handlePickCamera = () => {
    setShowPhotoPicker(false);
    if (photoPickerProduct) {
      pendingProductRef.current = photoPickerProduct.sale_id;
    }
    cameraInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !pendingProductRef.current) return;

    const sid = pendingProductRef.current;
    setUploadingPhoto(sid);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", "temp-photos");

      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setTempPhotoUrl((prev) => ({ ...prev, [sid]: data.url }));
    } catch (err) {
      alert("图片上传失败: " + (err instanceof Error ? err.message : "未知错误"));
    } finally {
      setUploadingPhoto(null);
      pendingProductRef.current = null;
      // 重置 input 以便可以重复选择同一文件
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // ===== 一键生成 Tab：打开模特选择弹窗 =====
  const handleOneshotOpenGen = (product: Product) => {
    if (models.length === 0) {
      alert("请先在模特库中添加模特");
      return;
    }
    setOneshotActiveProduct(product);
    setOneshotSelectedModelId(models[0]?.id || "");
    setOneshotShowModelSelect(true);
  };

  // ===== 一键生成 Tab：调用 API 生成白底图 =====
  const handleOneshotGenerate = async () => {
    if (!oneshotActiveProduct || !oneshotSelectedModelId) return;
    const sid = oneshotActiveProduct.sale_id;
    setGenerating(sid);
    setGeneratingError((prev) => {
      const next = { ...prev };
      delete next[sid];
      return next;
    });

    const mid = typeof window !== "undefined" ? (localStorage.getItem("member_id") || localStorage.getItem("member_phone") || "") : "";
    const photoUrl = tempPhotoUrl[sid] || oneshotActiveProduct.photo;

    try {
      const res = await fetch("/api/photo-gen/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sale_id: sid,
          product_photo_url: photoUrl,
          model_id: oneshotSelectedModelId,
          ai_model: "agnes",
          member_id: mid,
        }),
      });
      const data = await res.json();
      if (data.error) {
        setGeneratingError((prev) => ({ ...prev, [sid]: data.error }));
      } else {
        if (data.generated_url) {
          setGeneratedImages((prev) => ({ ...prev, [sid]: data.generated_url }));
        }
        if (data.flat_url) {
          setGeneratedFlatImages((prev) => ({ ...prev, [sid]: data.flat_url }));
        }
        fetchUsage();
      }
    } catch (err) {
      setGeneratingError((prev) => ({
        ...prev,
        [sid]: err instanceof Error ? err.message : "生成失败",
      }));
    } finally {
      setGenerating(null);
      setOneshotShowModelSelect(false);
    }
  };

  // ===== AI穿衣 原有逻辑 =====
  const handleOpenGen = (product: Product) => {
    if (models.length === 0) {
      alert("请先在模特库中添加模特");
      return;
    }
    setActiveProduct(product);
    setSelectedModelId(models[0]?.id || "");
    setShowModelSelect(true);
  };

  const handleGenerate = async () => {
    if (!activeProduct || !selectedModelId) return;
    const sid = activeProduct.sale_id;
    setGenerating(sid);
    setGeneratingError((prev) => {
      const next = { ...prev };
      delete next[sid];
      return next;
    });

    const selectedCustomModel = customModels.find((m) => m.id === selectedCustomModelId);
    const mid = typeof window !== "undefined" ? (localStorage.getItem("member_id") || localStorage.getItem("member_phone") || "") : "";
    const photoUrl = tempPhotoUrl[sid] || activeProduct.photo;

    try {
      const res = await fetch("/api/photo-gen/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sale_id: sid,
          product_photo_url: photoUrl,
          model_id: selectedModelId,
          ai_model: aiModel,
          custom_model: aiModel === "custom" ? selectedCustomModel : null,
          member_id: mid,
        }),
      });
      const data = await res.json();
      if (data.error) {
        setGeneratingError((prev) => ({ ...prev, [sid]: data.error }));
      } else if (data.generated_url) {
        setGeneratedImages((prev) => ({ ...prev, [sid]: data.generated_url }));
        fetchUsage();
      }
    } catch (err) {
      setGeneratingError((prev) => ({
        ...prev,
        [sid]: err instanceof Error ? err.message : "生成失败",
      }));
    } finally {
      setGenerating(null);
      setShowModelSelect(false);
    }
  };

  const getModelById = (id: string) => models.find((m) => m.id === id);

  return (
    <PageWrapper>
      {/* 顶部导航 */}
      <div className="flex items-center gap-2 mb-4 lg:mb-6">
        <Link href="/links" className="flex items-center justify-center h-8 w-8 rounded-xl border-[3px] border-gray-900 hover:bg-gray-100 transition-colors shrink-0">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg sm:text-xl lg:text-2xl font-extrabold text-gray-900 truncate">
            <span className="highlight-purple">照片生成</span>
          </h1>
        </div>
        {/* Tab 切换按钮 */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setActiveTab("oneshot")}
            className={`flex items-center gap-1 px-2 py-1.5 rounded-lg border-[3px] font-extrabold text-xs transition-all ${
              activeTab === "oneshot"
                ? "border-gray-900 bg-gray-900 text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                : "border-gray-300 bg-white text-gray-500 hover:border-gray-900 hover:text-gray-900"
            }`}
          >
            <Zap className="h-3 w-3" />
            <span className="hidden sm:inline">一键生成</span>
            <span className="sm:hidden">一键</span>
          </button>
          <button
            onClick={() => setActiveTab("dressup")}
            className={`flex items-center gap-1 px-2 py-1.5 rounded-lg border-[3px] font-extrabold text-xs transition-all ${
              activeTab === "dressup"
                ? "border-gray-900 bg-gray-900 text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                : "border-gray-300 bg-white text-gray-500 hover:border-gray-900 hover:text-gray-900"
            }`}
          >
            <Shirt className="h-3 w-3" />
            <span className="hidden sm:inline">AI穿衣</span>
            <span className="sm:hidden">穿衣</span>
          </button>
          <Link
            href="/operations/video-gen"
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg border-[3px] font-extrabold text-xs transition-all border-gray-300 bg-white text-gray-500 hover:border-[#FF6B7A] hover:text-[#FF6B7A]"
          >
            <Video className="h-3 w-3" />
            <span className="sm:hidden">视频</span>
            <span className="hidden sm:inline">视频生成</span>
          </Link>
        </div>
      </div>

      {/* ===== 一键生成 (Agnes) Tab ===== */}
      {activeTab === "oneshot" && (
        <>
          {/* 搜索栏 + 模特库按钮 */}
          <div className="mb-4 lg:mb-6 flex gap-3 flex-wrap">
            <div className="flex-1 relative min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索商品名称或编号..."
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border-[3px] border-gray-900 text-sm font-medium focus:outline-none"
              />
            </div>
            <button
              onClick={() => setShowModelLibrary(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border-[3px] border-gray-900 bg-[#9B59B6] text-white font-extrabold text-sm hover:bg-[#8B49A6] transition-all whitespace-nowrap"
            >
              <UserRound className="h-4 w-4" />
              模特库
            </button>
          </div>

          {/* 模型信息 */}
          <div className="mb-4 lg:mb-6 flex items-center gap-2 text-xs flex-wrap">
            <span className="text-gray-400 font-bold">调用模型:</span>
            <span className="px-2.5 py-1 rounded-full border-[2px] border-green-500 bg-green-100 text-green-700 font-extrabold">
              ✨ Agnes 图生图
            </span>
            <span className="text-gray-400 font-medium">已生成: {agnesUsage} 次</span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {filteredProducts.map((product) => {
                const isGen = generating === product.sale_id;
                const err = generatingError[product.sale_id];
                const generatedUrl = generatedImages[product.sale_id];
                const flatUrl = generatedFlatImages[product.sale_id];
                const tmpUrl = tempPhotoUrl[product.sale_id];
                const isUploading = uploadingPhoto === product.sale_id;
                const displayPhoto = tmpUrl || product.photo;

                return (
                  <div key={product.sale_id} className="bg-white rounded-xl border-[3px] shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] p-2.5 border-gray-900">
                    <div className="flex gap-2">
                      <div className="w-52 h-52 rounded-lg border-2 border-gray-200 overflow-hidden bg-gray-100 shrink-0 relative">
                        {displayPhoto ? (
                          <img
                            src={displayPhoto}
                            alt=""
                            className="w-full h-full object-cover cursor-pointer"
                            onClick={() => setImgPreview(displayPhoto)}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Package className="h-20 w-20 text-gray-300" />
                          </div>
                        )}
                        {tmpUrl && (
                          <div className="absolute top-1 left-1 bg-green-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                            已换图
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-extrabold text-gray-900 truncate">{product.sale_id}</div>
                        {product.name && <div className="text-xs text-gray-500 truncate">{product.name}</div>}
                        {product.shelf_no && <div className="text-[10px] text-gray-400 mt-0.5">货架: {product.shelf_no}</div>}
                        {product.manufacturer && <div className="text-[10px] text-gray-400">厂家: {product.manufacturer}</div>}

                        {(generatedUrl || flatUrl) && (
                          <div className="mt-2 flex gap-1">
                            {generatedUrl && (
                              <img
                                src={generatedUrl}
                                alt="试穿图"
                                className="w-1/2 max-h-20 object-cover rounded-lg border-2 border-[#9B59B6] cursor-pointer"
                                onClick={() => setImgPreview(generatedUrl)}
                              />
                            )}
                            {flatUrl && (
                              <img
                                src={flatUrl}
                                alt="白底图"
                                className="w-1/2 max-h-20 object-cover rounded-lg border-2 border-blue-500 cursor-pointer"
                                onClick={() => setImgPreview(flatUrl)}
                              />
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {err && (
                      <div className="mt-2 text-xs text-red-500 font-medium bg-red-50 rounded-lg px-2 py-1">{err}</div>
                    )}

                    <div className="flex gap-1.5 mt-2">
                      <button
                        onClick={() => handleOneshotOpenGen(product)}
                        disabled={isGen}
                        className={`flex-1 py-1.5 rounded-lg border-[2px] border-gray-900 text-xs font-extrabold transition-all flex items-center justify-center gap-1 ${
                          generatedUrl
                            ? "bg-green-500 text-white border-green-700"
                            : "bg-gray-900 text-white hover:bg-gray-800"
                        } disabled:opacity-70`}
                      >
                        {isGen ? (
                          <>
                            <Loader2 className="h-3 w-3 animate-spin" />生成中...
                          </>
                        ) : generatedUrl ? (
                          <>
                            <Sparkles className="h-3 w-3" />重新生成
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-3 w-3" />一键生成
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => handleChangePhoto(product)}
                        disabled={isGen || isUploading}
                        className="py-1.5 px-3 rounded-lg border-[2px] border-gray-900 text-xs font-extrabold transition-all flex items-center justify-center gap-1 bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-70"
                      >
                        {isUploading ? (
                          <>
                            <Loader2 className="h-3 w-3 animate-spin" />上传中
                          </>
                        ) : (
                          <>
                            <Camera className="h-3 w-3" />换图生成
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
              {filteredProducts.length === 0 && (
                <div className="col-span-full flex flex-col items-center justify-center py-16 gap-3">
                  <Package className="h-12 w-12 text-gray-300" />
                  <p className="font-bold text-gray-500 text-sm">暂无商品</p>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ===== AI穿衣 Tab ===== */}
      {activeTab === "dressup" && (
        <>
          {/* 搜索栏 + 模型选择 */}
          <div className="mb-4 lg:mb-6 flex gap-3 flex-wrap">
            <div className="flex-1 relative min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索商品名称或编号..."
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border-[3px] border-gray-900 text-sm font-medium focus:outline-none"
              />
            </div>
            <button
              onClick={() => setShowModelLibrary(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border-[3px] border-gray-900 bg-[#9B59B6] text-white font-extrabold text-sm hover:bg-[#8B49A6] transition-all whitespace-nowrap"
            >
              <UserRound className="h-4 w-4" />
              模特库
            </button>
            <button
              onClick={() => setShowModelPicker(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border-[3px] border-gray-900 bg-[#4A90E2] text-white font-extrabold text-sm hover:bg-[#3A80D2] transition-all whitespace-nowrap"
            >
              <Settings2 className="h-4 w-4" />
              模型库
            </button>
          </div>

          {/* 当前选中模型提示 */}
          <div className="mb-4 lg:mb-6 flex items-center gap-2 text-xs flex-wrap">
            <span className="text-gray-400 font-bold">当前模型:</span>
            <button
              onClick={() => setShowModelPicker(true)}
              className={`px-2.5 py-1 rounded-full border-[2px] font-extrabold transition-all ${
                aiModel === "doubao"
                  ? "border-blue-500 bg-blue-100 text-blue-700"
                  : aiModel === "qwen"
                  ? "border-purple-500 bg-purple-100 text-purple-700"
                  : aiModel === "aitryon"
                  ? "border-orange-500 bg-orange-100 text-orange-700"
                  : aiModel === "agnes"
                  ? "border-pink-500 bg-pink-100 text-pink-700"
                  : "border-green-500 bg-green-100 text-green-700"
              }`}
            >
              {aiModel === "doubao" ? "🫘 豆包 Seedream" : aiModel === "qwen" ? "⚡ Qwen-Image-Edit" : aiModel === "aitryon" ? "👗 AI试衣 Plus" : aiModel === "agnes" ? "✨ Agnes 图生图" : `⚙️ ${customModels.find((m) => m.id === selectedCustomModelId)?.name || "自定义"}`}
            </button>
            {aiModel === "doubao" && (
              <span className="text-gray-400 font-medium">已用 {getUsage("doubao")} 次</span>
            )}
            {aiModel === "qwen" && (
              <span className={`font-extrabold ${(getQuotaRemaining("qwen") ?? 0) > 10 ? "text-gray-500" : "text-red-500"}`}>
                免费剩余 {getQuotaRemaining("qwen")} 张
              </span>
            )}
            {aiModel === "aitryon" && (
              <span className={`font-extrabold ${(getQuotaRemaining("aitryon") ?? 0) > 50 ? "text-gray-500" : "text-red-500"}`}>
                免费剩余 {getQuotaRemaining("aitryon")} 张
              </span>
            )}
            {aiModel === "agnes" && (
              <span className="text-gray-400 font-medium">已用 {getUsage("agnes")} 次</span>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {filteredProducts.map((product) => (
                <ProductCard
                  key={product.sale_id}
                  product={product}
                  generating={generating === product.sale_id}
                  generatedUrl={generatedImages[product.sale_id]}
                  error={generatingError[product.sale_id]}
                  onGenerate={() => handleOpenGen(product)}
                  tempPhotoUrl={tempPhotoUrl[product.sale_id]}
                  isUploading={uploadingPhoto === product.sale_id}
                  onChangePhoto={() => handleChangePhoto(product)}
                />
              ))}
              {filteredProducts.length === 0 && (
                <div className="col-span-full flex flex-col items-center justify-center py-16 gap-3">
                  <Package className="h-12 w-12 text-gray-300" />
                  <p className="font-bold text-gray-500 text-sm">暂无商品</p>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* 模特选择弹窗（AI穿衣 Tab） */}
      {showModelSelect && activeProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowModelSelect(false)}>
          <div className="bg-white rounded-2xl border-[3px] border-gray-900 p-6 w-full max-w-md max-h-[80vh] overflow-y-auto shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-extrabold mb-1">选择模特</h3>
            <p className="text-xs text-gray-500 mb-3">商品: {activeProduct.sale_id} - {activeProduct.name}</p>

            <div className="grid grid-cols-3 gap-3 mb-4">
              {models.map((model) => (
                <button
                  key={model.id}
                  onClick={() => setSelectedModelId(model.id)}
                  className={`relative rounded-xl border-[3px] overflow-hidden transition-all ${
                    selectedModelId === model.id
                      ? "border-[#9B59B6] ring-2 ring-[#9B59B6]"
                      : "border-gray-200 hover:border-gray-400"
                  }`}
                >
                  <img src={model.photo_url} alt={model.name} className="w-full aspect-square object-cover" />
                  <div className={`text-center py-1 text-xs font-extrabold ${
                    selectedModelId === model.id ? "bg-[#9B59B6] text-white" : "bg-gray-100 text-gray-700"
                  }`}>
                    {model.name}
                  </div>
                </button>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowModelSelect(false)}
                className="flex-1 py-2.5 rounded-xl border-[3px] border-gray-300 text-sm font-extrabold text-gray-600 hover:bg-gray-50 transition-all"
              >
                取消
              </button>
              <button
                onClick={handleGenerate}
                disabled={!selectedModelId}
                className="flex-1 py-2.5 rounded-xl border-[3px] border-gray-900 bg-[#9B59B6] text-white text-sm font-extrabold hover:bg-[#8B49A6] transition-all disabled:opacity-50"
              >
                <span className="flex items-center justify-center gap-1">
                  <Sparkles className="h-4 w-4" />一键生成
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 模特选择弹窗（一键生成 Tab，独立状态） */}
      {oneshotShowModelSelect && oneshotActiveProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setOneshotShowModelSelect(false)}>
          <div className="bg-white rounded-2xl border-[3px] border-gray-900 p-6 w-full max-w-md max-h-[80vh] overflow-y-auto shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-extrabold mb-1">选择模特 - 白底图生成</h3>
            <p className="text-xs text-gray-500 mb-3">商品: {oneshotActiveProduct.sale_id} - {oneshotActiveProduct.name}</p>

            <div className="grid grid-cols-3 gap-3 mb-4">
              {models.map((model) => (
                <button
                  key={model.id}
                  onClick={() => setOneshotSelectedModelId(model.id)}
                  className={`relative rounded-xl border-[3px] overflow-hidden transition-all ${
                    oneshotSelectedModelId === model.id
                      ? "border-[#9B59B6] ring-2 ring-[#9B59B6]"
                      : "border-gray-200 hover:border-gray-400"
                  }`}
                >
                  <img src={model.photo_url} alt={model.name} className="w-full aspect-square object-cover" />
                  <div className={`text-center py-1 text-xs font-extrabold ${
                    oneshotSelectedModelId === model.id ? "bg-[#9B59B6] text-white" : "bg-gray-100 text-gray-700"
                  }`}>
                    {model.name}
                  </div>
                </button>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setOneshotShowModelSelect(false)}
                className="flex-1 py-2.5 rounded-xl border-[3px] border-gray-300 text-sm font-extrabold text-gray-600 hover:bg-gray-50 transition-all"
              >
                取消
              </button>
              <button
                onClick={handleOneshotGenerate}
                disabled={!oneshotSelectedModelId}
                className="flex-1 py-2.5 rounded-xl border-[3px] border-gray-900 bg-gray-900 text-white text-sm font-extrabold hover:bg-gray-800 transition-all disabled:opacity-50"
              >
                <span className="flex items-center justify-center gap-1">
                  <Sparkles className="h-4 w-4" />生成白底图
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 模型库弹窗 */}
      {showModelPicker && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/50 p-4 pt-12 overflow-y-auto" onClick={() => setShowModelPicker(false)}>
          <div className="bg-white rounded-2xl border-[3px] border-gray-900 p-6 w-full max-w-lg shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-extrabold">AI 模型库</h3>
              <button onClick={() => setShowModelPicker(false)} className="p-1 rounded-lg hover:bg-gray-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* 内置模型 */}
            <p className="text-xs font-bold text-gray-400 mb-2">内置模型</p>
            <div className="flex gap-2 mb-4 flex-wrap">
              <button
                type="button"
                onClick={() => { setAiModel("agnes"); setShowModelPicker(false); }}
                className={`flex-1 min-w-[120px] px-3 py-2.5 rounded-xl border-[2px] text-xs font-extrabold transition-all ${
                  aiModel === "agnes"
                    ? "border-pink-500 bg-pink-500 text-white"
                    : "border-gray-300 bg-white text-gray-600 hover:border-pink-400"
                }`}
              >
                ✨ Agnes 图生图
              </button>
              <button
                type="button"
                onClick={() => { setAiModel("doubao"); setShowModelPicker(false); }}
                className={`flex-1 min-w-[120px] px-3 py-2.5 rounded-xl border-[2px] text-xs font-extrabold transition-all ${
                  aiModel === "doubao"
                    ? "border-blue-500 bg-blue-500 text-white"
                    : "border-gray-300 bg-white text-gray-600 hover:border-blue-400"
                }`}
              >
                🫘 豆包 Seedream
              </button>
              <button
                type="button"
                onClick={() => { setAiModel("qwen"); setShowModelPicker(false); }}
                className={`flex-1 min-w-[120px] px-3 py-2.5 rounded-xl border-[2px] text-xs font-extrabold transition-all ${
                  aiModel === "qwen"
                    ? "border-purple-500 bg-purple-500 text-white"
                    : "border-gray-300 bg-white text-gray-600 hover:border-purple-400"
                }`}
              >
                ⚡ Qwen-Image-Edit
              </button>
              <button
                type="button"
                onClick={() => { setAiModel("aitryon"); setShowModelPicker(false); }}
                className={`flex-1 min-w-[120px] px-3 py-2.5 rounded-xl border-[2px] text-xs font-extrabold transition-all ${
                  aiModel === "aitryon"
                    ? "border-orange-500 bg-orange-500 text-white"
                    : "border-gray-300 bg-white text-gray-600 hover:border-orange-400"
                }`}
              >
                👗 AI试衣 Plus
              </button>
            </div>

            {/* 自定义模型 */}
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-gray-400">自定义模型</p>
              <button onClick={handleAddCustomModel} className="text-xs text-blue-500 font-bold hover:underline flex items-center gap-1">
                <Plus className="h-3 w-3" />添加
              </button>
            </div>
            {customModels.length === 0 && (
              <p className="text-xs text-gray-400 py-2">尚未添加自定义模型</p>
            )}
            {customModels.map((cm) => (
              <div key={cm.id} className={`flex items-center gap-2 mb-1.5 p-2.5 rounded-xl border-[2px] transition-all ${
                aiModel === "custom" && selectedCustomModelId === cm.id
                  ? "border-green-500 bg-green-50"
                  : "border-gray-200 bg-gray-50 hover:border-gray-400"
              }`}>
                <button
                  onClick={() => { setAiModel("custom"); setSelectedCustomModelId(cm.id); setShowModelPicker(false); }}
                  className="flex-1 text-left"
                >
                  <div className="text-xs font-extrabold">⚙️ {cm.name}</div>
                  <div className="text-[10px] text-gray-400 truncate">{cm.modelId}</div>
                </button>
                <button onClick={() => handleEditCustomModel(cm)} className="p-1 text-gray-400 hover:text-blue-500" title="编辑">
                  <Settings2 className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => handleDeleteCustomModel(cm.id)} className="p-1 text-gray-400 hover:text-red-500" title="删除">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 模型配置弹窗（编辑/添加） */}
      {showModelConfig && (
        <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/50 p-4 pt-12 overflow-y-auto" onClick={() => setShowModelConfig(false)}>
          <div className="bg-white rounded-2xl border-[3px] border-gray-900 p-6 w-full max-w-lg shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-extrabold">{editingModel.id ? "编辑模型" : "添加自定义模型"}</h3>
              <button onClick={() => setShowModelConfig(false)} className="p-1 rounded-lg hover:bg-gray-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-extrabold text-gray-700 block mb-1">模型名称 *</label>
                <input
                  type="text"
                  value={editingModel.name}
                  onChange={(e) => setEditingModel({ ...editingModel, name: e.target.value })}
                  placeholder="例如: Replicate-OOTDiffusion"
                  className="w-full px-3 py-2 rounded-lg border-2 border-gray-300 text-xs font-medium focus:border-gray-900 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-extrabold text-gray-700 block mb-1">API 地址 *</label>
                <input
                  type="text"
                  value={editingModel.apiEndpoint}
                  onChange={(e) => setEditingModel({ ...editingModel, apiEndpoint: e.target.value })}
                  placeholder="例如: https://api.replicate.com/v1/predictions"
                  className="w-full px-3 py-2 rounded-lg border-2 border-gray-300 text-xs font-medium focus:border-gray-900 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-extrabold text-gray-700 block mb-1">API Key *</label>
                <input
                  type="password"
                  value={editingModel.apiKey}
                  onChange={(e) => setEditingModel({ ...editingModel, apiKey: e.target.value })}
                  placeholder="例如: r8_xxxxxxxxxxxxx"
                  className="w-full px-3 py-2 rounded-lg border-2 border-gray-300 text-xs font-medium focus:border-gray-900 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-extrabold text-gray-700 block mb-1">模型 ID *</label>
                <input
                  type="text"
                  value={editingModel.modelId}
                  onChange={(e) => setEditingModel({ ...editingModel, modelId: e.target.value })}
                  placeholder="例如: owner/model:version"
                  className="w-full px-3 py-2 rounded-lg border-2 border-gray-300 text-xs font-medium focus:border-gray-900 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-extrabold text-gray-700 block mb-1">
                  请求体模板 (JSON)
                  <span className="text-gray-400 font-normal ml-1">
                    — 占位符: {"{{MODEL_ID}}"}{" / {{PRODUCT_IMAGE}} / {{MODEL_IMAGE}}"}
                  </span>
                </label>
                <textarea
                  rows={6}
                  value={editingModel.requestTemplate}
                  onChange={(e) => setEditingModel({ ...editingModel, requestTemplate: e.target.value })}
                  placeholder='{"model": "{{MODEL_ID}}", "input": {"product": "{{PRODUCT_IMAGE}}", "model": "{{MODEL_IMAGE}}"}}'
                  className="w-full px-3 py-2 rounded-lg border-2 border-gray-300 text-xs font-mono focus:border-gray-900 focus:outline-none resize-y"
                />
              </div>
              <div>
                <label className="text-xs font-extrabold text-gray-700 block mb-1">
                  响应中图片的 JSON 路径
                  <span className="text-gray-400 font-normal ml-1">— 例如: output.0 或 data.url</span>
                </label>
                <input
                  type="text"
                  value={editingModel.responseImagePath}
                  onChange={(e) => setEditingModel({ ...editingModel, responseImagePath: e.target.value })}
                  placeholder="例如: output.0"
                  className="w-full px-3 py-2 rounded-lg border-2 border-gray-300 text-xs font-medium focus:border-gray-900 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-extrabold text-gray-700 block mb-1">
                  额外请求头 (JSON, 可选)
                  <span className="text-gray-400 font-normal ml-1">— 例如: {"{\"X-Custom\": \"value\"}"}</span>
                </label>
                <input
                  type="text"
                  value={editingModel.extraHeaders}
                  onChange={(e) => setEditingModel({ ...editingModel, extraHeaders: e.target.value })}
                  placeholder='{"X-Custom-Header": "value"}'
                  className="w-full px-3 py-2 rounded-lg border-2 border-gray-300 text-xs font-medium focus:border-gray-900 focus:outline-none"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowModelConfig(false)}
                  className="flex-1 py-2 rounded-xl border-[3px] border-gray-300 text-sm font-extrabold text-gray-600 hover:bg-gray-50"
                >
                  取消
                </button>
                <button
                  onClick={handleSaveModel}
                  className="flex-1 py-2 rounded-xl border-[3px] border-gray-900 bg-green-500 text-white text-sm font-extrabold hover:bg-green-600"
                >
                  保存模型
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 模特库管理弹窗 */}
      {showModelLibrary && (
        <ModelLibraryDialog
          models={models}
          onClose={() => setShowModelLibrary(false)}
          onRefresh={fetchModels}
        />
      )}

      {/* 统一图片预览弹窗 */}
      {imgPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setImgPreview(null)}>
          <img src={imgPreview} alt="预览" className="max-w-full max-h-full rounded-xl" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      {/* 隐藏文件选择器（换图生成用） */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* 照片选择器弹窗（相机/图库） */}
      {showPhotoPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowPhotoPicker(false)}>
          <div className="bg-white rounded-2xl border-[3px] border-gray-900 p-6 w-full max-w-xs shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-extrabold mb-4 text-center">选择图片来源</h3>
            <div className="flex gap-3">
              <button
                onClick={handlePickCamera}
                className="flex-1 py-3 rounded-xl border-[3px] border-gray-900 bg-gray-900 text-white font-extrabold text-sm hover:bg-gray-800 transition-all flex flex-col items-center gap-1"
              >
                <Camera className="h-6 w-6" />
                拍照
              </button>
              <button
                onClick={handlePickGallery}
                className="flex-1 py-3 rounded-xl border-[3px] border-gray-900 bg-white text-gray-700 font-extrabold text-sm hover:bg-gray-100 transition-all flex flex-col items-center gap-1"
              >
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
                从图库选择
              </button>
            </div>
            <button
              onClick={() => setShowPhotoPicker(false)}
              className="mt-3 w-full py-2 rounded-xl text-sm font-medium text-gray-400 hover:text-gray-600 transition-all"
            >
              取消
            </button>
          </div>
        </div>
      )}
    </PageWrapper>
  );
}

// 商品卡片组件
function ProductCard({
  product,
  generating,
  generatedUrl,
  error,
  onGenerate,
  tempPhotoUrl,
  isUploading,
  onChangePhoto,
}: {
  product: Product;
  generating: boolean;
  generatedUrl?: string;
  error?: string;
  onGenerate: () => void;
  tempPhotoUrl?: string;
  isUploading?: boolean;
  onChangePhoto?: () => void;
}) {
  const [imgPreview, setImgPreview] = useState<string | null>(null);
  const displayPhoto = tempPhotoUrl || product.photo;

  return (
    <div className="bg-white rounded-xl border-[3px] shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] p-2.5 border-gray-900">
      <div className="flex gap-2">
        {/* 图片区域 */}
        <div className="w-52 h-52 rounded-lg border-2 border-gray-200 overflow-hidden bg-gray-100 shrink-0 relative">
          {displayPhoto ? (
            <img
              src={displayPhoto}
              alt=""
              className="w-full h-full object-cover cursor-pointer"
              onClick={() => setImgPreview(displayPhoto)}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Package className="h-20 w-20 text-gray-300" />
            </div>
          )}
          {tempPhotoUrl && (
            <div className="absolute top-1 left-1 bg-green-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
              已换图
            </div>
          )}
        </div>
        {/* 右侧内容区 */}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-extrabold text-gray-900 truncate">{product.sale_id}</div>
          {product.name && <div className="text-xs text-gray-500 truncate">{product.name}</div>}
          {product.shelf_no && (
            <div className="text-[10px] text-gray-400 mt-0.5">货架: {product.shelf_no}</div>
          )}
          {product.manufacturer && (
            <div className="text-[10px] text-gray-400">厂家: {product.manufacturer}</div>
          )}

          {/* 生成结果展示 */}
          {generatedUrl && (
            <div className="mt-2">
              <img
                src={generatedUrl}
                alt="生成结果"
                className="w-full max-h-24 object-cover rounded-lg border-2 border-[#9B59B6] cursor-pointer"
                onClick={() => setImgPreview(generatedUrl)}
              />
            </div>
          )}
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="mt-2 text-xs text-red-500 font-medium bg-red-50 rounded-lg px-2 py-1">{error}</div>
      )}

      {/* 按钮 */}
      <div className="flex gap-1.5 mt-2">
        <button
          onClick={onGenerate}
          disabled={generating}
          className={`flex-1 py-1.5 rounded-lg border-[2px] border-gray-900 text-xs font-extrabold transition-all flex items-center justify-center gap-1 ${
            generatedUrl
              ? "bg-green-500 text-white border-green-700"
              : "bg-[#9B59B6] text-white hover:bg-[#8B49A6]"
          } disabled:opacity-70`}
        >
          {generating ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />生成中...
            </>
          ) : generatedUrl ? (
            <>
              <Sparkles className="h-3 w-3" />重新生成
            </>
          ) : (
            <>
              <Sparkles className="h-3 w-3" />一键生成图片
            </>
          )}
        </button>
        {onChangePhoto && (
          <button
            onClick={onChangePhoto}
            disabled={generating || isUploading}
            className="py-1.5 px-3 rounded-lg border-[2px] border-gray-900 text-xs font-extrabold transition-all flex items-center justify-center gap-1 bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-70"
          >
            {isUploading ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />上传中
              </>
            ) : (
              <>
                <Camera className="h-3 w-3" />换图生成
              </>
            )}
          </button>
        )}
      </div>

      {/* 图片预览弹窗 */}
      {imgPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setImgPreview(null)}>
          <img src={imgPreview} alt="预览" className="max-w-full max-h-full rounded-xl" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}