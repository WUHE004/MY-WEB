"use client";

import { useState, useEffect } from "react";
import { ArrowLeft, RefreshCw, Download, Loader2, ChevronDown, ChevronUp, Calendar, ExternalLink } from "lucide-react";
import Link from "next/link";
import { PageWrapper } from "@/components/page-wrapper";
import { authFetch } from "@/lib/auth-fetch";

interface HotTechnique { title: string; desc: string; }
interface HotRoom { anchor: string; category: string; highlight: string; }
interface RetentionTip { tip: string; desc: string; }
interface Script { scene: string; content: string; }

interface LiveNews {
  date: string;
  hot_techniques: HotTechnique[] | null;
  hot_rooms: HotRoom[] | null;
  retention_tips: RetentionTip[] | null;
  scripts: Script[] | null;
  category_insights: string | null;
}

// 轻量 Markdown 渲染
function renderMarkdown(md: string): React.ReactNode {
  const lines = md.split("\n");
  const out: React.ReactNode[] = [];
  let listBuffer: React.ReactNode[] = [];

  const flushList = () => {
    if (listBuffer.length > 0) {
      out.push(
        <ul key={`ul-${out.length}`} className="list-disc pl-5 my-2 space-y-1 text-sm lg:text-base">
          {listBuffer}
        </ul>
      );
      listBuffer = [];
    }
  };

  const renderInline = (text: string): React.ReactNode => {
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((p, i) => {
      if (p.startsWith("**") && p.endsWith("**")) {
        return <strong key={i} className="font-bold text-gray-900">{p.slice(2, -2)}</strong>;
      }
      return <span key={i}>{p}</span>;
    });
  };

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) { flushList(); continue; }
    if (trimmed.startsWith("### ")) {
      flushList();
      out.push(<h4 key={i} className="text-base lg:text-lg font-bold text-gray-800 mt-3 mb-1">{renderInline(trimmed.slice(4))}</h4>);
    } else if (trimmed.startsWith("## ")) {
      flushList();
      out.push(<h3 key={i} className="text-lg lg:text-xl font-extrabold text-gray-900 mt-4 mb-2 border-b-2 border-gray-200 pb-1">{renderInline(trimmed.slice(3))}</h3>);
    } else if (trimmed.startsWith("# ")) {
      flushList();
      out.push(<h2 key={i} className="text-xl lg:text-2xl font-extrabold text-gray-900 mt-4 mb-2">{renderInline(trimmed.slice(2))}</h2>);
    } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      listBuffer.push(<li key={i}>{renderInline(trimmed.slice(2))}</li>);
    } else {
      flushList();
      out.push(<p key={i} className="text-sm lg:text-base text-gray-700 my-1">{renderInline(trimmed)}</p>);
    }
  }
  flushList();
  return out;
}

