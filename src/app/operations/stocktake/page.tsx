"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  ArrowLeft,
  ClipboardCheck,
  Loader2,
  ChevronDown,
  ChevronUp,
  Play,
  CheckCircle2,
  Trash2,
  AlertTriangle,
  Package,
  History,
} from "lucide-react";
import Link from "next/link";
import { PageWrapper, showToast } from "@/components/page-wrapper";
import { authFetch } from "@/lib/auth-fetch";

interface StocktakeItem {
  id: number;
  stocktake_id: number;
  sale_id: string;
  shelf_no: string;
  name: string;
  photo: string;
  size: number;
  expected_qty: number;
  counted_qty: number | null;
}

interface Stocktake {
  id: number;
  status: "in_progress" | "completed";
  created_by: string;
  note: string;
  total_items: number;
  counted_items: number;
  gain_total: number;
  loss_total: number;
  created_at: string;
  completed_at: string | null;
}

// 货架号 → 分组键（"A-1-2" → "A-1"；空 → 未分区）
function shelfGroup(shelfNo: string): string {
  const s = (shelfNo || "").trim();
  if (!s) return "未分区";
  const parts = s.split("-");
  if (parts.length >= 2) return `${parts[0]}-${parts[1]}`;
  return s;
}

// 分组排序键（字母升序 + 数字升序，未分区排最后）
function shelfGroupSortKey(g: string): [string, number] {
  if (g === "未分区") return ["￿￿￿", 999999];
  const m = g.match(/^([A-Za-z]+)-(\d+)$/);
  if (m) return [m[1].toUpperCase(), Number(m[2])];
  return [g.toUpperCase(), 0];
}

