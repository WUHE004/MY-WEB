"use client";

import { useEffect, useMemo, useState } from "react";
import { FileClock, RefreshCw } from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";

interface LogDetail {
  field: string;
  from: string;
  to: string;
}

interface OpLog {
  id: number;
  action: string;
  label: string;
  operator: string;
  target_table: string | null;
  target_id: string | null;
  target_label: string | null;
  detail: LogDetail[] | string | null;
  created_at: string;
}

// 北京时间 YYYY-MM-DD（sv-SE locale 输出即此格式）
const fmtDay = (d: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai" }).format(d);

// 北京时间 HH:MM（en-GB 稳定输出 24 小时制）
const fmtTime = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));

// 动作徽章配色：改价黄 / 清除·删除红 / 选品蓝 / 新增·导入绿 / 登录灰
const badgeStyle = (action: string): string => {
  if (action.includes("price")) return "bg-amber-100 text-amber-800 border-amber-300";
  if (action.includes("clear") || action.includes("unselect") || action.endsWith("_del")) return "bg-red-100 text-red-700 border-red-300";
  if (action.startsWith("live_")) return "bg-blue-100 text-blue-700 border-blue-300";
  if (action.endsWith("_add") || action.includes("import")) return "bg-green-100 text-green-700 border-green-300";
  return "bg-gray-100 text-gray-600 border-gray-300";
};

function DetailList({ detail }: { detail: LogDetail[] | string | null }) {
  if (!detail) return <span className="text-gray-300 font-bold">—</span>;
  if (typeof detail === "string") return <span className="text-sm font-bold text-gray-700">{detail}</span>;
  if (detail.length === 0) return <span className="text-gray-300 font-bold">—</span>;
  return (
    <div className="flex flex-col gap-1">
      {detail.map((d, i) => (
        <div key={i} className="inline-flex flex-wrap items-center gap-1 text-xs">
          <span className="font-extrabold text-gray-900">{d.field}</span>
          <span className="text-red-500 line-through decoration-red-300">{d.from}</span>
          <span className="text-gray-400">→</span>
          <span className="text-green-700 font-extrabold">{d.to}</span>
        </div>
      ))}
    </div>
  );
}