export default function LiveSessionsPage() {
  const [data, setData] = useState<LiveNews | null>(null);
  const [today, setToday] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [diag, setDiag] = useState<string[]>([]);
  const [expandedSection, setExpandedSection] = useState<string | null>("insights");

  const fetchData = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/live/sessions-news");
      const json = await res.json();
      if (json.error) setError(json.error);
      setData(json.data || null);
      setToday(json.today || "");
    } catch {
      setError("加载失败");
    } finally {
      setLoading(false);
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    setError("");
    setDiag([]);
    try {
      const res = await authFetch("/api/live/sessions-news", { method: "POST" });
      const json = await res.json();
      if (json.error) {
        setError(json.error);
      } else {
        setData(json.data || null);
        setToday(json.today || "");
        setDiag(json.diagnostics || []);
      }
    } catch {
      setError("刷新失败");
    } finally {
      setRefreshing(false);
    }
  };

  const exportMarkdown = () => {
    if (!data?.category_insights) return;
    const bom = "\uFEFF";
    const blob = new Blob([bom + data.category_insights], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `直播资讯报告_${data.date || today}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => { fetchData(); }, []);

  const toggle = (s: string) => setExpandedSection(expandedSection === s ? null : s);

  return (
    <PageWrapper>
      {/* 返回入口 + 标题 */}
      <div className="mb-6">
        <Link href="/links" className="inline-flex items-center gap-2 text-sm lg:text-base text-gray-600 hover:text-gray-900 mb-3 font-medium">
          <ArrowLeft className="h-4 w-4" /> 返回操作台
        </Link>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-gray-900 mb-2">
            <span className="highlight-purple">直播资讯</span>
          </h1>
          {data?.date && (
            <span className="inline-flex items-center gap-1.5 text-xs lg:text-sm font-bold text-gray-600 bg-gray-100 px-2.5 lg:px-3 py-1 rounded-full border-2 border-gray-300">
              <Calendar className="h-3.5 w-3.5" /> {data.date}
            </span>
          )}
        </div>
        <p className="hidden lg:block text-lg text-gray-600 font-medium">
          直播带货技巧 · 热门直播间案例 · 留人方法 · 话术参考
        </p>
      </div>

      {/* 操作栏：移动端两按钮并排 */}
      <div className="grid grid-cols-2 lg:flex lg:flex-wrap gap-2 lg:gap-3 mb-6">
        <button
          onClick={refresh}
          disabled={refreshing}
          className="inline-flex items-center justify-center gap-1.5 lg:gap-2 bg-[#9B59B6] text-white font-extrabold py-2 px-3 lg:px-4 rounded-lg border-2 border-gray-900 hover:-translate-y-0.5 transition-all disabled:opacity-60 text-sm lg:text-base"
          style={{ boxShadow: "4px 4px 0px 0px rgba(0,0,0,1)" }}
        >
          {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {refreshing ? "生成中..." : "刷新数据"}
        </button>
        <button
          onClick={exportMarkdown}
          disabled={!data?.category_insights}
          className="inline-flex items-center justify-center gap-1.5 lg:gap-2 bg-[#FFC93C] text-gray-900 font-extrabold py-2 px-3 lg:px-4 rounded-lg border-2 border-gray-900 hover:-translate-y-0.5 transition-all disabled:opacity-60 text-sm lg:text-base"
          style={{ boxShadow: "4px 4px 0px 0px rgba(0,0,0,1)" }}
        >
          <Download className="h-4 w-4" /> 导出报告
        </button>
      </div>

      {/* 错误 */}
      {error && (
        <div className="neo-card p-4 mb-6 bg-red-50">
          <p className="text-sm font-bold text-red-700">{error}</p>
        </div>
      )}

      {/* 诊断 */}
      {diag.length > 0 && (
        <div className="neo-card p-3 mb-6 bg-gray-50 text-xs text-gray-600 font-mono">
          {diag.map((d, i) => <div key={i}>• {d}</div>)}
        </div>
      )}

      {/* 内容区 */}
      {loading ? (
        <div className="neo-card p-12 bg-white text-center">
          <Loader2 className="h-8 w-8 text-gray-400 animate-spin mx-auto mb-3" />
          <p className="text-gray-500 font-medium">加载中...</p>
        </div>
      ) : !data ? (
        <div className="neo-card p-12 bg-white text-center">
          <p className="text-gray-700 font-bold mb-2">今日资讯尚未生成</p>
          <p className="text-gray-500 text-sm">点击"刷新数据"按钮生成当日直播资讯（约 10-15 秒）</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* 直播带货热门技巧 */}
          <SectionCard
            title="直播带货热门技巧"
            color="bg-[#9B59B6]"
            expanded={expandedSection === "techniques"}
            onToggle={() => toggle("techniques")}
            count={data.hot_techniques?.length || 0}
          >
            {data.hot_techniques && data.hot_techniques.length > 0 ? (
              <>
                {/* 移动端卡片 */}
                <div className="lg:hidden space-y-2">
                  {data.hot_techniques.map((t, i) => (
                    <div key={i} className="border-2 border-gray-200 rounded-lg p-2.5 bg-gray-50">
                      <div className="flex items-start gap-2 mb-1">
                        <span className="text-xs font-bold text-gray-400">#{i + 1}</span>
                        <p className="font-bold text-gray-900 text-sm">{t.title}</p>
                      </div>
                      <p className="text-xs text-gray-600 leading-snug pl-6">{t.desc}</p>
                    </div>
                  ))}
                </div>
                {/* 桌面端表格 */}
                <table className="hidden lg:table w-full text-sm">
                  <thead><tr className="border-b-2 border-gray-300"><th className="text-left py-2 px-2">#</th><th className="text-left py-2 px-2">技巧</th><th className="text-left py-2 px-2">描述</th></tr></thead>
                  <tbody>
                    {data.hot_techniques.map((t, i) => (
                      <tr key={i} className="border-b border-gray-200">
                        <td className="py-2 px-2 text-gray-400 font-bold">{i + 1}</td>
                        <td className="py-2 px-2 font-bold text-gray-900">{t.title}</td>
                        <td className="py-2 px-2 text-gray-600">{t.desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : <EmptyData />}
          </SectionCard>

          {/* 热门直播间案例 */}
          <SectionCard
            title="热门直播间案例"
            color="bg-[#FF6B6B]"
            expanded={expandedSection === "rooms"}
            onToggle={() => toggle("rooms")}
            count={data.hot_rooms?.length || 0}
          >
            {data.hot_rooms && data.hot_rooms.length > 0 ? (
              <>
                {/* 移动端卡片 + 跳转 */}
                <div className="lg:hidden space-y-2">
                  {data.hot_rooms.map((r, i) => {
                    const homepage = `https://www.douyin.com/search/${encodeURIComponent(r.anchor)}`;
                    return (
                      <div key={i} className="border-2 border-gray-200 rounded-lg p-2.5 bg-gray-50">
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="text-xs font-bold text-gray-400">#{i + 1}</span>
                            <p className="font-bold text-gray-900 text-sm truncate">{r.anchor}</p>
                          </div>
                          <a
                            href={homepage}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 bg-[#FF6B6B] text-white text-xs font-bold px-2 py-1 rounded-md border border-gray-900 flex-shrink-0"
                          >
                            <ExternalLink className="h-3 w-3" /> 跳转
                          </a>
                        </div>
                        <div className="text-xs text-gray-600 space-y-0.5">
                          <p>品类: <span className="font-bold text-gray-800">{r.category}</span></p>
                          <p>亮点: <span className="text-gray-700">{r.highlight}</span></p>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* 桌面端表格 */}
                <table className="hidden lg:table w-full text-sm">
                  <thead><tr className="border-b-2 border-gray-300"><th className="text-left py-2 px-2">#</th><th className="text-left py-2 px-2">主播</th><th className="text-left py-2 px-2">品类</th><th className="text-left py-2 px-2">亮点</th><th className="text-left py-2 px-2">操作</th></tr></thead>
                  <tbody>
                    {data.hot_rooms.map((r, i) => {
                      const homepage = `https://www.douyin.com/search/${encodeURIComponent(r.anchor)}`;
                      return (
                        <tr key={i} className="border-b border-gray-200">
                          <td className="py-2 px-2 text-gray-400 font-bold">{i + 1}</td>
                          <td className="py-2 px-2 font-bold text-gray-900">{r.anchor}</td>
                          <td className="py-2 px-2 text-gray-700">{r.category}</td>
                          <td className="py-2 px-2 text-gray-600">{r.highlight}</td>
                          <td className="py-2 px-2">
                            <a href={homepage} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 bg-[#FF6B6B] text-white text-xs font-bold px-2 py-1 rounded-md border border-gray-900 hover:-translate-y-0.5 transition-all">
                              <ExternalLink className="h-3 w-3" /> 主页
                            </a>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </>
            ) : <EmptyData />}
          </SectionCard>

          {/* 直播留人方法 */}
          <SectionCard
            title="直播留人方法"
            color="bg-[#4A90E2]"
            expanded={expandedSection === "tips"}
            onToggle={() => toggle("tips")}
            count={data.retention_tips?.length || 0}
          >
            {data.retention_tips && data.retention_tips.length > 0 ? (
              <>
                <div className="lg:hidden space-y-2">
                  {data.retention_tips.map((t, i) => (
                    <div key={i} className="border-2 border-gray-200 rounded-lg p-2.5 bg-gray-50">
                      <div className="flex items-start gap-2 mb-1">
                        <span className="text-xs font-bold text-gray-400">#{i + 1}</span>
                        <p className="font-bold text-gray-900 text-sm">{t.tip}</p>
                      </div>
                      <p className="text-xs text-gray-600 leading-snug pl-6">{t.desc}</p>
                    </div>
                  ))}
                </div>
                <table className="hidden lg:table w-full text-sm">
                  <thead><tr className="border-b-2 border-gray-300"><th className="text-left py-2 px-2">#</th><th className="text-left py-2 px-2">方法</th><th className="text-left py-2 px-2">描述</th></tr></thead>
                  <tbody>
                    {data.retention_tips.map((t, i) => (
                      <tr key={i} className="border-b border-gray-200">
                        <td className="py-2 px-2 text-gray-400 font-bold">{i + 1}</td>
                        <td className="py-2 px-2 font-bold text-gray-900">{t.tip}</td>
                        <td className="py-2 px-2 text-gray-600">{t.desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : <EmptyData />}
          </SectionCard>

          {/* 直播话术参考 */}
          <SectionCard
            title="直播话术参考"
            color="bg-[#4CD964]"
            expanded={expandedSection === "scripts"}
            onToggle={() => toggle("scripts")}
            count={data.scripts?.length || 0}
          >
            {data.scripts && data.scripts.length > 0 ? (
              <div className="space-y-2">
                {data.scripts.map((s, i) => (
                  <div key={i} className="border-2 border-gray-200 rounded-lg p-2.5 lg:p-3 bg-gray-50">
                    <p className="font-bold text-[#4CD964] text-sm mb-1">【{s.scene}】</p>
                    <p className="text-xs lg:text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{s.content}</p>
                  </div>
                ))}
              </div>
            ) : <EmptyData />}
          </SectionCard>

          {/* 运营参考 */}
          <SectionCard
            title="完整运营参考"
            color="bg-[#FFC93C]"
            expanded={expandedSection === "insights"}
            onToggle={() => toggle("insights")}
          >
            {data.category_insights ? (
              <div className="prose prose-sm max-w-none">{renderMarkdown(data.category_insights)}</div>
            ) : <EmptyData />}
          </SectionCard>
        </div>
      )}
    </PageWrapper>
  );
}

function SectionCard({
  title, color, expanded, onToggle, count, children,
}: {
  title: string; color: string; expanded: boolean; onToggle: () => void; count?: number; children: React.ReactNode;
}) {
  return (
    <div className="neo-card bg-white overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-3 lg:p-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2 lg:gap-3">
          <span className={`inline-block w-2.5 lg:w-3 h-6 lg:h-8 rounded ${color}`} />
          <span className="font-extrabold text-gray-900 text-sm lg:text-lg">{title}</span>
          {count !== undefined && count > 0 && (
            <span className="text-xs bg-gray-200 text-gray-700 px-2 py-0.5 rounded-full font-bold">{count}</span>
          )}
        </div>
        {expanded ? <ChevronUp className="h-5 w-5 text-gray-500" /> : <ChevronDown className="h-5 w-5 text-gray-500" />}
      </button>
      {expanded && <div className="px-3 lg:px-4 pb-3 lg:pb-4 overflow-x-auto">{children}</div>}
    </div>
  );
}

function EmptyData() {
  return <p className="text-gray-400 text-sm py-4 text-center">暂无数据</p>;
}
