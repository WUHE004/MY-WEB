"use client";

import { useState, useEffect } from "react";
import { ArrowLeft, Search, Package, Sparkles, UserRound, Loader2, Send } from "lucide-react";
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

export default function PhotoGenPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [models, setModels] = useState<Model[]>([]);

  // 模特选择弹窗
  const [showModelSelect, setShowModelSelect] = useState(false);
  const [showModelLibrary, setShowModelLibrary] = useState(false);
  const [activeProduct, setActiveProduct] = useState<Product | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<string>("");

  // 生成状态
  const [generating, setGenerating] = useState<string | null>(null); // sale_id
  const [generatedImages, setGeneratedImages] = useState<Record<string, string>>({});
  const [generatingError, setGeneratingError] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchProducts();
    fetchModels();
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

    try {
      const res = await fetch("/api/photo-gen/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sale_id: sid,
          product_photo_url: activeProduct.photo,
          model_id: selectedModelId,
        }),
      });
      const data = await res.json();
      if (data.error) {
        setGeneratingError((prev) => ({ ...prev, [sid]: data.error }));
      } else if (data.generated_url) {
        setGeneratedImages((prev) => ({ ...prev, [sid]: data.generated_url }));
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
      <div className="flex items-center gap-3 mb-4 lg:mb-6">
        <Link href="/links" className="flex items-center justify-center h-10 w-10 rounded-xl border-[3px] border-gray-900 hover:bg-gray-100 transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-gray-900">
            <span className="highlight-purple">AI 照片生成</span>
          </h1>
          <p className="text-xs lg:text-sm text-gray-500 font-medium">
            选择商品，让模特穿上你的衣服
          </p>
        </div>
      </div>

      {/* 搜索栏 */}
      <div className="mb-4 lg:mb-6 flex gap-3">
        <div className="flex-1 relative">
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

      {/* 模特选择弹窗 */}
      {showModelSelect && activeProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowModelSelect(false)}>
          <div className="bg-white rounded-2xl border-[3px] border-gray-900 p-6 w-full max-w-md max-h-[80vh] overflow-y-auto shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-extrabold mb-1">选择模特</h3>
            <p className="text-xs text-gray-500 mb-4">商品: {activeProduct.sale_id} - {activeProduct.name}</p>

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

      {/* 模特库管理弹窗 */}
      {showModelLibrary && (
        <ModelLibraryDialog
          models={models}
          onClose={() => setShowModelLibrary(false)}
          onRefresh={fetchModels}
        />
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
}: {
  product: Product;
  generating: boolean;
  generatedUrl?: string;
  error?: string;
  onGenerate: () => void;
}) {
  const [imgPreview, setImgPreview] = useState<string | null>(null);

  return (
    <div className="bg-white rounded-xl border-[3px] shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] p-2.5 border-gray-900">
      <div className="flex gap-2">
        {/* 图片区域 */}
        <div className="w-52 h-52 rounded-lg border-2 border-gray-200 overflow-hidden bg-gray-100 shrink-0">
          {product.photo ? (
            <img
              src={product.photo}
              alt=""
              className="w-full h-full object-cover cursor-pointer"
              onClick={() => setImgPreview(product.photo)}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Package className="h-20 w-20 text-gray-300" />
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
      <button
        onClick={onGenerate}
        disabled={generating}
        className={`w-full mt-2 py-1.5 rounded-lg border-[2px] border-gray-900 text-xs font-extrabold transition-all flex items-center justify-center gap-1 ${
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

      {/* 图片预览弹窗 */}
      {imgPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setImgPreview(null)}>
          <img src={imgPreview} alt="预览" className="max-w-full max-h-full rounded-xl" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}