"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { Settings, Shield, User, UserCog, Crown, ArrowLeft, Trash2, Eye, EyeOff, Circle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageWrapper } from "@/components/page-wrapper";

interface Member {
  id: string;
  name: string;
  phone: string;
  role: "admin" | "customer" | "operator";
  password: string;
  is_online: boolean;
  last_online: string | null;
  created_at: string;
}

const ROLE_CONFIG = {
  admin: { label: "管理员", color: "bg-[#FF6B7A]", icon: Crown, desc: "全部权限" },
  customer: { label: "顾客", color: "bg-[#4A90E2]", icon: User, desc: "仅查看" },
  operator: { label: "后台操作", color: "bg-[#FFC93C]", icon: UserCog, desc: "管理权限" },
};

export default function MembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [currentRole, setCurrentRole] = useState("");
  const [showPassword, setShowPassword] = useState<Record<string, boolean>>({});
  const [editingPassword, setEditingPassword] = useState<Record<string, string>>({});

  useEffect(() => {
    const role = localStorage.getItem("member_role") || "";
    setCurrentRole(role);
    fetchMembers();
  }, []);

  const fetchMembers = async () => {
    try {
      const res = await fetch("/api/members");
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setMembers(data);
      }
    } catch {
      setError("获取成员列表失败");
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (id: string, role: string) => {
    try {
      const res = await fetch("/api/members", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, role }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setMembers(members.map((m) => (m.id === id ? { ...m, role: role as Member["role"] } : m)));
        // 如果是当前登录用户被修改，更新 localStorage
        const currentId = localStorage.getItem("member_id");
        if (currentId === id) {
          localStorage.setItem("member_role", role);
          alert("权限已更新，请刷新页面生效");
        }
      }
    } catch {
      setError("修改角色失败");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定要删除该成员吗？")) return;
    try {
      const res = await fetch(`/api/members?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setMembers(members.filter((m) => m.id !== id));
      }
    } catch {
      setError("删除失败");
    }
  };

  const handlePasswordChange = async (id: string) => {
    const newPassword = editingPassword[id]?.trim();
    if (!newPassword) {
      alert("请输入新密码");
      return;
    }
    try {
      const res = await fetch("/api/members", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, password: newPassword }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setMembers(members.map((m) => (m.id === id ? { ...m, password: newPassword } : m)));
        setEditingPassword((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        alert("密码修改成功");
      }
    } catch {
      setError("修改密码失败");
    }
  };

  const formatLastOnline = (lastOnline: string | null, isOnline: boolean): string => {
    if (isOnline) return "在线";
    if (!lastOnline) return "从未上线";
    const date = new Date(lastOnline);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "刚刚离线";
    if (diffMins < 60) return `${diffMins}分钟前`;
    if (diffHours < 24) return `${diffHours}小时前`;
    if (diffDays < 7) return `${diffDays}天前`;
    return date.toLocaleDateString("zh-CN");
  };

  const isAdmin = currentRole === "admin";

  return (
    <PageWrapper>
      <div className="mb-6 lg:mb-8">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-gray-900 mb-3"
        >
          <ArrowLeft className="h-4 w-4" />
          返回首页
        </Link>
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-gray-900 mb-2">
          <Settings className="h-6 w-6 lg:h-8 lg:w-8 inline mr-2" />
          成员管理
        </h1>
        <p className="text-sm lg:text-lg text-gray-600 font-medium">
          管理所有成员的访问权限等级
        </p>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 border-2 border-red-200 mb-4">
          <p className="text-sm font-bold text-red-600">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {Object.entries(ROLE_CONFIG).map(([key, config]) => {
          const Icon = config.icon;
          const count = members.filter((m) => m.role === key).length;
          return (
            <Card key={key}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg border-[3px] border-gray-900 ${config.color} shrink-0`}>
                  <Icon className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-sm font-extrabold text-gray-900">{config.label}</p>
                  <p className="text-xs text-gray-500">{config.desc}</p>
                  <p className="text-lg font-extrabold text-gray-900">{count} 人</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            成员列表
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-gray-400 font-bold">加载中...</div>
          ) : members.length === 0 ? (
            <div className="text-center py-8 text-gray-400 font-bold">暂无成员</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-gray-200">
                    <th className="text-left py-3 px-2 font-extrabold text-gray-500">用户名</th>
                    <th className="text-left py-3 px-2 font-extrabold text-gray-500 hidden sm:table-cell">手机号</th>
                    <th className="text-left py-3 px-2 font-extrabold text-gray-500">权限等级</th>
                    <th className="text-left py-3 px-2 font-extrabold text-gray-500 hidden lg:table-cell">在线状态</th>
                    <th className="text-left py-3 px-2 font-extrabold text-gray-500 hidden lg:table-cell">密码</th>
                    <th className="text-left py-3 px-2 font-extrabold text-gray-500 hidden lg:table-cell">注册时间</th>
                    <th className="text-right py-3 px-2 font-extrabold text-gray-500">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((member) => {
                    const roleConfig = ROLE_CONFIG[member.role] || ROLE_CONFIG.customer;
                    const RoleIcon = roleConfig.icon;
                    const isOnline = member.is_online;
                    const isPasswordVisible = showPassword[member.id];
                    const isEditingPassword = editingPassword[member.id] !== undefined;
                    return (
                      <tr key={member.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-3 px-2 font-bold text-gray-900">{member.name}</td>
                        <td className="py-3 px-2 text-gray-500 hidden sm:table-cell">{member.phone}</td>
                        <td className="py-3 px-2">
                          {isAdmin ? (
                            <select
                              value={member.role}
                              onChange={(e) => handleRoleChange(member.id, e.target.value)}
                              className="rounded-lg border-[2px] border-gray-200 px-2 py-1 text-xs font-bold focus:border-gray-900 focus:outline-none bg-white"
                            >
                              <option value="admin">管理员</option>
                              <option value="operator">后台操作</option>
                              <option value="customer">顾客</option>
                            </select>
                          ) : (
                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold text-white ${roleConfig.color}`}>
                              <RoleIcon className="h-3 w-3" />
                              {roleConfig.label}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-2 hidden lg:table-cell">
                          <div className="flex items-center gap-1.5">
                            <Circle
                              className={`h-2 w-2 ${isOnline ? "text-[#4CD964] fill-[#4CD964]" : "text-gray-300"}`}
                            />
                            <span className={`text-xs font-bold ${isOnline ? "text-[#4CD964]" : "text-gray-400"}`}>
                              {formatLastOnline(member.last_online, isOnline)}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-2 hidden lg:table-cell">
                          {isAdmin ? (
                            <div className="flex items-center gap-1">
                              {isEditingPassword ? (
                                <>
                                  <input
                                    type="text"
                                    value={editingPassword[member.id] || ""}
                                    onChange={(e) =>
                                      setEditingPassword((prev) => ({ ...prev, [member.id]: e.target.value }))
                                    }
                                    className="w-20 rounded-md border-[2px] border-gray-200 px-1.5 py-0.5 text-xs font-bold focus:border-gray-900 focus:outline-none"
                                    placeholder="新密码"
                                  />
                                  <button
                                    onClick={() => handlePasswordChange(member.id)}
                                    className="text-[10px] font-bold text-[#4CD964] hover:underline"
                                  >
                                    保存
                                  </button>
                                  <button
                                    onClick={() => {
                                      setEditingPassword((prev) => {
                                        const next = { ...prev };
                                        delete next[member.id];
                                        return next;
                                      });
                                    }}
                                    className="text-[10px] font-bold text-red-400 hover:underline"
                                  >
                                    取消
                                  </button>
                                </>
                              ) : (
                                <>
                                  <span className="text-xs font-bold text-gray-500">
                                    {isPasswordVisible ? (member.password || "******") : "******"}
                                  </span>
                                  <button
                                    onClick={() =>
                                      setShowPassword((prev) => ({ ...prev, [member.id]: !prev[member.id] }))
                                    }
                                    className="text-gray-400 hover:text-gray-700"
                                  >
                                    {isPasswordVisible ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                                  </button>
                                  <button
                                    onClick={() =>
                                      setEditingPassword((prev) => ({ ...prev, [member.id]: "" }))
                                    }
                                    className="text-[10px] font-bold text-[#4A90E2] hover:underline"
                                  >
                                    修改
                                  </button>
                                </>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">无权限</span>
                          )}
                        </td>
                        <td className="py-3 px-2 text-gray-400 text-xs hidden lg:table-cell">
                          {new Date(member.created_at).toLocaleDateString("zh-CN")}
                        </td>
                        <td className="py-3 px-2 text-right">
                          {isAdmin && (
                            <button
                              onClick={() => handleDelete(member.id)}
                              className="inline-flex items-center gap-1 text-xs font-bold text-red-500 hover:text-red-700 transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              删除
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </PageWrapper>
  );
}