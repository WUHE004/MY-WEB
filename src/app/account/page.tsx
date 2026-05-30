"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Users,
  Plus,
  TrendingUp,
  TrendingDown,
  Heart,
  MessageCircle,
  Share2,
  Eye,
  Video,
  ShoppingBag,
  Edit3,
  Trash2,
  CheckCircle2,
  AlertCircle,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageWrapper } from "@/components/page-wrapper";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
} from "recharts";

interface Account {
  id: string;
  name: string;
  platform: string;
  handle: string;
  followers: number;
  posts: number;
  engagement: number;
  status: "active" | "warning" | "suspended";
  avatar: string;
  growth: number;
}

const platformIcons: Record<string, React.ReactNode> = {
  小红书: <ShoppingBag className="h-5 w-5" />,
  抖音: <Video className="h-5 w-5" />,
  淘宝直播: <ShoppingBag className="h-5 w-5" />,
  B站: <Video className="h-5 w-5" />,
  微博: <Share2 className="h-5 w-5" />,
};

const weeklyData = [
  { day: "周一", followers: 120, engagement: 8.2 },
  { day: "周二", followers: 180, engagement: 7.5 },
  { day: "周三", followers: 250, engagement: 9.1 },
  { day: "周四", followers: 200, engagement: 8.8 },
  { day: "周五", followers: 320, engagement: 10.2 },
  { day: "周六", followers: 450, engagement: 12.5 },
  { day: "周日", followers: 380, engagement: 11.8 },
];

const contentPerformance = [
  { name: "新品开箱", views: 12500, likes: 890, comments: 234 },
  { name: "使用测评", views: 8900, likes: 567, comments: 189 },
  { name: "好物推荐", views: 15200, likes: 1200, comments: 456 },
  { name: "对比评测", views: 6700, likes: 345, comments: 98 },
  { name: "教程分享", views: 4300, likes: 234, comments: 67 },
];