export function OperationLogPanel() {
  // 今天 ~ 6 天前（北京时间），index 0 = 今天
  const dates = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 7 }, (_, i) => fmtDay(new Date(now.getTime() - i * 24 * 60 * 60 * 1000)));
  }, []);
  const dayLabels = ["今天", "昨天", "2天前", "3天前", "4天前", "5天前", "6天前"];

  const [activeDate, setActiveDate] = useState(dates[0]);
  const [logs, setLogs] = useState<OpLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [operator, setOperator] = useState("全部");

  const load = async (date: string) => {
    setLoading(true);
    setError("");
    try {
      const res = await authFetch(`/api/operation-logs?date=${date}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "加载失败");
        setLogs([]);
      } else {
        setLogs(data.data || []);
      }
    } catch {
      setError("加载失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(activeDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDate]);

  const switchDate = (d: string) => {
    setActiveDate(d);
    setOperator("全部"); // 切换日期后重置人员筛选
  };

  // 当前日期有记录的人员（用于下拉选项）
  const operators = useMemo(
    () => Array.from(new Set(logs.map((l) => l.operator).filter(Boolean))),
    [logs]
  );
  const filtered = operator === "全部" ? logs : logs.filter((l) => l.operator === operator);

  return (
    <div className="border-[3px] border-gray-900 rounded-xl bg-white shadow-[3px_3px_0px_#000] overflow-hidden flex flex-col h-[calc(100vh-260px)] min-h-[500px]">
      {/* 标题栏（固定不滚动）：标题 + 共N条 + 日期 + 人员筛选 + 刷新 都在这一行 */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b-[3px] border-gray-900 bg-white flex-wrap flex-none">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-extrabold text-gray-900 flex items-center gap-2">
            <FileClock className="h-5 w-5" />
            操作日志
          </h2>
          <span className="text-xs font-bold text-gray-500">
            {loading ? "加载中…" : `共 ${filtered.length} 条`}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {dates.map((d, i) => (
            <button
              key={d}
              onClick={() => switchDate(d)}
              className={`shrink-0 px-3 py-1.5 text-sm font-extrabold rounded-lg border-[3px] transition-colors ${
                activeDate === d
                  ? "border-gray-900 bg-gray-900 text-white"
                  : "border-gray-200 bg-white text-gray-500 hover:border-gray-400"
              }`}
            >
              {dayLabels[i]}
            </button>
          ))}
          <select
            value={operator}
            onChange={(e) => setOperator(e.target.value)}
            className="px-3 py-1.5 text-sm font-extrabold rounded-lg border-[3px] border-gray-900 bg-white text-gray-900 hover:bg-gray-900 hover:text-white transition-colors cursor-pointer outline-none"
            title="按操作人筛选"
          >
            <option value="全部">全部人员</option>
            {operators.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
          <button
            onClick={() => load(activeDate)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-extrabold rounded-lg border-[3px] border-gray-900 bg-white hover:bg-gray-900 hover:text-white transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            刷新
          </button>
        </div>
      </div>

      {/* 内容（滚动区） */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 pt-2.5">
        {error && (
          <div className="p-3 rounded-lg bg-red-50 border-2 border-red-200 mb-4">
            <p className="text-sm font-bold text-red-600">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="py-16 text-center text-gray-400 font-bold">加载中…</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-gray-400 font-bold">
            {operator === "全部" ? `${activeDate} 暂无操作记录` : `${operator} 在 ${activeDate} 暂无操作记录`}
          </div>
        ) : (
          <>
            {/* 桌面表格 */}
            <div className="hidden sm:block">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-white">
                    <th className="py-2 px-2 font-extrabold whitespace-nowrap border-b-2 border-gray-900 bg-gray-900 text-white">时间</th>
                    <th className="py-2 px-2 font-extrabold whitespace-nowrap border-b-2 border-gray-900 bg-gray-900 text-white">操作人</th>
                    <th className="py-2 px-2 font-extrabold whitespace-nowrap border-b-2 border-gray-900 bg-gray-900 text-white">动作</th>
                    <th className="py-2 px-2 font-extrabold whitespace-nowrap border-b-2 border-gray-900 bg-gray-900 text-white">对象</th>
                    <th className="py-2 px-2 font-extrabold whitespace-nowrap border-b-2 border-gray-900 bg-gray-900 text-white">改动明细</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((log) => (
                    <tr key={log.id} className="border-b border-gray-100 hover:bg-gray-50 align-top">
                      <td className="py-2.5 px-2 whitespace-nowrap font-bold text-gray-700">{fmtTime(log.created_at)}</td>
                      <td className="py-2.5 px-2 whitespace-nowrap font-extrabold text-gray-900">{log.operator}</td>
                      <td className="py-2.5 px-2">
                        <span className={`inline-block px-2 py-0.5 rounded-md border-2 text-xs font-extrabold whitespace-nowrap ${badgeStyle(log.action)}`}>
                          {log.label}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 max-w-[220px] truncate font-bold text-gray-700" title={log.target_label || log.target_id || ""}>
                        {log.target_label || log.target_id || "—"}
                      </td>
                      <td className="py-2.5 px-2">
                        <DetailList detail={log.detail} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 手机卡片 */}
            <div className="sm:hidden flex flex-col gap-3">
              {filtered.map((log) => (
                <div key={log.id} className="border-2 border-gray-200 rounded-lg p-3">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="font-extrabold text-gray-900">{log.operator}</span>
                    <span className="text-xs font-bold text-gray-400">{fmtTime(log.created_at)}</span>
                  </div>
                  <div className="mb-1.5">
                    <span className={`inline-block px-2 py-0.5 rounded-md border-2 text-xs font-extrabold ${badgeStyle(log.action)}`}>
                      {log.label}
                    </span>
                  </div>
                  {(log.target_label || log.target_id) && (
                    <p className="text-sm font-bold text-gray-700 mb-1 break-all">对象：{log.target_label || log.target_id}</p>
                  )}
                  <DetailList detail={log.detail} />
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
