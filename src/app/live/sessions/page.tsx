"use client";

import { useState, useEffect } from "react";
import { ArrowLeft, Link2, RefreshCw, Download, Loader2, ChevronDown, ChevronUp, Users, Eye, Clock, ShoppingCart, DollarSign, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { PageWrapper } from "@/components/page-wrapper";
import { authFetch } from "@/lib/auth-fetch";

interface TopProduct { title: string; sold: number; gmv: number; }
interface RetentionPoint { minute: number; viewers: number; }
interface Session {
  id: number;
  session_id: string;
  title: string;
  start_time: string;
  end_time: string;
  duration: number;
  total_viewers: number;
  peak_viewers: number;
  avg_stay_duration: number;
  orders_count: number;
  gmv: number;
  top_products: TopProduct[] | null;
  retention_curve: RetentionPoint[] | null;
  script_notes: string | null;
  fetched_at: string;
}

function fmtTime(s: string): string {
  if (!s) return "-";
  try {
    const d = new Date(s);
    return d.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch { return s; }
}

function fmtDuration(sec: number): string {
  if (!sec || sec <= 0) return "-";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}小时${m}分` : `${m}分钟`;
}

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
}

// 简单 SVG 留人曲线（无图表库依赖）
function RetentionChart({ points }: { points: RetentionPoint[] }) {
  if (!points || points.length === 0) return <p className="text-gray-400 text-sm">暂无留人曲线数据</p>;
  const max = Math.max(...points.map((p) => p.viewers), 1);
  const w = 600;
  const h = 120;
  const padding = 20;
  const stepX = (w - padding * 2) / Math.max(points.length - 1, 1);
  const pathD = points.map((p, i) => {
    const x = padding + i * stepX;
    const y = h - padding - (p.viewers / max) * (h - padding * 2);
    return `${i === 0 ? "M" : "L"}${x},${y}`;
  }).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-32 border-2 border-gray-200 rounded-lg bg-gray-50">
      <path d={pathD} fill="none" stroke="#9B59B6" strokeWidth="2" />
      {points.map((p, i) => {
        const x = padding + i * stepX;
        const y = h - padding - (p.viewers / max) * (h - padding * 2);
        return <circle key={i} cx={x} cy={y} r="3" fill="#9B59B6" />;
      })}
    </svg>
  );
}

export default function LiveSessionsPage() {
  const [bound, setBound] = useState(false);
  const [openId, setOpenId] = useState("");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/live/douyin/sessions");
      const json = await res.json();
      if (json.error) { setError(json.error); }
      else {
        setBound(!!json.bound);
        setOpenId(json.open_id || "");
        setSessions(json.sessions || []);
      }
    } catch {
      setError("加载失败");
    } finally {
      setLoading(false);
    }
  };

  const fetchLives = async () => {
    setFetching(true);
    setError("");
    setSuccess("");
    try {
      const res = await authFetch("/api/live/douyin/fetch-lives", { method: "POST" });
      const json = await res.json();
      if (json.error) {
        setError(json.error);
      } else {
        setSuccess(`同步完成: ${json.synced} 场直播${json.cleaned > 0 ? `，清理旧记录 ${json.cleaned} 条` : ""}`);
        fetchData();
      }
    } catch {
      setError("同步失败");
    } finally {
      setFetching(false);
    }
  };

  const exportCSV = () => {
    if (sessions.length === 0) return;
    const headers = ["直播标题", "开始时间", "结束时间", "时长(秒)", "累计观看", "峰值在线", "平均停留(秒)", "下单数", "GMV"];
    const rows = [headers.join(",")];
    for (const s of sessions) {
      rows.push([
        csvEscape(s.title), csvEscape(s.start_time), csvEscape(s.end_time),
        s.duration, s.total_viewers, s.peak_viewers, s.avg_stay_duration,
        s.orders_count, s.gmv,
      ].join(","));
    }
    const bom = "\uFEFF";
    const blob = new Blob([bom + rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `直播资讯_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    // 检查 URL 参数（OAuth 回调后的提示）
    const params = new URLSearchParams(window.location.search);
    if (params.get("bound") === "1") setSuccess("抖音账号绑定成功");
    if (params.get("error")) setError(params.get("error")!);
    fetchData();
  }, []);

  return (
    <PageWrapper>
      {/* 返回入口 + 标题 */}
      <div className="mb-6">
        <Link href="/live/operations" className="inline-flex items-center gap-2 text-sm lg:text-base text-gray-600 hover:text-gray-900 mb-3 font-medium">
          <ArrowLeft className="h-4 w-4" /> 返回直播运营操作台
        </Link>
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-gray-900 mb-2">
          <span className="highlight-purple">直播资讯</span>
        </h1>
        <p className="text-sm lg:text-lg text-gray-600 font-medium">
          自动拉取抖音直播间每场数据（下单/留人/话术），仅保留最近 3 场
        </p>
      </div>

      {/* 错误/成功提示 */}
      {error && (
        <div className="neo-card p-4 mb-4 bg-red-50 flex items-start gap-2">
          <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm font-bold text-red-700">{error}</p>
        </div>
      )}
      {success && (
        <div className="neo-card p-4 mb-4 bg-green-50">
          <p className="text-sm font-bold text-green-700">{success}</p>
        </div>
      )}

      {/* 授权状态区 */}
      <div className="neo-card p-4 lg:p-6 mb-6 bg-white">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-gray-700 mb-1">授权状态</p>
            {bound ? (
              <>
                <p className="text-green-600 font-extrabold flex items-center gap-1.5">
                  <Link2 className="h-4 w-4" /> 已绑定抖音账号
                </p>
                <p className="text-xs text-gray-500 mt-1">OpenID: {openId.slice(0, 8)}...</p>
              </>
            ) : (
              <p className="text-gray-500 font-bold">未绑定抖音账号</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {!bound && (
              <a
                href="/api/live/douyin/oauth"
                className="inline-flex items-center gap-2 bg-[#9B59B6] text-white font-extrabold py-2 px-4 rounded-lg border-2 border-gray-900 hover:-translate-y-0.5 transition-all"
                style={{ boxShadow: "4px 4px 0px 0px rgba(0,0,0,1)" }}
              >
                <Link2 className="h-4 w-4" /> 绑定抖音账号
              </a>
            )}
            {bound && (
              <>
                <a
                  href="/api/live/douyin/oauth"
                  className="inline-flex items-center gap-2 bg-white text-gray-900 font-bold py-2 px-3 rounded-lg border-2 border-gray-900 hover:-translate-y-0.5 transition-all text-sm"
                  style={{ boxShadow: "4px 4px 0px 0px rgba(0,0,0,1)" }}
                >
                  重新授权
                </a>
                <button
                  onClick={fetchLives}
                  disabled={fetching}
                  className="inline-flex items-center gap-2 bg-[#9B59B6] text-white font-extrabold py-2 px-4 rounded-lg border-2 border-gray-900 hover:-translate-y-0.5 transition-all disabled:opacity-60"
                  style={{ boxShadow: "4px 4px 0px 0px rgba(0,0,0,1)" }}
                >
                  {fetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  {fetching ? "同步中..." : "拉取直播数据"}
                </button>
                <button
                  onClick={exportCSV}
                  disabled={sessions.length === 0}
                  className="inline-flex items-center gap-2 bg-[#4CD964] text-white font-extrabold py-2 px-3 rounded-lg border-2 border-gray-900 hover:-translate-y-0.5 transition-all disabled:opacity-60 text-sm"
                  style={{ boxShadow: "4px 4px 0px 0px rgba(0,0,0,1)" }}
                >
                  <Download className="h-4 w-4" /> 导出 CSV
                </button>
              </>
            )}
          </div>
        </div>
        {!bound && (
          <div className="mt-4 p-3 bg-yellow-50 border-2 border-yellow-300 rounded-lg">
            <p className="text-xs text-yellow-800 font-medium">
              绑定前需先在 <a href="https://open.douyin.com/" target="_blank" rel="noopener noreferrer" className="underline font-bold">抖音开放平台</a> 注册开发者、创建网站应用、申请 <code className="bg-yellow-200 px-1 rounded">video.live.data</code> 能力，并在 Vercel 配置 <code className="bg-yellow-200 px-1 rounded">DOUYIN_CLIENT_KEY</code> / <code className="bg-yellow-200 px-1 rounded">DOUYIN_CLIENT_SECRET</code> / <code className="bg-yellow-200 px-1 rounded">DOUYIN_REDIRECT_URI</code> 环境变量
            </p>
          </div>
        )}
      </div>

      {/* 直播场次列表 */}
      {loading ? (
        <div className="neo-card p-12 bg-white text-center">
          <Loader2 className="h-8 w-8 text-gray-400 animate-spin mx-auto mb-3" />
          <p className="text-gray-500 font-medium">加载中...</p>
        </div>
      ) : sessions.length === 0 ? (
        <div className="neo-card p-12 bg-white text-center">
          <p className="text-gray-700 font-bold mb-2">{bound ? "暂无直播数据" : "未绑定抖音账号"}</p>
          <p className="text-gray-500 text-sm">
            {bound ? '点击"拉取直播数据"按钮同步最近 3 场直播' : "请先绑定抖音账号"}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {sessions.map((s, idx) => (
            <SessionCard
              key={s.id}
              session={s}
              expanded={expanded === idx}
              onToggle={() => setExpanded(expanded === idx ? null : idx)}
            />
          ))}
        </div>
      )}
    </PageWrapper>
  );
}

function SessionCard({
  session: s, expanded, onToggle,
}: {
  session: Session; expanded: boolean; onToggle: () => void;
}) {
  return (
    <div className="neo-card bg-white overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3 text-left">
          <span className="inline-block w-3 h-12 rounded bg-[#9B59B6]" />
          <div>
            <p className="font-extrabold text-gray-900 text-base">{s.title || "未命名直播"}</p>
            <p className="text-xs text-gray-500 mt-0.5">{fmtTime(s.start_time)} · {fmtDuration(s.duration)}</p>
          </div>
        </div>
        {expanded ? <ChevronUp className="h-5 w-5 text-gray-500" /> : <ChevronDown className="h-5 w-5 text-gray-500" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4">
          {/* 关键指标网格 */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <Metric icon={Users} label="累计观看" value={s.total_viewers.toLocaleString()} color="text-[#4A90E2]" />
            <Metric icon={Eye} label="峰值在线" value={s.peak_viewers.toLocaleString()} color="text-[#9B59B6]" />
            <Metric icon={Clock} label="平均停留" value={fmtDuration(s.avg_stay_duration)} color="text-[#FF6B6B]" />
            <Metric icon={ShoppingCart} label="下单数" value={String(s.orders_count)} color="text-[#4CD964]" />
            <Metric icon={DollarSign} label="GMV" value={`¥${s.gmv.toFixed(0)}`} color="text-[#FFC93C]" />
          </div>

          {/* Top 商品 */}
          <div>
            <p className="text-sm font-bold text-gray-700 mb-2">Top 商品</p>
            {s.top_products && s.top_products.length > 0 ? (
              <table className="w-full text-sm">
                <thead><tr className="border-b-2 border-gray-300"><th className="text-left py-1.5 px-2">商品</th><th className="text-left py-1.5 px-2">销量</th><th className="text-left py-1.5 px-2">GMV</th></tr></thead>
                <tbody>
                  {s.top_products.map((p, i) => (
                    <tr key={i} className="border-b border-gray-200">
                      <td className="py-1.5 px-2 text-gray-800">{p.title}</td>
                      <td className="py-1.5 px-2 text-gray-600">{p.sold}</td>
                      <td className="py-1.5 px-2 text-gray-600">¥{p.gmv.toFixed(0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="text-gray-400 text-sm">暂无商品数据</p>}
          </div>

          {/* 留人曲线 */}
          <div>
            <p className="text-sm font-bold text-gray-700 mb-2">留人曲线</p>
            <RetentionChart points={s.retention_curve || []} />
          </div>

          {/* 话术记录 */}
          <div>
            <p className="text-sm font-bold text-gray-700 mb-2">话术记录</p>
            {s.script_notes ? (
              <pre className="text-sm text-gray-700 bg-gray-50 p-3 rounded-lg border-2 border-gray-200 whitespace-pre-wrap font-sans">{s.script_notes}</pre>
            ) : <p className="text-gray-400 text-sm">暂无话术记录</p>}
          </div>

          <p className="text-xs text-gray-400">抓取时间: {fmtTime(s.fetched_at)}</p>
        </div>
      )}
    </div>
  );
}

function Metric({ icon: Icon, label, value, color }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; color: string }) {
  return (
    <div className="border-2 border-gray-200 rounded-lg p-2 text-center bg-gray-50">
      <Icon className={`h-4 w-4 mx-auto mb-1 ${color}`} />
      <p className="text-xs text-gray-500 font-medium">{label}</p>
      <p className={`text-base font-extrabold ${color}`}>{value}</p>
    </div>
  );
}
