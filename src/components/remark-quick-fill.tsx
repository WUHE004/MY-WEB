"use client";

// 备注快捷填入共享组件(与入库登记同款): 尺码表 + 裤长/身高批量填入悬浮窗
// 消费方: 操作栏-备注调整(adjust), 打包找货-尺码备注(pack); 入库登记(inbound)保留自己的同款实现
import { useState } from "react";
import { motion } from "framer-motion";
import { X, Plus, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export const SIZE_OPTIONS = [80, 90, 95, 100, 105, 110, 120, 130, 140, 150, 160, 170, 180];

// 过滤掉系统「补录入库 xxx」标记行, 剩余内容才是用户真实备注(补录自动写入的标记不算已备注)
// 保存备注时需反向保留该标记: 财务补录视图/补录快照依赖 notes 以「补录入库」开头识别补录记录
export function userNotesOnly(notes: string | null | undefined): string {
  if (!notes) return "";
  return String(notes)
    .split("\n")
    .filter((l) => !l.trim().startsWith("补录入库"))
    .join("\n")
    .trim();
}

// 备注快捷行的字母递进(衣服尺码梯子): S→M→L→XL→XXL→3XL→4XL→5XL, 纯数字则 +2(裤长/尺码默认单数递增), 其余保持不变
const REMARK_LETTER_LADDER = ["S", "M", "L", "XL", "XXL", "3XL", "4XL", "5XL", "6XL", "7XL", "8XL"];
const nextRemarkTag = (v: string): string => {
  if (!v) return "";
  if (/^\d+$/.test(v)) return String(Number(v) + 2);
  const i = REMARK_LETTER_LADDER.indexOf(v.toUpperCase());
  if (i >= 0 && i < REMARK_LETTER_LADDER.length - 1) return REMARK_LETTER_LADDER[i + 1];
  return v;
};

// 备注快捷行的尺码递进: 取尺码表中的下一个尺码(如 100→105), 到头保持不变
const nextRemarkSize = (v: string): string => {
  const i = SIZE_OPTIONS.findIndex((s) => String(s) === v);
  if (i < 0) return v || "";
  return String(SIZE_OPTIONS[Math.min(i + 1, SIZE_OPTIONS.length - 1)]);
};

interface RemarkRow { a: string; b: string; c: string; d: string; }

// 备注快捷填入悬浮窗: 每行 = [填空]+固定文字+[填空](+裤长填空), 行尾加号递增新增一行, 底部"选好了"把各行回传给父组件填入备注
// mode: height = 填空建议身高填空(两格纯数字, 加号新行两格各+10)
//       pants  = 填空对应尺码填空裤长填空建议身高填空(前格数字+大写字母自动转大写, 加号数字+2/字母走 S→M→L 梯子;
//                中格仅限尺码表, 自选尺码与已有行冲突时标红抖动, 冲突未解决时禁止确认;
//                尾两格为裤长/建议身高, 纯数字, 加号新行裤长+1/身高+10, 留空则备注不含对应后缀)
// initialSizes: 裤长模式父组件传入已入库尺码(升序), 打开时自动生成对应行数并预选好尺码
// 由父组件条件挂载(仅打开时渲染), 状态随挂载天然重置
export function RemarkRowsDialog({ title, rowLabel, mode, initialSizes, onClose, onConfirm }: {
  title: string;
  rowLabel: string;
  mode: "height" | "pants";
  initialSizes?: string[];
  onClose: () => void;
  onConfirm: (lines: string[]) => void;
}) {
  const [rows, setRows] = useState<RemarkRow[]>(() =>
    mode === "pants" && initialSizes && initialSizes.length > 0
      ? initialSizes.map((s) => ({ a: "", b: s, c: "", d: "" }))
      : [{ a: "", b: "", c: "", d: "" }]
  );
  // 裤长模式: 尺码冲突抖动信号(变化触发重新播放动画)
  const [shakeTick, setShakeTick] = useState(0);

  const setRow = (i: number, patch: Partial<RemarkRow>) => {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };

  // 裤长模式: 修改某行左格(裤长标记)后, 其下各行按梯子自动递增(S→M→L…, 纯数字+2)
  const setATagCascade = (i: number, v: string) => {
    setRows((prev) =>
      prev.map((r, idx) => {
        if (idx < i) return r;
        if (idx === i) return { ...r, a: v };
        let cur = v;
        for (let k = 0; k < idx - i; k++) cur = nextRemarkTag(cur);
        return { ...r, a: cur };
      })
    );
  };

  // 裤长模式: 某行的尺码是否与其他行重复(非空才判定)
  const sizeConflicts = (i: number): boolean => {
    const v = rows[i]?.b;
    if (!v) return false;
    return rows.some((r, idx) => idx !== i && r.b === v);
  };

  const addRowAfter = (i: number) => {
    setRows((prev) => {
      const cur = prev[i];
      let next: RemarkRow;
      if (mode === "height") {
        const inc = (v: string) => (/^\d+$/.test(v) ? String(Number(v) + 10) : v);
        next = { a: cur.a ? inc(cur.a) : "", b: cur.b ? inc(cur.b) : "", c: "", d: "" };
      } else {
        const inc10 = (v: string) => (/^\d+$/.test(v) ? String(Number(v) + 10) : v);
        next = { a: nextRemarkTag(cur.a), b: nextRemarkSize(cur.b), c: /^\d+$/.test(cur.c) ? String(Number(cur.c) + 1) : "", d: cur.d ? inc10(cur.d) : "" };
      }
      const copy = [...prev];
      copy.splice(i + 1, 0, next);
      return copy;
    });
  };

  const confirm = () => {
    if (mode === "pants" && rows.some((_, i) => sizeConflicts(i))) {
      setShakeTick((t) => t + 1); // 冲突未解决: 抖动提示并阻止确认
      return;
    }
    const lines = rows
      .filter((r) => r.a.trim() || r.b.trim())
      .map((r) => {
        const tag = r.a.trim();
        const size = r.b.trim();
        const pants = mode === "pants" ? r.c.trim() : "";
        const height = mode === "pants" ? r.d.trim() : "";
        // 裤长模式: 左格(字母标记)留空时不输出"对应尺码"标签, 生成"90裤长30"(卡片显示为 90:裤长30)
        // 建议身高: 填了就追加"建议身高110"后缀(卡片显示为 :建议110)
        if (mode === "pants" && !tag) {
          let s = size;
          if (pants) s += `裤长${pants}`;
          if (height) s += `建议身高${height}`;
          return s;
        }
        let s = `${tag}${rowLabel}${size}`;
        if (pants) s += `裤长${pants}`;
        if (height) s += `建议身高${height}`;
        return s;
      });
    if (lines.length === 0) { onClose(); return; }
    onConfirm(lines);
    onClose();
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/50 px-4" style={{ zIndex: 90 }}>
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="w-full max-w-md bg-white rounded-2xl border-[3px] border-gray-900 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] p-4"
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-extrabold text-gray-900">{title}</h3>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg border-2 border-gray-900 text-gray-600 hover:bg-gray-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-2 max-h-[50vh] overflow-y-auto">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input
                value={r.a}
                inputMode={mode === "height" ? "numeric" : "text"}
                onChange={(e) => {
                  const v = mode === "height" ? e.target.value.replace(/\D/g, "") : e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, "");
                  // 裤长模式: 填入后下方各行自动递增; 身高模式保持单行修改
                  if (mode === "pants") setATagCascade(i, v);
                  else setRow(i, { a: v });
                }}
                placeholder={mode === "height" ? "100" : "S"}
                className="w-16 h-10 shrink-0 text-center text-sm font-extrabold text-gray-900 border-2 border-gray-900 rounded-lg outline-none focus:border-[#4A90E2] bg-white"
              />
              <span className="text-xs font-bold text-gray-500 shrink-0">{rowLabel}</span>
              {mode === "height" ? (
                <input
                  value={r.b}
                  inputMode="numeric"
                  onChange={(e) => setRow(i, { b: e.target.value.replace(/\D/g, "") })}
                  placeholder="90"
                  className="w-16 h-10 shrink-0 text-center text-sm font-extrabold text-gray-900 border-2 border-gray-900 rounded-lg outline-none focus:border-[#4A90E2] bg-white"
                />
              ) : (
                <select
                  key={`${i}-${shakeTick}`}
                  value={r.b}
                  onChange={(e) => {
                    setRow(i, { b: e.target.value });
                    // 自选尺码与其他行冲突: 抖动提示(标红由下方冲突判定渲染)
                    const conflict = rows.some((rr, idx) => idx !== i && rr.b === e.target.value && e.target.value);
                    if (conflict) setShakeTick((t) => t + 1);
                  }}
                  className={`h-10 w-20 shrink-0 text-sm font-extrabold rounded-lg outline-none bg-white px-1 border-2 transition-colors ${
                    mode === "pants" && sizeConflicts(i)
                      ? "border-red-500 text-red-600 bg-red-50 animate-shake-x"
                      : "border-gray-900 text-gray-900 focus:border-[#4A90E2]"
                  } ${r.b ? "" : "text-gray-400"}`}
                >
                  <option value="">选尺码</option>
                  {SIZE_OPTIONS.map((s) => (
                    <option key={s} value={String(s)}>{s}</option>
                  ))}
                </select>
              )}
              {/* 裤长模式: 尺码下拉框后的裤长填空 + 建议身高填空, 备注行生成"S对应尺码90裤长80建议身高110" */}
              {mode === "pants" && (
                <>
                  <input
                    value={r.c}
                    inputMode="numeric"
                    onChange={(e) => setRow(i, { c: e.target.value.replace(/\D/g, "") })}
                    placeholder="裤长"
                    className="w-14 h-10 shrink-0 text-center text-sm font-extrabold text-gray-900 border-2 border-gray-900 rounded-lg outline-none focus:border-[#4A90E2] bg-white placeholder:text-gray-400 placeholder:font-bold"
                  />
                  <input
                    value={r.d}
                    inputMode="numeric"
                    onChange={(e) => setRow(i, { d: e.target.value.replace(/\D/g, "") })}
                    placeholder="建议110"
                    className="flex-1 min-w-0 h-10 text-center text-sm font-extrabold text-gray-900 border-2 border-gray-900 rounded-lg outline-none focus:border-[#4A90E2] bg-white placeholder:text-gray-400 placeholder:font-bold"
                  />
                </>
              )}
              <button
                onClick={() => addRowAfter(i)}
                className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-2 border-gray-900 bg-[#4CD964] text-white active:scale-90 transition-transform"
                title="在下方新增一行(自动递增)"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>

        {/* 裤长模式: 尺码冲突提示 */}
        {mode === "pants" && rows.some((_, i) => sizeConflicts(i)) && (
          <p className="mt-2 text-xs font-bold text-red-500 flex items-center gap-1">
            <AlertTriangle className="h-3.5 w-3.5" /> 尺码与已有行冲突，请修改后再提交
          </p>
        )}

        <Button variant="primary" className="w-full mt-4" onClick={confirm}>
          选好了
        </Button>
      </motion.div>
    </div>
  );
}
