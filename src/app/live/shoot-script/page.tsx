"use client";

import { useState } from "react";
import { ArrowLeft, Sparkles, Lightbulb, Copy, Check, Loader2 } from "lucide-react";
import Link from "next/link";
import { PageWrapper } from "@/components/page-wrapper";
import { authFetch } from "@/lib/auth-fetch";

// 轻量 Markdown 渲染：处理 #/##/### 标题、- 列表、**加粗**、换行
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
    // 处理 **加粗**
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((p, i) => {
      if (p.startsWith("**") && p.endsWith("**")) {
        return <strong key={i} className="font-bold text-gray-900">{p.slice(2, -2)}</strong>;
      }
      return <span key={i}>{p}</span>;
    });
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      flushList();
      continue;
    }

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
    } else if (/^\d+\.\s/.test(trimmed)) {
      flushList();
      out.push(<p key={i} className="text-sm lg:text-base text-gray-700 my-1 pl-2">{renderInline(trimmed)}</p>);
    } else {
      flushList();
      out.push(<p key={i} className="text-sm lg:text-base text-gray-700 my-1">{renderInline(trimmed)}</p>);
    }
  }
  flushList();
  return out;
}

export default function ShootScriptPage() {
  const [idea, setIdea] = useState("");
  const [script, setScript] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const generate = async (ideaText: string) => {
    setLoading(true);
    setError("");
    setScript("");
    try {
      const res = await authFetch("/api/live/shoot-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea: ideaText }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || "生成失败");
      } else {
        setScript(data.script || "");
      }
    } catch (err) {
      console.error(err);
      setError("网络异常，请重试");
    } finally {
      setLoading(false);
    }
  };

  const copyAll = async () => {
    if (!script) return;
    try {
      await navigator.clipboard.writeText(script);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("复制失败，请手动选择文本复制");
    }
  };

  return (
    <PageWrapper>
      {/* 返回入口 + 标题 */}
      <div className="mb-6">
        <Link href="/live/operations" className="inline-flex items-center gap-2 text-sm lg:text-base text-gray-600 hover:text-gray-900 mb-3 font-medium">
          <ArrowLeft className="h-4 w-4" /> 返回直播运营操作台
        </Link>
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-gray-900 mb-2">
          <span className="highlight-yellow">拍摄脚本生成</span>
        </h1>
        <p className="text-sm lg:text-lg text-gray-600 font-medium">
          输入今日拍摄想法，AI 生成完整分镜脚本；无想法时一键获取 3 个参考方案
        </p>
      </div>

      {/* 输入区 */}
      <div className="neo-card p-4 lg:p-6 mb-6 bg-white">
        <label className="block text-sm font-bold text-gray-700 mb-2">今日拍摄想法（可选）</label>
        <textarea
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          placeholder="例如：今天想拍 3 套夏季连衣裙，户外公园场景，模特 6 岁女孩..."
          rows={4}
          className="w-full p-3 border-2 border-gray-300 rounded-lg focus:border-gray-900 focus:outline-none text-sm lg:text-base resize-y"
          disabled={loading}
        />
        <div className="flex flex-col sm:flex-row gap-3 mt-4">
          <button
            onClick={() => generate(idea)}
            disabled={loading}
            className="flex-1 inline-flex items-center justify-center gap-2 bg-[#FFC93C] text-gray-900 font-extrabold py-2.5 px-4 rounded-lg border-2 border-gray-900 hover:-translate-y-0.5 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ boxShadow: "4px 4px 0px 0px rgba(0,0,0,1)" }}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {loading ? "生成中..." : "生成拍摄脚本"}
          </button>
          <button
            onClick={() => generate("")}
            disabled={loading}
            className="flex-1 inline-flex items-center justify-center gap-2 bg-white text-gray-900 font-extrabold py-2.5 px-4 rounded-lg border-2 border-gray-900 hover:-translate-y-0.5 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ boxShadow: "4px 4px 0px 0px rgba(0,0,0,1)" }}
          >
            <Lightbulb className="h-4 w-4" />
            我没想法，给我参考
          </button>
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="neo-card p-4 mb-6 bg-red-50 border-red-500">
          <p className="text-sm font-bold text-red-700">{error}</p>
        </div>
      )}

      {/* 结果区 */}
      {script && (
        <div className="neo-card p-4 lg:p-6 bg-white">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg lg:text-xl font-extrabold text-gray-900">拍摄脚本</h2>
            <button
              onClick={copyAll}
              className="inline-flex items-center gap-1.5 bg-[#4CD964] text-white text-sm font-bold py-1.5 px-3 rounded-lg border-2 border-gray-900 hover:-translate-y-0.5 transition-all"
              style={{ boxShadow: "4px 4px 0px 0px rgba(0,0,0,1)" }}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "已复制" : "复制全部"}
            </button>
          </div>
          <div className="prose prose-sm max-w-none">
            {renderMarkdown(script)}
          </div>
        </div>
      )}

      {/* 空状态 */}
      {!script && !loading && !error && (
        <div className="neo-card p-8 lg:p-12 bg-white text-center">
          <Sparkles className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">输入拍摄想法后点击"生成拍摄脚本"，或点击"给我参考"获取灵感</p>
        </div>
      )}
    </PageWrapper>
  );
}
