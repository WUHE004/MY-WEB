"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Link2,
  Plus,
  Copy,
  ExternalLink,
  QrCode,
  Trash2,
  Edit3,
  Check,
  ShoppingBag,
  TrendingUp,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageWrapper } from "@/components/page-wrapper";

interface LinkItem {
  id: string;
  name: string;
  url: string;
  shortUrl: string;
  platform: string;
  clicks: number;
  conversions: number;
  status: "active" | "paused";
  createdAt: string;
}

export default function LinksPage() {
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<LinkItem>>({
    name: "",
    url: "",
    platform: "淘宝",
  });

  useEffect(() => {
    fetchLinks();
  }, []);

  const fetchLinks = async () => {
    try {
      const res = await fetch("/api/links");
      const data = await res.json();
      const mapped: LinkItem[] = Array.isArray(data) ? data.map((l: Record<string, unknown>) => ({
        id: (l.id as string) || "",
        name: (l.name as string) || "",
        url: (l.url as string) || "",
        shortUrl: (l.short_url as string) || (l.shortUrl as string) || "",
        platform: (l.platform as string) || "",
        clicks: Number(l.clicks) || 0,
        conversions: Number(l.conversions) || 0,
        status: (l.status as "active" | "paused") || "active",
        createdAt: (l.created_at as string) || "",
      })) : [];
      setLinks(mapped);
    } catch (err) {
      console.error("Fetch links error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (shortUrl: string, id: string) => {
    navigator.clipboard.writeText(shortUrl);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/links?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      setLinks(links.filter((l) => l.id !== id));
    } catch (err) {
      console.error("Delete error:", err);
    }
  };

  const handleCreate = async () => {
    const newLink = {
      id: Date.now().toString(),
      name: formData.name || "",
      url: formData.url || "",
      short_url: `https://kucun.gg/${Math.random().toString(36).substring(2, 8)}`,
      platform: formData.platform || "淘宝",
      clicks: 0,
      conversions: 0,
      status: "active",
      created_at: new Date().toISOString().split("T")[0],
    };
    try {
      await fetch("/api/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newLink),
      });
      setLinks([{
        ...newLink,
        shortUrl: newLink.short_url,
        createdAt: newLink.created_at,
      } as LinkItem, ...links]);
    } catch (err) {
      console.error("Create error:", err);
    }
    setDialogOpen(false);
    setFormData({ name: "", url: "", platform: "淘宝" });
  };

  const platformColors: Record<string, string> = {
    淘宝: "bg-[#FF6B7A]",
    京东: "bg-[#4A90E2]",
    拼多多: "bg-[#FFC93C]",
    抖音: "bg-[#171717]",
    小红书: "bg-[#FF6B7A]",
  };

  const totalClicks = links.reduce((sum, l) => sum + l.clicks, 0);
  const totalConversions = links.reduce((sum, l) => sum + l.conversions, 0);
  const conversionRate = totalClicks > 0 ? ((totalConversions / totalClicks) * 100).toFixed(2) : "0";

  return (
    <PageWrapper>
      {/* Header */}
      <div className="mb-6 lg:mb-8">
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-gray-900 mb-2">
          <span className="highlight-yellow">链接制作</span>
        </h1>
        <p className="text-sm lg:text-lg text-gray-600 font-medium">
          创建和管理推广链接，追踪点击和转化数据
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 lg:gap-6 mb-6 lg:mb-8">
        <Card>
          <CardContent className="p-3 lg:p-6 flex items-center justify-between">
            <div>
              <p className="text-[10px] lg:text-sm font-bold text-gray-500">总点击量</p>
              <p className="text-lg lg:text-3xl font-extrabold">{totalClicks.toLocaleString()}</p>
            </div>
            <div className="flex h-8 w-8 lg:h-12 lg:w-12 items-center justify-center rounded-lg lg:rounded-xl border-[3px] border-gray-900 bg-[#4A90E2]">
              <Link2 className="h-4 w-4 lg:h-6 lg:w-6 text-white" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 lg:p-6 flex items-center justify-between">
            <div>
              <p className="text-[10px] lg:text-sm font-bold text-gray-500">总转化</p>
              <p className="text-lg lg:text-3xl font-extrabold">{totalConversions.toLocaleString()}</p>
            </div>
            <div className="flex h-8 w-8 lg:h-12 lg:w-12 items-center justify-center rounded-lg lg:rounded-xl border-[3px] border-gray-900 bg-[#FFC93C]">
              <ShoppingBag className="h-4 w-4 lg:h-6 lg:w-6 text-gray-900" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 lg:p-6 flex items-center justify-between">
            <div>
              <p className="text-[10px] lg:text-sm font-bold text-gray-500">转化率</p>
              <p className="text-lg lg:text-3xl font-extrabold">{conversionRate}%</p>
            </div>
            <div className="flex h-8 w-8 lg:h-12 lg:w-12 items-center justify-center rounded-lg lg:rounded-xl border-[3px] border-gray-900 bg-[#4CD964]">
              <TrendingUp className="h-4 w-4 lg:h-6 lg:w-6 text-white" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4 lg:mb-6">
        <h2 className="text-base lg:text-xl font-extrabold">推广链接列表</h2>
        <Button
          variant="primary"
          onClick={() => setDialogOpen(true)}
          className="flex items-center gap-2 text-xs lg:text-sm px-3 lg:px-4 py-2"
        >
          <Plus className="h-3.5 w-3.5 lg:h-5 lg:w-5" />
          创建链接
        </Button>
      </div>

      {/* Links Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
        {links.map((link) => (
          <motion.div
            key={link.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Card className="h-full">
              <CardContent className="p-4 lg:p-6">
                <div className="flex items-start justify-between mb-3 lg:mb-4">
                  <div className="flex items-center gap-2 lg:gap-3">
                    <div
                      className={`flex h-8 w-8 lg:h-10 lg:w-10 items-center justify-center rounded-lg border-[3px] border-gray-900 ${
                        platformColors[link.platform] || "bg-gray-200"
                      }`}
                    >
                      <Link2 className="h-4 w-4 lg:h-5 lg:w-5 text-white" />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 text-sm lg:text-base">{link.name}</h3>
                      <Badge
                        variant={link.status === "active" ? "green" : "yellow"}
                      >
                        {link.status === "active" ? "进行中" : "已暂停"}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleDelete(link.id)}
                      className="flex h-7 w-7 lg:h-9 lg:w-9 items-center justify-center rounded-lg border-[3px] border-gray-900 bg-[#FF6B7A] shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[2px] active:translate-y-[2px] transition-all"
                    >
                      <Trash2 className="h-3 w-3 lg:h-4 lg:w-4 text-white" />
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2 p-2.5 lg:p-3 rounded-lg lg:rounded-xl border-[3px] border-gray-200 bg-gray-50">
                    <Link2 className="h-3.5 w-3.5 lg:h-4 lg:w-4 text-gray-400 flex-shrink-0" />
                    <span className="text-xs lg:text-sm font-medium text-gray-600 truncate flex-1">
                      {link.shortUrl}
                    </span>
                    <button
                      onClick={() => handleCopy(link.shortUrl, link.id)}
                      className="flex items-center gap-1 px-2 lg:px-3 py-1 lg:py-1.5 rounded-lg border-[3px] border-gray-900 bg-white text-xs lg:text-sm font-bold shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[2px] active:translate-y-[2px] transition-all whitespace-nowrap"
                    >
                      {copiedId === link.id ? (
                        <>
                          <Check className="h-3 w-3 lg:h-3.5 lg:w-3.5" />
                          已复制
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3 lg:h-3.5 lg:w-3.5" />
                          复制
                        </>
                      )}
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-2 lg:gap-3">
                    <div className="text-center p-2 lg:p-3 rounded-lg lg:rounded-xl border-[3px] border-gray-200">
                      <p className="text-[10px] lg:text-xs font-bold text-gray-500 mb-0.5 lg:mb-1">点击</p>
                      <p className="text-sm lg:text-lg font-extrabold">{link.clicks}</p>
                    </div>
                    <div className="text-center p-2 lg:p-3 rounded-lg lg:rounded-xl border-[3px] border-gray-200">
                      <p className="text-[10px] lg:text-xs font-bold text-gray-500 mb-0.5 lg:mb-1">转化</p>
                      <p className="text-sm lg:text-lg font-extrabold">{link.conversions}</p>
                    </div>
                    <div className="text-center p-2 lg:p-3 rounded-lg lg:rounded-xl border-[3px] border-gray-200">
                      <p className="text-[10px] lg:text-xs font-bold text-gray-500 mb-0.5 lg:mb-1">平台</p>
                      <p className="text-sm lg:text-lg font-extrabold">{link.platform}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>创建推广链接</DialogTitle>
            <DialogDescription>
              输入商品链接信息，系统将自动生成短链接
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 lg:space-y-4 py-2 lg:py-4">
            <div>
              <label className="text-xs lg:text-sm font-bold text-gray-900 mb-1 block">
                链接名称
              </label>
              <Input
                value={formData.name || ""}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="例如：618大促推广"
                className="text-sm"
              />
            </div>
            <div>
              <label className="text-xs lg:text-sm font-bold text-gray-900 mb-1 block">
                目标URL
              </label>
              <Input
                value={formData.url || ""}
                onChange={(e) =>
                  setFormData({ ...formData, url: e.target.value })
                }
                placeholder="https://..."
                className="text-sm"
              />
            </div>
            <div>
              <label className="text-xs lg:text-sm font-bold text-gray-900 mb-1 block">
                所属平台
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
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button variant="primary" onClick={handleCreate}>
              创建链接
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  );
}