export default function AccountPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState<Partial<Account>>({
    name: "",
    platform: "小红书",
    handle: "",
  });

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    try {
      const res = await fetch("/api/accounts");
      const data = await res.json();
      setAccounts(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Fetch accounts error:", err);
    } finally {
      setLoading(false);
    }
  };

  const totalFollowers = accounts.reduce((s, a) => s + (Number(a.followers) || 0), 0);
  const avgEngagement = (
    accounts.reduce((s, a) => s + (Number(a.engagement) || 0), 0) / (accounts.length || 1)
  ).toFixed(1);

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/accounts?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      setAccounts(accounts.filter((a) => a.id !== id));
    } catch (err) {
      console.error("Delete error:", err);
    }
  };

  const handleAdd = async () => {
    const newAccount = {
      id: Date.now().toString(),
      name: formData.name || "",
      platform: formData.platform || "小红书",
      handle: formData.handle || "",
      followers: 0,
      posts: 0,
      engagement: 0,
      status: "active",
      avatar: "bg-[#4A90E2]",
      growth: 0,
    };
    try {
      await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newAccount),
      });
      setAccounts([newAccount as Account, ...accounts]);
    } catch (err) {
      console.error("Create error:", err);
    }
    setDialogOpen(false);
    setFormData({ name: "", platform: "小红书", handle: "" });
  };

  const statusConfig = {
    active: { label: "正常", variant: "green" as const, icon: CheckCircle2 },
    warning: { label: "需注意", variant: "yellow" as const, icon: AlertCircle },
    suspended: { label: "已封禁", variant: "pink" as const, icon: AlertCircle },
  };

  return (
    <PageWrapper>
      {/* Header */}
      <div className="mb-6 lg:mb-8">
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-gray-900 mb-2">
          <span className="highlight-pink">账号运营</span>
        </h1>
        <p className="text-sm lg:text-lg text-gray-600 font-medium">
          统一管理多平台运营账号，追踪粉丝增长和内容表现
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 lg:gap-6 mb-6 lg:mb-8">
        <Card>
          <CardContent className="p-3 lg:p-6 flex items-center justify-between">
            <div>
              <p className="text-[10px] lg:text-sm font-bold text-gray-500">总粉丝数</p>
              <p className="text-xl lg:text-3xl font-extrabold">
                {(totalFollowers / 10000).toFixed(1)}万
              </p>
            </div>
            <div className="flex h-8 w-8 lg:h-12 lg:w-12 items-center justify-center rounded-lg lg:rounded-xl border-[3px] border-gray-900 bg-[#FF6B7A]">
              <Users className="h-4 w-4 lg:h-6 lg:w-6 text-white" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 lg:p-6 flex items-center justify-between">
            <div>
              <p className="text-[10px] lg:text-sm font-bold text-gray-500">运营账号</p>
              <p className="text-xl lg:text-3xl font-extrabold">{accounts.length}</p>
            </div>
            <div className="flex h-8 w-8 lg:h-12 lg:w-12 items-center justify-center rounded-lg lg:rounded-xl border-[3px] border-gray-900 bg-[#4A90E2]">
              <Share2 className="h-4 w-4 lg:h-6 lg:w-6 text-white" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 lg:p-6 flex items-center justify-between">
            <div>
              <p className="text-[10px] lg:text-sm font-bold text-gray-500">平均互动率</p>
              <p className="text-xl lg:text-3xl font-extrabold">{avgEngagement}%</p>
            </div>
            <div className="flex h-8 w-8 lg:h-12 lg:w-12 items-center justify-center rounded-lg lg:rounded-xl border-[3px] border-gray-900 bg-[#FFC93C]">
              <Heart className="h-4 w-4 lg:h-6 lg:w-6 text-gray-900" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Account Cards */}
      <div className="flex items-center justify-between mb-4 lg:mb-6">
        <h2 className="text-base lg:text-xl font-extrabold">账号列表</h2>
        <Button
          variant="primary"
          onClick={() => setDialogOpen(true)}
          className="flex items-center gap-2 text-xs lg:text-sm px-3 lg:px-4 py-2"
        >
          <Plus className="h-3.5 w-3.5 lg:h-5 lg:w-5" />
          添加账号
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6 mb-8 lg:mb-10">
        {accounts.map((account) => {
          const status = statusConfig[account.status];
          return (
            <motion.div
              key={account.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <Card className="h-full">
                <CardContent className="p-4 lg:p-6">
                  <div className="flex items-start justify-between mb-3 lg:mb-4">
                    <div className="flex items-center gap-2 lg:gap-3">
                      <div
                        className={`flex h-10 w-10 lg:h-12 lg:w-12 items-center justify-center rounded-lg lg:rounded-xl border-[3px] border-gray-900 ${account.avatar}`}
                      >
                        {platformIcons[account.platform] || (
                          <Share2 className="h-4 w-4 lg:h-5 lg:w-5 text-white" />
                        )}
                      </div>
                      <div>
                        <h3 className="font-bold text-gray-900 text-sm lg:text-base">
                          {account.name}
                        </h3>
                        <p className="text-xs lg:text-sm font-medium text-gray-500">
                          {account.handle}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDelete(account.id)}
                      className="flex h-7 w-7 lg:h-8 lg:w-8 items-center justify-center rounded-lg border-[3px] border-gray-900 bg-[#FF6B7A] shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[2px] active:translate-y-[2px] transition-all"
                    >
                      <Trash2 className="h-3 w-3 lg:h-3.5 lg:w-3.5 text-white" />
                    </button>
                  </div>

                  <div className="flex items-center gap-2 mb-3 lg:mb-4">
                    <Badge variant={status.variant}>{status.label}</Badge>
                    <span className="text-[10px] lg:text-xs font-bold text-gray-400">
                      {account.platform}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5 lg:gap-2 mb-3 lg:mb-4">
                    <div className="text-center p-2 rounded-lg lg:rounded-xl border-[3px] border-gray-200">
                      <p className="text-[10px] lg:text-xs font-bold text-gray-500">粉丝</p>
                      <p className="text-xs lg:text-sm font-extrabold">
                        {(account.followers / 1000).toFixed(1)}k
                      </p>
                    </div>
                    <div className="text-center p-2 rounded-lg lg:rounded-xl border-[3px] border-gray-200">
                      <p className="text-[10px] lg:text-xs font-bold text-gray-500">内容</p>
                      <p className="text-xs lg:text-sm font-extrabold">{account.posts}</p>
                    </div>
                    <div className="text-center p-2 rounded-lg lg:rounded-xl border-[3px] border-gray-200">
                      <p className="text-[10px] lg:text-xs font-bold text-gray-500">互动</p>
                      <p className="text-xs lg:text-sm font-extrabold">
                        {account.engagement}%
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      {account.growth >= 0 ? (
                        <TrendingUp className="h-3 w-3 lg:h-4 lg:w-4 text-green-600" />
                      ) : (
                        <TrendingDown className="h-3 w-3 lg:h-4 lg:w-4 text-red-500" />
                      )}
                      <span
                        className={`text-xs lg:text-sm font-bold ${
                          account.growth >= 0
                            ? "text-green-600"
                            : "text-red-500"
                        }`}
                      >
                        {account.growth >= 0 ? "+" : ""}
                        {account.growth}%
                      </span>
                    </div>
                    <span className="text-[10px] lg:text-xs font-medium text-gray-400">
                      7日增长
                    </span>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Analytics */}
      <Tabs defaultValue="growth" className="mb-6 lg:mb-8">
        <TabsList className="mb-4 lg:mb-6 overflow-x-auto flex-nowrap">
          <TabsTrigger value="growth" className="text-xs lg:text-sm whitespace-nowrap">粉丝增长</TabsTrigger>
          <TabsTrigger value="content" className="text-xs lg:text-sm whitespace-nowrap">内容表现</TabsTrigger>
        </TabsList>

        <TabsContent value="growth">
          <Card>
            <CardHeader>
              <CardTitle className="text-base lg:text-xl">本周粉丝增长趋势</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={weeklyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                  <XAxis dataKey="day" tick={{ fontSize: 10, fontWeight: 700 }} />
                  <YAxis tick={{ fontSize: 10, fontWeight: 700 }} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: "12px",
                      border: "3px solid #171717",
                      boxShadow: "4px 4px 0px 0px rgba(0,0,0,1)",
                      fontWeight: 700,
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="followers"
                    stroke="#FF6B7A"
                    strokeWidth={3}
                    dot={{ fill: "#FF6B7A", strokeWidth: 2, r: 4, stroke: "#171717" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="content">
          <Card>
            <CardHeader>
              <CardTitle className="text-base lg:text-xl">内容类型表现</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={contentPerformance}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fontWeight: 700 }} />
                  <YAxis tick={{ fontSize: 10, fontWeight: 700 }} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: "12px",
                      border: "3px solid #171717",
                      boxShadow: "4px 4px 0px 0px rgba(0,0,0,1)",
                      fontWeight: 700,
                    }}
                  />
                  <Legend />
                  <Bar
                    dataKey="views"
                    name="浏览量"
                    fill="#FF6B7A"
                    stroke="#171717"
                    strokeWidth={2}
                    radius={[6, 6, 0, 0]}
                  />
                  <Bar
                    dataKey="likes"
                    name="点赞"
                    fill="#FFC93C"
                    stroke="#171717"
                    strokeWidth={2}
                    radius={[6, 6, 0, 0]}
                  />
                  <Bar
                    dataKey="comments"
                    name="评论"
                    fill="#4A90E2"
                    stroke="#171717"
                    strokeWidth={2}
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加运营账号</DialogTitle>
            <DialogDescription>
              添加新的社交媒体或电商平台账号
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 lg:space-y-4 py-2 lg:py-4">
            <div>
              <label className="text-xs lg:text-sm font-bold text-gray-900 mb-1 block">
                账号名称
              </label>
              <Input
                value={formData.name || ""}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="例如：数码好物推荐"
                className="text-sm"
              />
            </div>
            <div>
              <label className="text-xs lg:text-sm font-bold text-gray-900 mb-1 block">
                用户名/ID
              </label>
              <Input
                value={formData.handle || ""}
                onChange={(e) =>
                  setFormData({ ...formData, handle: e.target.value })
                }
                placeholder="@username"
                className="text-sm"
              />
            </div>
            <div>
              <label className="text-xs lg:text-sm font-bold text-gray-900 mb-1 block">
                所属平台
              </label>
              <select
                value={formData.platform || "小红书"}
                onChange={(e) =>
                  setFormData({ ...formData, platform: e.target.value })
                }
                className="neo-input w-full text-sm"
              >
                <option>小红书</option>
                <option>抖音</option>
                <option>淘宝直播</option>
                <option>B站</option>
                <option>微博</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button variant="primary" onClick={handleAdd}>
              添加账号
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  );
}
