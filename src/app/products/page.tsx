"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Package,
  Plus,
  Search,
  Filter,
  Edit3,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageWrapper } from "@/components/page-wrapper";

interface Product {
  id: string;
  name: string;
  sku: string;
  category: string;
  price: number;
  stock: number;
  status: "active" | "low" | "out";
  platform: string;
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState<Partial<Product>>({});

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
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

  const filtered = products.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase())
  );

  const handleAdd = () => {
    setEditingProduct(null);
    setFormData({
      name: "",
      sku: "",
      category: "",
      price: 0,
      stock: 0,
      status: "active",
      platform: "淘宝",
    });
    setDialogOpen(true);
  };

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setFormData({ ...product });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/products?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      setProducts(products.filter((p) => p.id !== id));
    } catch (err) {
      console.error("Delete error:", err);
    }
  };

  const handleSave = async () => {
    const productData = {
      name: formData.name || "",
      sku: formData.sku || "",
      category: formData.category || "",
      price: Number(formData.price) || 0,
      stock: Number(formData.stock) || 0,
      status: formData.status || "active",
      platform: formData.platform || "淘宝",
    };

    try {
      if (editingProduct) {
        const res = await fetch("/api/products", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editingProduct.id, ...productData }),
        });
        const updated = await res.json();
        setProducts(products.map((p) => (p.id === editingProduct.id ? { ...p, ...updated } : p)));
      } else {
        const res = await fetch("/api/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(productData),
        });
        const created = await res.json();
        setProducts([created, ...products]);
      }
    } catch (err) {
      console.error("Save error:", err);
    }
    setDialogOpen(false);
  };

  const statusConfig = {
    active: { label: "正常", variant: "green" as const, icon: CheckCircle2 },
    low: { label: "库存不足", variant: "yellow" as const, icon: AlertTriangle },
    out: { label: "缺货", variant: "pink" as const, icon: AlertTriangle },
  };

  return (
    <PageWrapper>
      {/* Header */}
      <div className="mb-6 lg:mb-8">
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-gray-900 mb-2">
          <span className="highlight-blue">商品管理</span>
        </h1>
        <p className="text-sm lg:text-lg text-gray-600 font-medium">
          管理您的所有商品库存，实时监控库存状态
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-3 lg:gap-6 mb-6 lg:mb-8">
        <Card>
          <CardContent className="p-3 lg:p-6 flex items-center justify-between">
            <div>
              <p className="text-[10px] lg:text-sm font-bold text-gray-500">总商品数</p>
              <p className="text-xl lg:text-3xl font-extrabold">{products.length}</p>
            </div>
            <div className="flex h-8 w-8 lg:h-12 lg:w-12 items-center justify-center rounded-lg lg:rounded-xl border-[3px] border-gray-900 bg-[#4A90E2]">
              <Package className="h-4 w-4 lg:h-6 lg:w-6 text-white" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 lg:p-6 flex items-center justify-between">
            <div>
              <p className="text-[10px] lg:text-sm font-bold text-gray-500">库存预警</p>
              <p className="text-xl lg:text-3xl font-extrabold">
                {products.filter((p) => p.status === "low").length}
              </p>
            </div>
            <div className="flex h-8 w-8 lg:h-12 lg:w-12 items-center justify-center rounded-lg lg:rounded-xl border-[3px] border-gray-900 bg-[#FFC93C]">
              <AlertTriangle className="h-4 w-4 lg:h-6 lg:w-6 text-gray-900" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 lg:p-6 flex items-center justify-between">
            <div>
              <p className="text-[10px] lg:text-sm font-bold text-gray-500">缺货商品</p>
              <p className="text-xl lg:text-3xl font-extrabold">
                {products.filter((p) => p.status === "out").length}
              </p>
            </div>
            <div className="flex h-8 w-8 lg:h-12 lg:w-12 items-center justify-center rounded-lg lg:rounded-xl border-[3px] border-gray-900 bg-[#FF6B7A]">
              <Package className="h-4 w-4 lg:h-6 lg:w-6 text-white" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 lg:gap-4 mb-4 lg:mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 lg:left-4 top-1/2 -translate-y-1/2 h-4 w-4 lg:h-5 lg:w-5 text-gray-400" />
          <Input
            placeholder="搜索商品名称或SKU..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 lg:pl-12 text-sm"
          />
        </div>
        <Button variant="primary" onClick={handleAdd} className="flex items-center gap-2 text-sm">
          <Plus className="h-4 w-4 lg:h-5 lg:w-5" />
          新增商品
        </Button>
      </div>

      {/* Products Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base lg:text-xl">商品列表</CardTitle>
        </CardHeader>
        <CardContent className="p-0 lg:p-6">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs lg:text-sm whitespace-nowrap">商品信息</TableHead>
                  <TableHead className="text-xs lg:text-sm hidden sm:table-cell">SKU</TableHead>
                  <TableHead className="text-xs lg:text-sm hidden md:table-cell">分类</TableHead>
                  <TableHead className="text-xs lg:text-sm whitespace-nowrap">价格</TableHead>
                  <TableHead className="text-xs lg:text-sm whitespace-nowrap">库存</TableHead>
                  <TableHead className="text-xs lg:text-sm whitespace-nowrap">状态</TableHead>
                  <TableHead className="text-xs lg:text-sm hidden sm:table-cell">平台</TableHead>
                  <TableHead className="text-xs lg:text-sm text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((product) => {
                  const status = statusConfig[product.status];
                  return (
                    <TableRow key={product.id}>
                      <TableCell>
                        <div className="flex items-center gap-2 lg:gap-3">
                          <div className="h-8 w-8 lg:h-10 lg:w-10 rounded-lg border-[3px] border-gray-900 bg-gray-100 flex items-center justify-center shrink-0">
                            <Package className="h-4 w-4 lg:h-5 lg:w-5 text-gray-600" />
                          </div>
                          <span className="font-bold text-gray-900 text-xs lg:text-sm truncate max-w-[100px] sm:max-w-[200px]">
                            {product.name}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono font-bold text-xs lg:text-sm hidden sm:table-cell whitespace-nowrap">
                        {product.sku}
                      </TableCell>
                      <TableCell className="text-xs lg:text-sm hidden md:table-cell">{product.category}</TableCell>
                      <TableCell className="font-bold text-xs lg:text-sm whitespace-nowrap">
                        ¥{product.price}
                      </TableCell>
                      <TableCell className="font-bold text-xs lg:text-sm whitespace-nowrap">{product.stock}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell whitespace-nowrap">
                        <span className="text-xs lg:text-sm font-bold">{product.platform}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1 lg:gap-2">
                          <button
                            onClick={() => handleEdit(product)}
                            className="flex h-8 w-8 lg:h-9 lg:w-9 items-center justify-center rounded-lg border-[3px] border-gray-900 bg-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[2px] active:translate-y-[2px] transition-all"
                          >
                            <Edit3 className="h-3.5 w-3.5 lg:h-4 lg:w-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(product.id)}
                            className="flex h-8 w-8 lg:h-9 lg:w-9 items-center justify-center rounded-lg border-[3px] border-gray-900 bg-[#FF6B7A] shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[2px] active:translate-y-[2px] transition-all"
                          >
                            <Trash2 className="h-3.5 w-3.5 lg:h-4 lg:w-4 text-white" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingProduct ? "编辑商品" : "新增商品"}
            </DialogTitle>
            <DialogDescription>
              填写商品信息，所有字段均为必填
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 lg:space-y-4 py-2 lg:py-4">
            <div>
              <label className="text-xs lg:text-sm font-bold text-gray-900 mb-1 block">
                商品名称
              </label>
              <Input
                value={formData.name || ""}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="输入商品名称"
                className="text-sm"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:gap-4">
              <div>
                <label className="text-xs lg:text-sm font-bold text-gray-900 mb-1 block">
                  SKU
                </label>
                <Input
                  value={formData.sku || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, sku: e.target.value })
                  }
                  placeholder="SKU-XXX"
                  className="text-sm"
                />
              </div>
              <div>
                <label className="text-xs lg:text-sm font-bold text-gray-900 mb-1 block">
                  分类
                </label>
                <Input
                  value={formData.category || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, category: e.target.value })
                  }
                  placeholder="商品分类"
                  className="text-sm"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:gap-4">
              <div>
                <label className="text-xs lg:text-sm font-bold text-gray-900 mb-1 block">
                  价格
                </label>
                <Input
                  type="number"
                  value={formData.price || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, price: Number(e.target.value) })
                  }
                  placeholder="0"
                  className="text-sm"
                />
              </div>
              <div>
                <label className="text-xs lg:text-sm font-bold text-gray-900 mb-1 block">
                  库存
                </label>
                <Input
                  type="number"
                  value={formData.stock || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, stock: Number(e.target.value) })
                  }
                  placeholder="0"
                  className="text-sm"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:gap-4">
              <div>
                <label className="text-xs lg:text-sm font-bold text-gray-900 mb-1 block">
                  平台
                </label>
                <select
                  value={formData.platform || "淘宝"}
                  onChange={(e) =>
                    setFormData({ ...formData, platform: e.target.value })
                  }
                  className="neo-input w-full text-sm"
                >
                  <option>淘宝</option>
                  <option>京东</option>
                  <option>拼多多</option>
                  <option>抖音</option>
                  <option>小红书</option>
                </select>
              </div>
              <div>
                <label className="text-xs lg:text-sm font-bold text-gray-900 mb-1 block">
                  状态
                </label>
                <select
                  value={formData.status || "active"}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      status: e.target.value as any,
                    })
                  }
                  className="neo-input w-full text-sm"
                >
                  <option value="active">正常</option>
                  <option value="low">库存不足</option>
                  <option value="out">缺货</option>
                </select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button variant="primary" onClick={handleSave}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  );
}