function fmtTime(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("zh-CN", {
      timeZone: "Asia/Shanghai",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function StocktakePage() {
  const [loading, setLoading] = useState(true);
  const [stocktake, setStocktake] = useState<Stocktake | null>(null);
  const [items, setItems] = useState<StocktakeItem[]>([]);
  const [lastCompleted, setLastCompleted] = useState<Stocktake | null>(null);
  const [history, setHistory] = useState<Stocktake[]>([]);
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [completing, setCompleting] = useState(false);

  const readOnly = stocktake?.status === "completed";

  const load = useCallback(async (viewId?: number) => {
    setLoading(true);
    try {
      const url = viewId ? `/api/stocktake?id=${viewId}` : "/api/stocktake";
      const res = await authFetch(url);
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "加载失败", "error");
        return;
      }
      if (viewId) {
        setStocktake(data.stocktake);
        setItems(data.items || []);
      } else if (data.stocktake) {
        setStocktake(data.stocktake);
        setItems(data.items || []);
        setLastCompleted(null);
        // 默认展开第一组
        const groups = groupItems(data.items || []);
        if (groups.length > 0) setExpanded(new Set([groups[0].key]));
      } else {
        setStocktake(null);
        setItems([]);
        setLastCompleted(data.lastCompleted || null);
      }
      // 历史列表
      const hres = await authFetch("/api/stocktake?history=1");
      if (hres.ok) {
        const hdata = await hres.json();
        setHistory(Array.isArray(hdata) ? hdata : []);
      }
    } catch {
      showToast("网络错误", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // 按货架分组
  function groupItems(list: StocktakeItem[]) {
    const map = new Map<string, StocktakeItem[]>();
    for (const it of list) {
      const g = shelfGroup(it.shelf_no);
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(it);
    }
    const groups = Array.from(map.entries()).map(([key, list]) => ({
      key,
      items: list.sort((a, b) => a.sale_id.localeCompare(b.sale_id)),
    }));
    groups.sort((a, b) => {
      const [ap, an] = shelfGroupSortKey(a.key);
      const [bp, bn] = shelfGroupSortKey(b.key);
      return ap === bp ? an - bn : ap < bp ? -1 : 1;
    });
    return groups;
  }

  const groups = useMemo(() => groupItems(items), [items]);

  // 进度：按款计（该款所有尺码行都已填实点数）
  const progress = useMemo(() => {
    const bySid = new Map<string, { total: number; counted: number }>();
    for (const it of items) {
      const cur = bySid.get(it.sale_id) || { total: 0, counted: 0 };
      cur.total++;
      if (it.counted_qty !== null) cur.counted++;
      bySid.set(it.sale_id, cur);
    }
    let done = 0;
    for (const v of bySid.values()) if (v.counted === v.total) done++;
    return { done, total: bySid.size };
  }, [items]);

  // 差异汇总（进行中实时 / 完成后读单据字段）
  const diffSummary = useMemo(() => {
    let gain = 0;
    let loss = 0;
    let countedRows = 0;
    const bigDiffs: StocktakeItem[] = [];
    for (const it of items) {
      if (it.counted_qty === null) continue;
      countedRows++;
      const d = it.counted_qty - it.expected_qty;
      if (d > 0) gain += d;
      else if (d < 0) loss += -d;
      if (Math.abs(d) >= 10) bigDiffs.push(it);
    }
    return { gain, loss, countedRows, bigDiffs: bigDiffs.slice(0, 10) };
  }, [items]);

  const startStocktake = async () => {
    if (creating) return;
    if (!confirm("确定开始新盘点吗？\n将快照当前全量库存，按货架分区清点。")) return;
    setCreating(true);
    try {
      const name = localStorage.getItem("member_name") || "";
      const res = await authFetch("/api/stocktake", {
        method: "POST",
        body: JSON.stringify({ created_by: name }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "创建失败", "error");
        return;
      }
      showToast(`盘点单 #${data.stocktake_id} 已创建，共 ${data.total_items} 条尺码明细`, "success");
      await load();
    } catch {
      showToast("网络错误", "error");
    } finally {
      setCreating(false);
    }
  };

  const saveCount = async (item: StocktakeItem, raw: string) => {
    const v = raw.trim() === "" ? null : Math.max(0, Math.floor(Number(raw)));
    if (v !== null && Number.isNaN(v)) return;
    // 本地立即更新
    setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, counted_qty: v } : it)));
    try {
      const res = await authFetch("/api/stocktake", {
        method: "PUT",
        body: JSON.stringify({ item_id: item.id, counted_qty: v }),
      });
      if (!res.ok) {
        const data = await res.json();
        showToast(data.error || "保存失败", "error");
      }
    } catch {
      showToast("网络错误", "error");
    }
  };

  const completeStocktake = async () => {
    if (!stocktake || completing) return;
    setCompleting(true);
    try {
      const res = await authFetch("/api/stocktake", {
        method: "PATCH",
        body: JSON.stringify({ stocktake_id: stocktake.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "完成失败", "error");
        return;
      }
      setShowCompleteModal(false);
      showToast(`盘点完成：已点 ${data.counted_items}/${data.total_items} 行，盘盈 +${data.gain_total}，盘亏 -${data.loss_total}`, "success");
      await load();
    } catch {
      showToast("网络错误", "error");
    } finally {
      setCompleting(false);
    }
  };

  const deleteStocktake = async () => {
    if (!stocktake) return;
    try {
      const res = await authFetch(`/api/stocktake?id=${stocktake.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "作废失败", "error");
        return;
      }
      setShowDeleteModal(false);
      showToast("已作废盘点单", "success");
      await load();
    } catch {
      showToast("网络错误", "error");
    }
  };

  const toggleGroup = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // ---------- 渲染 ----------

  if (loading) {
    return (
      <PageWrapper>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
        </div>
      </PageWrapper>
    );
  }

  // 首页：无进行中盘点
  if (!stocktake) {
    return (
      <PageWrapper>
        <div className="flex items-center gap-3 mb-4">
          <Link href="/links" className="neo-btn bg-white p-2" aria-label="返回">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-xl lg:text-2xl font-extrabold text-gray-900">库存盘点</h1>
        </div>

        {/* 上次盘点 */}
        {lastCompleted ? (
          <div className="mb-4 rounded-2xl border-2 border-gray-900 bg-white p-4 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
            <p className="text-xs font-bold text-gray-500 mb-2">上次盘点</p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-bold text-gray-900">
              <span>#{lastCompleted.id}</span>
              <span>{fmtTime(lastCompleted.completed_at || lastCompleted.created_at)}</span>
              {lastCompleted.created_by && <span className="text-gray-500">{lastCompleted.created_by}</span>}
            </div>
            <div className="mt-2 flex gap-3 text-sm font-extrabold">
              <span className="text-[#4CD964]">盘盈 +{lastCompleted.gain_total}</span>
              <span className="text-[#FF6B7A]">盘亏 -{lastCompleted.loss_total}</span>
              <span className="text-gray-500">已点 {lastCompleted.counted_items}/{lastCompleted.total_items} 行</span>
            </div>
          </div>
        ) : (
          <div className="mb-4 rounded-2xl border-2 border-gray-900 bg-gray-50 p-4 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
            <p className="text-sm font-bold text-gray-500">还没有盘点记录，从第一次盘点开始吧</p>
          </div>
        )}

        {/* 开始新盘点 */}
        <button
          onClick={startStocktake}
          disabled={creating}
          className="mb-6 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-gray-900 bg-[#4CD964] px-4 py-4 text-base font-extrabold text-gray-900 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:opacity-50"
        >
          {creating ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5" />}
          {creating ? "正在快照库存..." : "开始新盘点"}
        </button>

        {/* 历史列表 */}
        <div className="mb-2 flex items-center gap-2">
          <History className="h-4 w-4 text-gray-500" />
          <h2 className="text-sm font-extrabold text-gray-700">历史盘点</h2>
        </div>
        {history.length === 0 ? (
          <p className="text-sm text-gray-400 font-medium py-4">暂无记录</p>
        ) : (
          <div className="space-y-2">
            {history.map((h) => (
              <button
                key={h.id}
                onClick={() => load(h.id)}
                className="flex w-full items-center justify-between rounded-2xl border-2 border-gray-900 bg-white px-4 py-3 text-left shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
              >
                <div>
                  <p className="text-sm font-extrabold text-gray-900">
                    #{h.id} · {fmtTime(h.completed_at || h.created_at)}
                    {h.created_by ? <span className="text-gray-400 font-bold"> · {h.created_by}</span> : null}
                  </p>
                  <p className="text-xs font-bold text-gray-500 mt-0.5">
                    已点 {h.counted_items}/{h.total_items} 行
                  </p>
                </div>
                <div className="flex flex-col items-end gap-0.5">
                  <span className="text-xs font-extrabold text-[#4CD964]">+{h.gain_total}</span>
                  <span className="text-xs font-extrabold text-[#FF6B7A]">-{h.loss_total}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </PageWrapper>
    );
  }

  // 盘点工作台（进行中 / 查看历史）
  return (
    <PageWrapper>
      {/* 顶部 */}
      <div className="mb-3 flex items-center gap-3">
        <Link
          href={readOnly ? "/operations/stocktake" : "/links"}
          className="neo-btn bg-white p-2"
          aria-label="返回"
          onClick={(e) => {
            if (readOnly) {
              e.preventDefault();
              load();
            }
          }}
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg lg:text-2xl font-extrabold text-gray-900 truncate">
            盘点 #{stocktake.id}
            {readOnly ? (
              <span className="ml-2 rounded-lg border-2 border-gray-900 bg-gray-200 px-2 py-0.5 text-xs font-extrabold text-gray-700">已完成</span>
            ) : (
              <span className="ml-2 rounded-lg border-2 border-gray-900 bg-[#FFC93C] px-2 py-0.5 text-xs font-extrabold text-gray-900">进行中</span>
            )}
          </h1>
          <p className="text-xs font-bold text-gray-500">
            {fmtTime(stocktake.created_at)}
            {stocktake.created_by ? ` · ${stocktake.created_by}` : ""}
            {readOnly && stocktake.completed_at ? ` · 完成 ${fmtTime(stocktake.completed_at)}` : ""}
          </p>
        </div>
      </div>

      {/* 进度条（sticky） */}
      <div className="sticky top-0 z-30 -mx-4 mb-3 bg-white px-4 py-2 border-b-2 border-gray-900">
        <div className="flex items-center gap-3">
          <div className="h-3 flex-1 overflow-hidden rounded-full border-2 border-gray-900 bg-gray-100">
            <div
              className="h-full bg-[#4CD964] transition-all"
              style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
            />
          </div>
          <span className="whitespace-nowrap text-xs font-extrabold text-gray-900">
            已点 {progress.done}/{progress.total} 款
          </span>
        </div>
        {!readOnly && (
          <div className="mt-1 flex gap-3 text-[11px] font-extrabold">
            <span className="text-[#4CD964]">盘盈 +{diffSummary.gain}</span>
            <span className="text-[#FF6B7A]">盘亏 -{diffSummary.loss}</span>
            <span className="text-gray-400">已填 {diffSummary.countedRows}/{items.length} 行</span>
          </div>
        )}
        {readOnly && (
          <div className="mt-1 flex gap-3 text-[11px] font-extrabold">
            <span className="text-[#4CD964]">盘盈 +{stocktake.gain_total}</span>
            <span className="text-[#FF6B7A]">盘亏 -{stocktake.loss_total}</span>
            <span className="text-gray-400">已点 {stocktake.counted_items}/{stocktake.total_items} 行</span>
          </div>
        )}
      </div>

      {/* 货架分组 */}
      <div className="space-y-3 pb-24">
        {groups.map((g) => {
          const gDone = g.items.filter((it) => it.counted_qty !== null).length;
          const open = expanded.has(g.key);
          return (
            <div key={g.key} className="rounded-2xl border-2 border-gray-900 bg-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] overflow-hidden">
              <button
                onClick={() => toggleGroup(g.key)}
                className="flex w-full items-center justify-between bg-[#9B59B6] px-4 py-3 text-white"
              >
                <span className="flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  <span className="text-base font-extrabold">货架 {g.key}</span>
                  <span className="rounded-lg bg-white/90 px-1.5 py-0.5 text-xs font-extrabold text-gray-900">
                    {gDone}/{g.items.length} 行
                  </span>
                </span>
                {open ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
              </button>
              {open && (
                <div className="divide-y-2 divide-gray-100">
                  {g.items.map((it) => (
                    <div key={it.id} className="flex gap-3 p-3">
                      {/* 图片 */}
                      <div className="w-20 shrink-0">
                        {it.photo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={it.photo}
                            alt={it.name}
                            className="aspect-[4/5] w-full rounded-lg border-2 border-gray-900 object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex aspect-[4/5] w-full items-center justify-center rounded-lg border-2 border-gray-300 bg-gray-100">
                            <Package className="h-6 w-6 text-gray-300" />
                          </div>
                        )}
                      </div>
                      {/* 编号 + 名称 + 尺码输入 */}
                      <div className="min-w-0 flex-1">
                        <p className="text-base font-extrabold text-gray-900 truncate">{it.sale_id}</p>
                        <p className="mb-2 text-xs font-bold text-gray-500 truncate">{it.name || "未命名"}</p>
                        <SizeInput it={it} readOnly={readOnly} onSave={saveCount} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {groups.length === 0 && (
          <p className="py-8 text-center text-sm font-bold text-gray-400">无明细数据</p>
        )}
      </div>

      {/* 底部操作栏（仅进行中） */}
      {!readOnly && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t-2 border-gray-900 bg-white px-4 py-3">
          <div className="mx-auto flex max-w-[1600px] gap-3">
            <button
              onClick={() => setShowDeleteModal(true)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl border-2 border-gray-900 bg-white px-4 py-3 text-sm font-extrabold text-gray-700 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            >
              <Trash2 className="h-4 w-4" />
              作废
            </button>
            <button
              onClick={() => setShowCompleteModal(true)}
              className="flex flex-[2] items-center justify-center gap-1.5 rounded-2xl border-2 border-gray-900 bg-[#4CD964] px-4 py-3 text-sm font-extrabold text-gray-900 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            >
              <CheckCircle2 className="h-4 w-4" />
              完成盘点（{progress.done}/{progress.total} 款）
            </button>
          </div>
        </div>
      )}

      {/* 完成确认弹窗 */}
      {showCompleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowCompleteModal(false)}>
          <div
            className="w-full max-w-md rounded-2xl border-2 border-gray-900 bg-white p-5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-3 flex items-center gap-2 text-lg font-extrabold text-gray-900">
              <ClipboardCheck className="h-5 w-5" />
              确认完成盘点？
            </h3>
            <div className="mb-3 space-y-1 rounded-xl bg-gray-50 p-3 text-sm font-bold text-gray-700">
              <p>已清点 <span className="font-extrabold text-gray-900">{diffSummary.countedRows}</span> / {items.length} 行尺码明细</p>
              <p className="text-[#4CD964]">盘盈合计 +{diffSummary.gain} 件</p>
              <p className="text-[#FF6B7A]">盘亏合计 -{diffSummary.loss} 件</p>
            </div>
            {diffSummary.bigDiffs.length > 0 && (
              <div className="mb-3 rounded-xl border-2 border-[#FF6B7A] bg-[#FFF0F2] p-3">
                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-extrabold text-[#FF6B7A]">
                  <AlertTriangle className="h-4 w-4" />
                  大差异提醒（差异 ≥ 10 件，请复核）
                </p>
                {diffSummary.bigDiffs.map((d) => (
                  <p key={d.id} className="text-xs font-bold text-gray-700">
                    {d.sale_id} · {d.size}码：系统 {d.expected_qty} → 实点 {d.counted_qty}
                  </p>
                ))}
              </div>
            )}
            {progress.done < progress.total && (
              <p className="mb-3 text-xs font-bold text-gray-500">
                还有 {progress.total - progress.done} 款未清点完成，完成后未清点的尺码将不参与差异统计。
              </p>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setShowCompleteModal(false)}
                className="flex-1 rounded-xl border-2 border-gray-900 bg-white px-4 py-2.5 text-sm font-extrabold text-gray-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
              >
                再点点
              </button>
              <button
                onClick={completeStocktake}
                disabled={completing}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border-2 border-gray-900 bg-[#4CD964] px-4 py-2.5 text-sm font-extrabold text-gray-900 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:opacity-50"
              >
                {completing && <Loader2 className="h-4 w-4 animate-spin" />}
                确认完成
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 作废确认弹窗 */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowDeleteModal(false)}>
          <div
            className="w-full max-w-sm rounded-2xl border-2 border-gray-900 bg-white p-5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-2 flex items-center gap-2 text-lg font-extrabold text-gray-900">
              <Trash2 className="h-5 w-5 text-[#FF6B7A]" />
              作废盘点单 #{stocktake.id}？
            </h3>
            <p className="mb-4 text-sm font-bold text-gray-500">
              已清点的 {diffSummary.countedRows} 行数据将全部丢弃，此操作不可恢复。
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 rounded-xl border-2 border-gray-900 bg-white px-4 py-2.5 text-sm font-extrabold text-gray-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
              >
                取消
              </button>
              <button
                onClick={deleteStocktake}
                className="flex-1 rounded-xl border-2 border-gray-900 bg-[#FF6B7A] px-4 py-2.5 text-sm font-extrabold text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
              >
                确认作废
              </button>
            </div>
          </div>
        </div>
      )}
    </PageWrapper>
  );
}

// 单行尺码输入（系统数量 + 实点输入框，差异着色）
function SizeInput({
  it,
  readOnly,
  onSave,
}: {
  it: StocktakeItem;
  readOnly: boolean;
  onSave: (item: StocktakeItem, raw: string) => void;
}) {
  const [val, setVal] = useState(it.counted_qty === null ? "" : String(it.counted_qty));

  // 外部数据刷新时同步
  useEffect(() => {
    setVal(it.counted_qty === null ? "" : String(it.counted_qty));
  }, [it.counted_qty]);

  const diff = it.counted_qty === null ? null : it.counted_qty - it.expected_qty;
  const diffColor = diff === null || diff === 0 ? "" : diff > 0 ? "text-[#4CD964]" : "text-[#FF6B7A]";

  return (
    <div className="flex items-center gap-2">
      {/* 系统数量（黄色块） */}
      <span className="flex shrink-0 items-center gap-1 rounded-lg border-2 border-gray-900 bg-[#FFC93C] px-2 py-1.5">
        <span className="text-xs font-extrabold text-gray-900">{it.size}码</span>
        <span className="text-xs font-extrabold text-gray-900">系统{it.expected_qty}</span>
      </span>
      {/* 实点输入框 */}
      <div className="relative w-24">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          disabled={readOnly}
          value={readOnly ? (it.counted_qty ?? "—") : val}
          onChange={(e) => setVal(e.target.value)}
          onBlur={(e) => !readOnly && onSave(it, e.target.value)}
          placeholder="实点"
          className="w-full rounded-lg border-2 border-gray-900 bg-white px-2 py-1.5 text-center text-base font-extrabold text-gray-900 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] outline-none focus:bg-[#FFF9E0] disabled:shadow-none disabled:bg-gray-50"
        />
      </div>
      {/* 差异 */}
      {diff !== null && diff !== 0 && (
        <span className={`text-xs font-extrabold ${diffColor}`}>
          {diff > 0 ? `+${diff}` : diff}
        </span>
      )}
    </div>
  );
}
