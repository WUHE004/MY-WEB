"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { compressImageFile } from "@/lib/image-compress";
import { warmupImageUrl } from "@/lib/image-warmup";
import {
  ArrowLeft,
  Camera,
  Image,
  Plus,
  Minus,
  Settings2,
  PlusCircle,
  X,
  GripVertical,
  Loader2,
  Upload,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  RefreshCw,
  Search,
  Ruler,
  Shirt,
  Clock,
  Package,
} from "lucide-react";
import Link from "next/link";
import { PageWrapper, showToast } from "@/components/page-wrapper";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { NumberPop } from "@/components/motion-primitives";
import { SizeGrid } from "@/components/size-grid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const DEFAULT_MANUFACTURERS = [
  "大炳家", "小礼物", "海燕家", "曾姐姐", "程祥家", "老刘家",
  "茶七厘家", "大咖家", "梓东家", "米可鑫家", "红姐家", "一鸣家",
  "小渔家", "奇布鲁家", "笨笨家", "小绵羊家", "婴时尚家", "啊正家",
  "钱多多家", "化磊家", "喜宝家", "收购家", "衣品汇家", "程哲家",
  "梨子家", "韩瑞家", "静静家", "衣鞋柜家", "晓晓家", "晓丽家",
  "甜妈家", "番薯家", "圆啊圆", "可乐家", "可可家", "凑凑",
  "童优格", "艾衣诺", "幸运儿", "丹丹家", "百变童年", "大妞童装",
  "阿勇", "丫丫家", "陈丽家",
];

const SIZE_OPTIONS = [80, 90, 95, 100, 105, 110, 120, 130, 140, 150, 160, 170, 180];

// 无尺码分类(母婴/日用/配饰等)的库存统一存放在 180 尺码下
// (与售出清洗"无尺码填180"对齐, 避免入库在80、售出在180导致库存对不上)
const NO_SIZE_STORE = 180;

const SEASON_CATEGORIES = ["春季", "夏季", "秋季", "冬季", "四季通用"];

// 含尺码的款式分类
const DEFAULT_SIZE_STYLES = [
  "T恤", "裤子", "裙子", "外套", "卫衣", "套装", "连体衣", "羽绒服", "衬衫", "内衣", "其他",
];
// 不含尺码的款式分类
const DEFAULT_NO_SIZE_STYLES = ["母婴", "日用", "配饰"];

const DEFAULT_SHELF_DATA: Record<string, number[]> = {
  A: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  B: [1, 2],
  C: [1, 2, 3, 4, 5],
};

const DEFAULT_LAYERS = [1, 2, 3, 4, 5];

// 进价预选默认值(可在设置中增删, 持久化 settings.cost_presets)
const DEFAULT_COST_PRESETS = ["9.9", "15.9", "19.9", "25.9", "29.9"];

// 衣服名称预输入三组默认值(持久化 settings.name_presets)
interface NamePresets { color: string[]; style: string[]; detail: string[] }
const DEFAULT_NAME_PRESETS: NamePresets = {
  color: ["蓝色", "粉色", "黑色", "红色", "米白", "白色"],
  style: ["短袖", "T桖", "毛衣", "大衣", "连体", "防晒"],
  detail: ["Hollo kitty", "米老鼠", "奥特曼"],
};
const NAME_PRESET_GROUPS: { key: keyof NamePresets; label: string }[] = [
  { key: "color", label: "颜色" },
  { key: "style", label: "款式" },
  { key: "detail", label: "细节" },
];

// 备注快捷行的字母递进(衣服尺码梯子): S→M→L→XL→XXL→3XL→4XL→5XL, 纯数字则 +1, 其余保持不变
const REMARK_LETTER_LADDER = ["S", "M", "L", "XL", "XXL", "3XL", "4XL", "5XL", "6XL", "7XL", "8XL"];
const nextRemarkTag = (v: string): string => {
  if (!v) return "";
  if (/^\d+$/.test(v)) return String(Number(v) + 1);
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

interface RemarkRow { a: string; b: string; }

// 备注快捷填入悬浮窗: 每行 = [填空]+固定文字+[填空], 行尾加号递增新增一行, 底部"选好了"把各行回传给父组件填入备注
// mode: height = 填空建议身高填空(两格纯数字, 加号新行两格各+10)
//       pants  = 填空对应尺码填空(前格数字+大写字母自动转大写, 加号数字+1/字母走 S→M→L 梯子;
//                后格仅限尺码表, 自选尺码与已有行冲突时标红抖动, 冲突未解决时禁止确认)
// 由父组件条件挂载(仅打开时渲染), 状态随挂载天然重置
function RemarkRowsDialog({ title, rowLabel, mode, initialSizes, onClose, onConfirm }: {
  title: string;
  rowLabel: string;
  mode: "height" | "pants";
  /** 裤长模式: 父页面已选数量的尺码(升序), 打开时自动生成对应行数并预选好尺码 */
  initialSizes?: string[];
  onClose: () => void;
  onConfirm: (lines: string[]) => void;
}) {
  const [rows, setRows] = useState<RemarkRow[]>(() =>
    mode === "pants" && initialSizes && initialSizes.length > 0
      ? initialSizes.map((s) => ({ a: "", b: s }))
      : [{ a: "", b: "" }]
  );
  // 裤长模式: 尺码冲突抖动信号(变化触发重新播放动画)
  const [shakeTick, setShakeTick] = useState(0);

  const setRow = (i: number, patch: Partial<RemarkRow>) => {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };

  // 裤长模式: 修改某行左格(裤长标记)后, 其下各行按梯子自动递增(S→M→L…, 纯数字+1)
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
        next = { a: cur.a ? inc(cur.a) : "", b: cur.b ? inc(cur.b) : "" };
      } else {
        next = { a: nextRemarkTag(cur.a), b: nextRemarkSize(cur.b) };
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
      .map((r) => `${r.a.trim()}${rowLabel}${r.b.trim()}`);
    if (lines.length === 0) { onClose(); return; }
    onConfirm(lines);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="w-full max-w-sm bg-white rounded-2xl border-[3px] border-gray-900 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] p-4"
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
                  className={`h-10 min-w-0 flex-1 shrink text-sm font-extrabold rounded-lg outline-none bg-white px-1 border-2 transition-colors ${
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

// 入库前确认卡片: 一比一照搬管理栏总表移动端商品卡片(票根齿口+备注裁开),
// 用于"下一步"悬浮窗中让用户核对本次入库信息
function InboundConfirmCard({
  photo, saleId, name, costPrice, shelfNo, sizesMap, totalCount, notes, today,
}: {
  photo: string;
  saleId: string;
  name: string;
  costPrice: number;
  shelfNo: string;
  sizesMap: Record<number, number>;
  totalCount: number;
  notes: string;
  today: string;
}) {
  const [notesExpanded, setNotesExpanded] = useState(false);
  const hasNotes = !!notes.trim();
  // 新入库商品: 售出/退货均为0, 剩余=入库合计, 价值=进价×件数
  const soldTotal = 0;
  const returnTotal = 0;
  const remaining = totalCount;
  const inventoryValue = costPrice * totalCount;
  const perforationColor = hasNotes ? "#EF4444" : "#111827";
  const renderPerforation = (label: string) => (
    <button
      type="button"
      aria-label={label}
      onClick={() => setNotesExpanded((v) => !v)}
      className="relative block w-full bg-white p-0 border-0 cursor-pointer"
    >
      <span className="absolute -left-[3px] top-0 h-2.5 w-[3px]" style={{ backgroundColor: perforationColor }} />
      <span className="absolute -right-[3px] top-0 h-2.5 w-[3px]" style={{ backgroundColor: perforationColor }} />
      <span className="flex w-full">
        {Array.from({ length: 17 }).map((_, i) => (
          <span
            key={i}
            className="h-2.5 flex-1 mx-1 first:ml-0 last:mr-0 rounded-[2px]"
            style={{ backgroundColor: perforationColor }}
          />
        ))}
      </span>
    </button>
  );
  return (
    <div className={`relative ${notesExpanded ? "" : "rounded-xl shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]"}`}>
      {/* 上半张(撕口以上): 图片/信息/尺码 */}
      <div className={`bg-white p-2.5 border-[3px] border-b-0 rounded-t-xl border-gray-900 ${notesExpanded ? "shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]" : ""}`}>
        <div className="flex gap-2.5">
          {/* 图片区域 */}
          <div className="w-[50%] aspect-[4/5] rounded-lg border-2 border-gray-200 overflow-hidden bg-gray-100 shrink-0">
            {photo
              ? // eslint-disable-next-line @next/next/no-img-element
                <img src={photo} alt="" className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center"><Package className="h-16 w-16 text-gray-300" /></div>}
          </div>
          {/* 右侧规范化格子区 */}
          <div className="flex-1 min-w-0 flex flex-col">
            <div className="min-w-0">
              <div className="text-2xl leading-none font-extrabold text-gray-900 truncate">{saleId}</div>
              {name && <div className="text-sm text-gray-500 truncate mt-1">{name}</div>}
            </div>
            <div className="mt-1 rounded-lg border-2 border-gray-200 overflow-hidden text-xs divide-y-2 divide-gray-200">
              <div className="flex divide-x-2 divide-gray-200">
                <div className="w-[40%] flex items-center justify-between gap-0.5 px-1 py-1 min-w-0">
                  <span className="text-gray-500 shrink-0 text-[13px] font-bold">售出</span>
                  <span className="font-extrabold text-[13px] text-green-600 truncate">{soldTotal}</span>
                </div>
                <div className="flex-1 flex items-center justify-between gap-0.5 px-1 py-1 min-w-0">
                  <span className="text-gray-500 shrink-0 text-[13px] font-bold">利润率</span>
                  <span className="font-extrabold text-[13px] truncate text-green-600">0.0%</span>
                </div>
              </div>
              <div className="flex divide-x-2 divide-gray-200">
                <div className="w-[40%] flex items-center justify-between gap-0.5 px-1 py-1 min-w-0">
                  <span className="text-gray-500 shrink-0 text-[13px] font-bold">退货</span>
                  <span className="font-extrabold text-[13px] text-yellow-600 truncate">{returnTotal}</span>
                </div>
                <div className="flex-1 flex items-center justify-between gap-0.5 px-1 py-1 min-w-0">
                  <span className="text-gray-500 shrink-0 text-[13px] font-bold">退货率</span>
                  <span className="font-extrabold text-[13px] truncate text-yellow-600">0.0%</span>
                </div>
              </div>
              <div className="flex bg-gray-100">
                <div className="w-full flex items-center justify-between gap-1 px-1.5 py-1 min-w-0">
                  <span className="text-gray-500 shrink-0">进价</span>
                  <span className="font-bold text-gray-700 truncate">¥{costPrice.toFixed(2)}</span>
                </div>
              </div>
              <div className="flex bg-gray-100">
                <div className="w-full flex items-center justify-between gap-1 px-1.5 py-1 min-w-0">
                  <span className="text-red-500 shrink-0">售价</span>
                  <span className="font-extrabold text-red-500 truncate">¥0.00</span>
                </div>
              </div>
              <div className="flex">
                <div className="w-full flex items-center justify-between gap-1 px-1.5 py-1 min-w-0">
                  <span className="text-gray-500 shrink-0">入库时间</span>
                  <span className="font-medium text-gray-700 truncate">{today}</span>
                </div>
              </div>
              <div className="flex">
                <div className="w-full flex items-center justify-between gap-1 px-1.5 py-1 min-w-0">
                  <span className="text-gray-500 shrink-0">售出时间</span>
                  <span className="font-medium text-gray-700 truncate">-</span>
                </div>
              </div>
              <div className="flex bg-gray-100">
                <div className="w-full flex items-center justify-between gap-1 px-1.5 py-1 min-w-0">
                  <span className="text-gray-500 shrink-0">货架号</span>
                  <span className="font-medium text-gray-700 truncate">{shelfNo || "-"}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 尺码全宽5列 */}
        <div className="mt-1.5 grid grid-cols-5 gap-1">
          {SIZE_OPTIONS.map((s) => {
            const val = Number(sizesMap[s]) || 0;
            return (
              <span key={s} className={`text-[10px] px-1 py-1 rounded border font-bold text-center whitespace-nowrap ${
                val < 0 ? "bg-red-50 border-red-300 text-red-600"
                : val > 0 ? "bg-gray-100 border-gray-300 text-gray-700"
                : "bg-white border-gray-200 text-gray-300"
              }`}>{s}:{val}</span>
            );
          })}
        </div>
      </div>{/* /上半张 */}

      {/* 待裁齿口 */}
      {renderPerforation("展开备注")}

      {/* 备注带 */}
      <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${notesExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="overflow-hidden">
          <div className="py-2">
            <div className={`block w-full text-left px-4 py-2.5 text-[11px] leading-relaxed font-bold whitespace-pre-wrap break-words border-0 ${hasNotes ? "bg-[#EF4444] text-gray-900" : "bg-[#ECEEF0] text-gray-400"} ${notesExpanded ? "shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]" : ""}`}>
              {hasNotes ? notes.trim() : "暂无备注"}
            </div>
          </div>
        </div>
      </div>

      {/* 下半张断齿 */}
      {notesExpanded && renderPerforation("收起备注")}

      {/* 下半张: 入库/剩余/价值 */}
      <div className={`bg-white px-2.5 py-2 border-[3px] border-t-0 rounded-b-xl border-gray-900 ${notesExpanded ? "shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]" : ""}`}>
        <div className="flex justify-between items-center text-[10px]">
          <div>
            <span className="text-gray-400">入库 </span>
            <span className="font-extrabold text-blue-600">{totalCount}</span>
          </div>
          <div>
            <span className="text-gray-400">剩余 </span>
            <span className="font-extrabold text-gray-900">{remaining}</span>
          </div>
          <div>
            <span className="text-gray-400">价值 </span>
            <span className="font-extrabold text-red-500">¥{inventoryValue.toFixed(2)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function InboundPage() {
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [saleId, setSaleId] = useState("");
  const [saleIdExists, setSaleIdExists] = useState(false);
  const [checkingSaleId, setCheckingSaleId] = useState(false);
  // 入库表最新日期录入的售卖编号(占位提示"上次录入:XXX")
  const [lastSaleId, setLastSaleId] = useState("");
  // "下一步"入库信息确认悬浮窗
  const [showConfirm, setShowConfirm] = useState(false);
  const [name, setName] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [sizes, setSizes] = useState<Record<number, number>>(
    Object.fromEntries(SIZE_OPTIONS.map((s) => [s, 0]))
  );
  const [standardSize, setStandardSize] = useState(0); // 无尺码分类的标码数量
  // 当前聚焦的尺码输入框(值为0时聚焦显示空,避免用户需先删0)
  const [focusedSize, setFocusedSize] = useState<number | null>(null);
  // 货架三级选择
  const [shelfLevel1, setShelfLevel1] = useState("");
  const [shelfLevel2, setShelfLevel2] = useState("");
  const [shelfLevel3, setShelfLevel3] = useState("");
  const [notes, setNotes] = useState("");
  // 备注快捷填入悬浮窗
  const [showHeightDialog, setShowHeightDialog] = useState(false);
  const [showPantsDialog, setShowPantsDialog] = useState(false);
  // 本次已填入的身高/裤长备注行(用于"取消填入"一键删除)
  const [heightInserted, setHeightInserted] = useState<string[] | null>(null);
  const [pantsInserted, setPantsInserted] = useState<string[] | null>(null);
  // 追加备注行(已有内容时换行追加)
  const appendNotes = useCallback((lines: string[]) => {
    setNotes((prev) => (prev.trim() ? prev.trimEnd() + "\n" + lines.join("\n") : lines.join("\n")));
  }, []);
  // 从备注中删除指定行(其余行自动上移)
  const removeNotesLines = useCallback((lines: string[] | null) => {
    if (!lines || lines.length === 0) return;
    setNotes((prev) => prev.split("\n").filter((l) => !lines.includes(l.trim())).join("\n"));
  }, []);
  const confirmHeight = useCallback((lines: string[]) => { appendNotes(lines); setHeightInserted(lines); }, [appendNotes]);
  const confirmPants = useCallback((lines: string[]) => { appendNotes(lines); setPantsInserted(lines); }, [appendNotes]);
  const cancelHeight = () => { removeNotesLines(heightInserted); setHeightInserted(null); };
  const cancelPants = () => { removeNotesLines(pantsInserted); setPantsInserted(null); };

  // 进价预选(气泡 + 管理, 持久化 settings.cost_presets)
  const [costPresets, setCostPresets] = useState<string[]>(DEFAULT_COST_PRESETS);
  const [costBubbleOpen, setCostBubbleOpen] = useState(false);
  const [showCostDialog, setShowCostDialog] = useState(false);
  const [costDraft, setCostDraft] = useState<string[]>([]);
  const [newCostPreset, setNewCostPreset] = useState("");
  const [costHasChanges, setCostHasChanges] = useState(false);

  // 衣服名称预输入(颜色/款式/细节, 持久化 settings.name_presets)
  const [namePresets, setNamePresets] = useState<NamePresets>(DEFAULT_NAME_PRESETS);
  const [nameBubbleOpen, setNameBubbleOpen] = useState(false);
  const [showNameDialog, setShowNameDialog] = useState(false);
  const [nameDraft, setNameDraft] = useState<NamePresets>(DEFAULT_NAME_PRESETS);
  const [newNamePreset, setNewNamePreset] = useState<Record<keyof NamePresets, string>>({ color: "", style: "", detail: "" });
  const [nameHasChanges, setNameHasChanges] = useState(false);
  const [season, setSeason] = useState("");
  const [style, setStyle] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // 厂家管理
  const [manufacturers, setManufacturers] = useState<string[]>(DEFAULT_MANUFACTURERS);
  const [showMfrDialog, setShowMfrDialog] = useState(false);
  const [newMfrName, setNewMfrName] = useState("");
  const [mfrSortMode, setMfrSortMode] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  // 厂家输入框: 自动检索
  const [mfrInput, setMfrInput] = useState("");
  const [mfrDropdownOpen, setMfrDropdownOpen] = useState(false);
  const [mfrHighlight, setMfrHighlight] = useState("");
  // 厂家管理 - 草稿和变更追踪
  const [mfrDraft, setMfrDraft] = useState<string[]>([]);
  const [mfrHasChanges, setMfrHasChanges] = useState(false);
  // 删除厂家/款式二次确认
  const [pendingRemove, setPendingRemove] = useState<
    | { kind: "mfr"; name: string }
    | { kind: "style"; name: string; styleType: "size" | "nosize" }
    | null
  >(null);

  // 款式管理
  const [sizeStyles, setSizeStyles] = useState<string[]>(DEFAULT_SIZE_STYLES);
  const [noSizeStyles, setNoSizeStyles] = useState<string[]>(DEFAULT_NO_SIZE_STYLES);
  const [showStyleDialog, setShowStyleDialog] = useState(false);
  const [newStyleName, setNewStyleName] = useState("");
  const [newStyleType, setNewStyleType] = useState<"size" | "nosize">("size");
  const [styleSortMode, setStyleSortMode] = useState(false);
  const [styleDragIndex, setStyleDragIndex] = useState<number | null>(null);
  const [styleDragType, setStyleDragType] = useState<"size" | "nosize" | null>(null);
  // 款式管理 - 草稿和变更追踪
  const [styleSizeDraft, setStyleSizeDraft] = useState<string[]>([]);
  const [styleNoSizeDraft, setStyleNoSizeDraft] = useState<string[]>([]);
  const [styleHasChanges, setStyleHasChanges] = useState(false);

  // 货架管理
  const [shelfData, setShelfData] = useState<Record<string, number[]>>(DEFAULT_SHELF_DATA);
  const [showShelfDialog, setShowShelfDialog] = useState(false);
  const [newShelfLevel1, setNewShelfLevel1] = useState("");
  const [newShelfLevel2Count, setNewShelfLevel2Count] = useState("5");
  // 货架管理 - 草稿和变更追踪
  const [shelfDraft, setShelfDraft] = useState<Record<string, number[]>>({});
  const [shelfHasChanges, setShelfHasChanges] = useState(false);
  // 货架管理 - 展开状态
  const [expandedShelfRow, setExpandedShelfRow] = useState<string | null>(null);
  const [expandedShelfNum, setExpandedShelfNum] = useState<string | null>(null);

  // 批量导入
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: number; fail: number; errors: string[] } | null>(null);
  // 列映射
  const [importMapping, setImportMapping] = useState<Record<string, string>>({
    sale_id: "售卖编号",
    name: "衣服名称",
    manufacturer: "厂家名称",
    cost_price: "进价",
    shelf_no: "货架号",
    style_category: "款式分类",
    season: "季节分类",
    notes: "备注",
    photo: "照片",
  });
  // 货架搬运
  const [shelfProducts, setShelfProducts] = useState<Record<string, { id: string; name: string; count: number }[]>>({});
  // 货架商品检查进行中(并行批量查询时的互斥标记)
  const [shelfChecking, setShelfChecking] = useState(false);
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [transferFromShelf, setTransferFromShelf] = useState("");
  const [transferToShelf, setTransferToShelf] = useState("");
  const [transferring, setTransferring] = useState(false);
  // 设置加载状态
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // 补录弹窗
  const [showRestockDialog, setShowRestockDialog] = useState(false);
  const [restockSaleId, setRestockSaleId] = useState("");
  const [restockLoading, setRestockLoading] = useState(false);
  const [restockError, setRestockError] = useState("");
  const [restockProduct, setRestockProduct] = useState<Record<string, unknown> | null>(null);
  const [restockSizes, setRestockSizes] = useState<Record<number, number>>(
    Object.fromEntries(SIZE_OPTIONS.map((s) => [s, 0]))
  );
  const [restockSubmitting, setRestockSubmitting] = useState(false);
  // 索引下拉（同售卖登记）
  const [restockIndexList, setRestockIndexList] = useState<Array<{ sale_id: string; name: string; photo: string; manufacturer: string }>>([]);
  const [restockDropdown, setRestockDropdown] = useState<Array<{ sale_id: string; name: string; photo: string; manufacturer: string }>>([]);
  const [showRestockDropdown, setShowRestockDropdown] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

  // ===== 从数据库加载设置 =====
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const res = await fetch("/api/settings");
        if (res.ok) {
          const data = await res.json();
          if (data.size_styles && Array.isArray(data.size_styles)) {
            setSizeStyles(data.size_styles);
          }
          if (data.no_size_styles && Array.isArray(data.no_size_styles)) {
            setNoSizeStyles(data.no_size_styles);
          }
          if (data.shelf_data && typeof data.shelf_data === "object") {
            setShelfData(data.shelf_data as Record<string, number[]>);
          }
          if (data.manufacturers && Array.isArray(data.manufacturers)) {
            setManufacturers(data.manufacturers);
          }
          if (data.cost_presets && Array.isArray(data.cost_presets)) {
            setCostPresets(data.cost_presets);
          }
          if (data.name_presets && typeof data.name_presets === "object") {
            const p = data.name_presets as Partial<NamePresets>;
            setNamePresets({
              color: Array.isArray(p.color) ? p.color : DEFAULT_NAME_PRESETS.color,
              style: Array.isArray(p.style) ? p.style : DEFAULT_NAME_PRESETS.style,
              detail: Array.isArray(p.detail) ? p.detail : DEFAULT_NAME_PRESETS.detail,
            });
          }
        }
      } catch (err) {
        console.warn("加载设置失败，使用默认值", err);
      } finally {
        setSettingsLoaded(true);
      }
    };
    loadSettings();
  }, []);

  // ===== 加载入库记录索引（用于补录弹窗自动补全）=====
  useEffect(() => {
    fetch("/api/inbound-records")
      .then((r) => r.json())
      .then((data) => {
        if (!Array.isArray(data)) return;
        // 接口按 inbound_date desc 返回, 首条即最新日期的入库记录 → 占位提示"上次录入"
        if (data.length > 0) {
          const latestSid = String(data[0].sale_id || "").trim();
          if (latestSid) setLastSaleId(latestSid.toUpperCase());
        }
        // 按 sale_id 去重，保留最新一条的基础信息
        const seen = new Map<string, { sale_id: string; name: string; photo: string; manufacturer: string }>();
        for (const r of data) {
          const sid = String(r.sale_id || "").toUpperCase().trim();
          if (!sid) continue;
          if (!seen.has(sid)) {
            seen.set(sid, {
              sale_id: sid,
              name: String(r.name || ""),
              photo: String(r.photo || ""),
              manufacturer: String(r.manufacturer || ""),
            });
          }
        }
        setRestockIndexList(Array.from(seen.values()));
      })
      .catch(() => {});
  }, []);

  // ===== 从 URL 参数读取预填数据（从未入库售出记录跳转过来）=====
  const searchParams = useSearchParams();
  useEffect(() => {
    const preSaleId = searchParams.get("sale_id");
    const preSizes = searchParams.get("sizes");
    if (preSaleId) {
      setSaleId(preSaleId.toUpperCase());
      setSaleIdExists(false);
    }
    if (preSizes) {
      try {
        // 格式: "80:2,100:1,120:3"
        const sizeMap: Record<number, number> = Object.fromEntries(SIZE_OPTIONS.map((s) => [s, 0]));
        const pairs = preSizes.split(",").map((p) => p.split(":"));
        for (const [sz, qty] of pairs) {
          const sizeNum = Number(sz);
          const qtyNum = Number(qty);
          if (sizeNum > 0 && qtyNum > 0 && SIZE_OPTIONS.includes(sizeNum)) {
            sizeMap[sizeNum] = qtyNum;
          }
        }
        setSizes(sizeMap);
      } catch { /* ignore */ }
    }
  }, [searchParams]);

  // ===== 保存设置到数据库 =====
  const saveSettings = async (key: string, value: unknown) => {
    try {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });
    } catch (err) {
      console.warn("保存设置失败", err);
    }
  };

  // ===== 进价预选管理 =====
  const openCostDialog = () => {
    setCostDraft([...costPresets]);
    setCostHasChanges(false);
    setShowCostDialog(true);
  };
  const addCostPreset = () => {
    const v = newCostPreset.trim().replace(/[^0-9.]/g, "");
    if (!v || isNaN(Number(v)) || Number(v) <= 0) { showToast("请输入有效的金额", "error"); return; }
    if (costDraft.includes(v)) { showToast("该预选项已存在", "error"); return; }
    setCostDraft((prev) => [...prev, v]);
    setNewCostPreset("");
    setCostHasChanges(true);
  };
  const saveCostPresets = async () => {
    setCostPresets(costDraft);
    await saveSettings("cost_presets", costDraft);
    setCostHasChanges(false);
    showToast("进价预选已保存", "success");
  };

  // ===== 名称预输入管理 =====
  const openNameDialog = () => {
    setNameDraft({ ...namePresets, color: [...namePresets.color], style: [...namePresets.style], detail: [...namePresets.detail] });
    setNewNamePreset({ color: "", style: "", detail: "" });
    setNameHasChanges(false);
    setShowNameDialog(true);
  };
  const addNamePreset = (key: keyof NamePresets) => {
    const v = newNamePreset[key].trim();
    if (!v) return;
    if (nameDraft[key].includes(v)) { showToast("该预选项已存在", "error"); return; }
    setNameDraft((prev) => ({ ...prev, [key]: [...prev[key], v] }));
    setNewNamePreset((prev) => ({ ...prev, [key]: "" }));
    setNameHasChanges(true);
  };
  const removeNamePreset = (key: keyof NamePresets, v: string) => {
    setNameDraft((prev) => ({ ...prev, [key]: prev[key].filter((x) => x !== v) }));
    setNameHasChanges(true);
  };
  const saveNamePresets = async () => {
    setNamePresets(nameDraft);
    await saveSettings("name_presets", nameDraft);
    setNameHasChanges(false);
    showToast("名称预输入已保存", "success");
  };

  // ===== 下载 CSV 模板 =====
  const downloadTemplate = () => {
    const headers = [
      "售卖编号", "衣服名称", "厂家名称", "进价", "货架号",
      "款式分类", "季节分类", "备注", "照片",
      ...SIZE_OPTIONS.map((s) => `${s}码`),
    ];
    const sample = [
      "SP001", "示例T恤", "大炳家", "25", "A-1-1",
      "T恤", "夏季", "测试备注", "",
      ...SIZE_OPTIONS.map(() => "0"),
    ];
    const csv = [headers.join(","), sample.join(",")].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "入库导入模板.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  // ===== 查询货架上的商品 =====
  const checkShelfProducts = async (shelfNo: string) => {
    try {
      const res = await fetch(`/api/products?shelf_no=${encodeURIComponent(shelfNo)}`);
      if (res.ok) {
        const data = await res.json();
        return data.map((p: { id: string; name: string; total_stock: number }) => ({
          id: p.id,
          name: p.name,
          count: p.total_stock || 0,
        }));
      }
    } catch (err) {
      console.warn("查询货架商品失败", err);
    }
    return [];
  };

  // ===== 货架搬运 =====
  const handleTransferShelf = async () => {
    if (!transferFromShelf || !transferToShelf) return;
    setTransferring(true);
    try {
      const res = await fetch("/api/products/transfer-shelf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromShelf: transferFromShelf, toShelf: transferToShelf }),
      });
      if (res.ok) {
        const result = await res.json();
        showToast(`成功搬运 ${result.count} 件商品从 ${transferFromShelf} 到 ${transferToShelf}`, "success");
        setShowTransferDialog(false);
        // 刷新货架商品列表
        const products = await checkShelfProducts(transferFromShelf);
        setShelfProducts((prev) => ({ ...prev, [transferFromShelf]: products }));
      } else {
        const err = await res.json();
        showToast("搬运失败: " + (err.error || "未知错误"), "error");
      }
    } catch (err) {
      showToast("网络错误", "error");
    } finally {
      setTransferring(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPhotoUploading(true);
    try {
      // 先显示本地预览
      const reader = new FileReader();
      const preview = await new Promise<string>((resolve) => {
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.readAsDataURL(file);
      });
      setPhoto(preview);

      // 前端 canvas 压缩图片（自动检测 WebP 编码能力，iOS Safari 回退 JPEG）
      const compressedFile = await compressImageFile(file, { target: 100 * 1024, maxWidth: 800 });

      // 上传到后端
      const formData = new FormData();
      formData.append("file", compressedFile, compressedFile.name);
      formData.append("folder", "products");

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "上传失败");
      }

      const { url } = await res.json();
      console.log("[上传成功] URL:", url);
      // 预热验证: 确认刚上传的图片真正可访问(避开 CDN 首访窗口期), 再替换预览为远程 URL
      await warmupImageUrl(url);
      setPhoto(url); // 替换为远程 URL
    } catch (err) {
      const msg = err instanceof Error ? err.message : "上传失败";
      console.error("[上传失败]", msg);
      showToast("图片上传失败: " + msg, "error");
      setPhoto(null);
    } finally {
      setPhotoUploading(false);
      // 重置 input 以便可以重新选择同一文件
      if (e.target) e.target.value = "";
    }
  };

  // 判断当前款式是否为无尺码分类
  const isNoSizeStyle = noSizeStyles.includes(style);

  // 厂家输入框的自动检索过滤: 包含输入内容即命中, 按原排序保持
  const mfrFilteredList = useMemo(() => {
    const q = mfrInput.trim();
    if (!q) return manufacturers;
    return manufacturers.filter((m) => m.includes(q));
  }, [mfrInput, manufacturers]);

  // 输入了厂家但不在厂家库中(未通过检索选中/未添加) → 标红并阻止提交
  const mfrInvalid = !!mfrInput.trim() && !manufacturers.includes(mfrInput.trim());

  // 所有款式（含尺码 + 不含尺码）
  const allStyles = [...sizeStyles, ...noSizeStyles];

  const handleStyleChange = (value: string) => {
    setStyle(value);
    // 切换到无尺码分类时，重置尺码选择
    if (noSizeStyles.includes(value)) {
      setSizes(Object.fromEntries(SIZE_OPTIONS.map((s) => [s, 0])));
    } else {
      setStandardSize(0);
    }
  };

  const updateSize = (size: number, delta: number) => {
    setSizes((prev) => ({
      ...prev,
      [size]: Math.max(0, (prev[size] || 0) + delta),
    }));
  };

  const setSizeValue = (size: number, value: string) => {
    const num = parseInt(value, 10);
    setSizes((prev) => ({
      ...prev,
      [size]: isNaN(num) ? 0 : Math.max(0, num),
    }));
  };

  const addManufacturer = () => {
    const trimmed = newMfrName.trim();
    if (trimmed && !mfrDraft.includes(trimmed)) {
      setMfrDraft((prev) => [...prev, trimmed]);
      setMfrHasChanges(true);
    }
    setNewMfrName("");
  };

  const removeManufacturer = (name: string) => {
    setMfrDraft((prev) => prev.filter((m) => m !== name));
    setMfrHasChanges(true);
    if (manufacturer === name) setManufacturer("");
  };

  const moveManufacturer = (fromIndex: number, toIndex: number) => {
    setMfrDraft((prev) => {
      const arr = [...prev];
      const [item] = arr.splice(fromIndex, 1);
      arr.splice(toIndex, 0, item);
      return arr;
    });
    setMfrHasChanges(true);
  };

  const saveManufacturers = async () => {
    await saveSettings("manufacturers", mfrDraft);
    setManufacturers(mfrDraft);
    setMfrHasChanges(false);
  };

  // ===== 款式管理 =====
  const addStyle = () => {
    const trimmed = newStyleName.trim();
    if (!trimmed) return;
    if (newStyleType === "size") {
      if (!styleSizeDraft.includes(trimmed)) {
        setStyleSizeDraft((prev) => [...prev, trimmed]);
        setStyleHasChanges(true);
      }
    } else {
      if (!styleNoSizeDraft.includes(trimmed)) {
        setStyleNoSizeDraft((prev) => [...prev, trimmed]);
        setStyleHasChanges(true);
      }
    }
    setNewStyleName("");
  };

  const removeStyle = (name: string, type: "size" | "nosize") => {
    if (type === "size") {
      setStyleSizeDraft((prev) => prev.filter((s) => s !== name));
      setStyleHasChanges(true);
    } else {
      setStyleNoSizeDraft((prev) => prev.filter((s) => s !== name));
      setStyleHasChanges(true);
    }
    if (style === name) setStyle("");
  };

  const moveStyle = (fromIndex: number, toIndex: number, type: "size" | "nosize") => {
    if (type === "size") {
      setStyleSizeDraft((prev) => {
        const arr = [...prev];
        const [item] = arr.splice(fromIndex, 1);
        arr.splice(toIndex, 0, item);
        return arr;
      });
      setStyleHasChanges(true);
    } else {
      setStyleNoSizeDraft((prev) => {
        const arr = [...prev];
        const [item] = arr.splice(fromIndex, 1);
        arr.splice(toIndex, 0, item);
        return arr;
      });
      setStyleHasChanges(true);
    }
  };

  const saveStyles = async () => {
    await saveSettings("size_styles", styleSizeDraft);
    await saveSettings("no_size_styles", styleNoSizeDraft);
    setSizeStyles(styleSizeDraft);
    setNoSizeStyles(styleNoSizeDraft);
    setStyleHasChanges(false);
  };

  // ===== 货架管理 =====
  const addShelfLevel1 = () => {
    const trimmed = newShelfLevel1.trim().toUpperCase();
    if (!trimmed || shelfDraft[trimmed]) return;
    const count = Math.max(1, parseInt(newShelfLevel2Count, 10) || 5);
    setShelfDraft((prev) => {
      const next = { ...prev, [trimmed]: Array.from({ length: count }, (_, i) => i + 1) };
      return next;
    });
    setShelfHasChanges(true);
    setNewShelfLevel1("");
    setNewShelfLevel2Count("5");
  };

  const removeShelfLevel1 = async (key: string) => {
    // 检查该排下所有货架是否有商品(并行查询, 原为逐个串行等待, 排大时卡数秒)
    const positions = shelfDraft[key] || [];
    const shelfNos = positions.flatMap((pos) => DEFAULT_LAYERS.map((layer) => `${key}-${pos}-${layer}`));
    if (shelfNos.length === 0) return;
    setShelfChecking(true);
    try {
      const results = await Promise.all(shelfNos.map((sn) => checkShelfProducts(sn)));
      const found: Record<string, { id: string; name: string; count: number }[]> = {};
      let hasProducts = false;
      shelfNos.forEach((sn, i) => {
        if (results[i].length > 0) {
          hasProducts = true;
          found[sn] = results[i];
        }
      });
      if (hasProducts) {
        setShelfProducts((prev) => ({ ...prev, ...found }));
        showToast("该排列下有商品，请先将商品搬运到其他货架后再删除", "error");
        return;
      }
      setShelfDraft((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      setShelfHasChanges(true);
      if (shelfLevel1 === key) {
        setShelfLevel1("");
        setShelfLevel2("");
        setShelfLevel3("");
      }
    } finally {
      setShelfChecking(false);
    }
  };

  const saveShelf = async () => {
    await saveSettings("shelf_data", shelfDraft);
    setShelfData(shelfDraft);
    setShelfHasChanges(false);
  };

  // 在排内添加货架号
  const addShelfNumToRow = (rowKey: string) => {
    setShelfDraft((prev) => {
      const row = prev[rowKey] || [];
      const maxNum = row.length > 0 ? Math.max(...row) : 0;
      return { ...prev, [rowKey]: [...row, maxNum + 1] };
    });
    setShelfHasChanges(true);
  };

  // 从排内删除货架号
  const removeShelfNumFromRow = async (rowKey: string, shelfNum: number) => {
    // 检查该货架号下所有层是否有商品
    let hasProducts = false;
    for (const layer of DEFAULT_LAYERS) {
      const shelfNo = `${rowKey}-${shelfNum}-${layer}`;
      const products = await checkShelfProducts(shelfNo);
      if (products.length > 0) {
        hasProducts = true;
        setShelfProducts((prev) => ({ ...prev, [shelfNo]: products }));
      }
    }
    if (hasProducts) {
      showToast(`货架 ${rowKey}-${shelfNum} 下有商品，请先搬运后再删除`, "error");
      return;
    }
    setShelfDraft((prev) => {
      const row = prev[rowKey] || [];
      const next = { ...prev, [rowKey]: row.filter((n) => n !== shelfNum) };
      if (next[rowKey].length === 0) delete next[rowKey];
      return next;
    });
    setShelfHasChanges(true);
  };

  // 搬运单个货架号
  const handleTransferShelfNum = async (rowKey: string, shelfNum: number) => {
    setTransferFromShelf(rowKey);
    // 收集该货架号下所有层的商品(并行查询)
    const allShelves: string[] = DEFAULT_LAYERS.map((layer) => `${rowKey}-${shelfNum}-${layer}`);
    setShelfChecking(true);
    try {
      const results = await Promise.all(allShelves.map((sn) => checkShelfProducts(sn)));
      const found: Record<string, { id: string; name: string; count: number }[]> = {};
      allShelves.forEach((sn, i) => {
        if (results[i].length > 0) found[sn] = results[i];
      });
      if (Object.keys(found).length > 0) {
        setShelfProducts((prev) => ({ ...prev, ...found }));
      }
    } finally {
      setShelfChecking(false);
    }
    setShowTransferDialog(true);
  };

  const getShelfNo = (): string => {
    if (shelfLevel1 && shelfLevel2 && shelfLevel3) {
      return `${shelfLevel1}-${shelfLevel2}-${shelfLevel3}`;
    }
    return "";
  };

  // ===== 批量导入 =====
  const parseCSV = (text: string): string[][] => {
    return text.trim().split(/\r?\n/).map((line) => {
      const result: string[] = [];
      let current = "";
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
          else inQuotes = !inQuotes;
        } else if (ch === "," && !inQuotes) {
          result.push(current.trim());
          current = "";
        } else {
          current += ch;
        }
      }
      result.push(current.trim());
      return result;
    });
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    try {
      const text = await file.text();
      const rows = parseCSV(text);
      if (rows.length < 2) {
        showToast("CSV 文件为空或格式不正确", "error");
        return;
      }
      const headers = rows[0];
      const dataRows = rows.slice(1);

      let success = 0;
      let fail = 0;
      const errors: string[] = [];

      for (let r = 0; r < dataRows.length; r++) {
        const row = dataRows[r];
        try {
          const record: Record<string, unknown> = {};
          headers.forEach((h, i) => { record[h.trim()] = row[i] || ""; });

          // 使用列映射获取字段值
          const getField = (field: string) => {
            const csvHeader = importMapping[field];
            if (csvHeader && record[csvHeader] !== undefined) return String(record[csvHeader]);
            // 回退到默认列名
            return String(record[field] || "");
          };

          const sid = getField("sale_id");
          const pname = getField("name");
          const mfr = getField("manufacturer");
          const cost = parseFloat(getField("cost_price"));
          const sn = getField("shelf_no");
          const st = getField("style_category");
          const seas = getField("season");
          const nts = getField("notes");
          const photoUrl = getField("photo");

          if (!sid || !mfr || isNaN(cost)) {
            errors.push(`第 ${r + 2} 行: 缺少必填字段`);
            fail++;
            continue;
          }

          const sizeMap: Record<number, number> = {};
          SIZE_OPTIONS.forEach((s) => { sizeMap[s] = parseInt(String(record[`${s}码`] || record[`size_${s}`] || "0"), 10) || 0; });

          // 注意：与手动入库登记相同，CSV 导入只写入一次 inbound_records。
          // 历史bug：此前先调 /api/products 再调 /api/inbound-records，
          // 两者都向 inbound_records 表插入数据，导致同编号出现两条记录、库存翻倍。
          const inboundRecord = {
            sale_id: sid,
            photo: photoUrl,
            name: pname,
            manufacturer: mfr,
            size_80: sizeMap[80] || 0,
            size_90: sizeMap[90] || 0,
            size_95: sizeMap[95] || 0,
            size_100: sizeMap[100] || 0,
            size_105: sizeMap[105] || 0,
            size_110: sizeMap[110] || 0,
            size_120: sizeMap[120] || 0,
            size_130: sizeMap[130] || 0,
            size_140: sizeMap[140] || 0,
            size_150: sizeMap[150] || 0,
            size_160: sizeMap[160] || 0,
            size_170: sizeMap[170] || 0,
            size_180: sizeMap[180] || 0,
            shelf_no: sn,
            cost_price: cost,
            season: seas,
            style_category: st,
            notes: nts,
          };

          const inboundRes = await fetch("/api/inbound-records", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(inboundRecord),
          });
          if (!inboundRes.ok) throw new Error("入库记录写入失败");

          success++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : "未知错误";
          errors.push(`第 ${r + 2} 行: ${msg}`);
          fail++;
        }
      }
      setImportResult({ success, fail, errors: errors.slice(0, 10) });
    } catch (err) {
      showToast("文件读取失败: " + (err instanceof Error ? err.message : "未知错误"), "error");
    } finally {
      setImporting(false);
      if (e.target) e.target.value = "";
    }
  };

  const checkSaleId = async (id: string) => {
    if (!id.trim()) return;
    setCheckingSaleId(true);
    try {
      const res = await fetch(`/api/products?check_sale_id=${encodeURIComponent(id.trim())}`);
      const data = await res.json();
      setSaleIdExists(data.exists === true);
    } catch { setSaleIdExists(false); }
    finally { setCheckingSaleId(false); }
  };

  // 提交前校验: 通过返回 true, 不通过弹 toast 返回 false
  const validateInbound = (): boolean => {
    if (!saleId.trim()) {
      showToast("请输入售卖编号", "error");
      return false;
    }
    if (saleIdExists) {
      showToast("该编号已入库，请勿重复登记！", "error");
      return false;
    }
    if (!manufacturer) {
      showToast("请选择厂家名称", "error");
      return false;
    }
    // 输入的厂家不在厂家库中(未检索选中也未添加) → 阻止提交
    if (!manufacturers.includes(manufacturer.trim())) {
      showToast("厂家名称不在厂家库中，请从检索列表选择，或点击右侧设置按钮先添加该厂家", "error");
      return false;
    }
    if (!costPrice || isNaN(Number(costPrice))) {
      showToast("请输入有效的进价", "error");
      return false;
    }
    return true;
  };

  // "下一步": 校验通过后弹出商品卡片确认悬浮窗
  const handleNext = () => {
    if (!validateInbound()) return;
    setShowConfirm(true);
  };

  const handleSubmit = async () => {
    setSubmitting(true);

    try {
      // 注意：入库登记只需写入一次 inbound_records。
      // 历史bug：此前先调 /api/products 再调 /api/inbound-records，
      // 两者都向 inbound_records 表插入数据，导致同编号出现两条记录、库存翻倍。
      const inboundRecord = {
        sale_id: saleId.trim(),
        photo: photo || "",
        name: name.trim(),
        manufacturer,
        size_80: isNoSizeStyle ? 0 : (sizes[80] || 0),
        size_90: isNoSizeStyle ? 0 : (sizes[90] || 0),
        size_95: isNoSizeStyle ? 0 : (sizes[95] || 0),
        size_100: isNoSizeStyle ? 0 : (sizes[100] || 0),
        size_105: isNoSizeStyle ? 0 : (sizes[105] || 0),
        size_110: isNoSizeStyle ? 0 : (sizes[110] || 0),
        size_120: isNoSizeStyle ? 0 : (sizes[120] || 0),
        size_130: isNoSizeStyle ? 0 : (sizes[130] || 0),
        size_140: isNoSizeStyle ? 0 : (sizes[140] || 0),
        size_150: isNoSizeStyle ? 0 : (sizes[150] || 0),
        size_160: isNoSizeStyle ? 0 : (sizes[160] || 0),
        size_170: isNoSizeStyle ? 0 : (sizes[170] || 0),
        size_180: isNoSizeStyle ? standardSize : (sizes[180] || 0),
        shelf_no: getShelfNo(),
        cost_price: Number(costPrice),
        season,
        style_category: style,
        notes: notes.trim(),
      };

      const inboundRes = await fetch("/api/inbound-records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(inboundRecord),
      });

      if (inboundRes.ok) {
        showToast("入库登记成功！", "success");
        setShowConfirm(false);
        setLastSaleId(saleId.trim().toUpperCase());
        setPhoto(null);
        setSaleId("");
        setName("");
        setManufacturer("");
        setMfrInput("");
        setMfrHighlight("");
        setCostPrice("");
        setSizes(Object.fromEntries(SIZE_OPTIONS.map((s) => [s, 0])));
        setStandardSize(0);
        setShelfLevel1("");
        setShelfLevel2("");
        setShelfLevel3("");
        setNotes("");
        setSeason("");
        setStyle("");
      } else {
        const err = await inboundRes.json();
        showToast("入库记录写入失败: " + (err.error || "未知错误"), "error");
      }
    } catch (err) {
      showToast("网络错误，请重试", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const totalSizeCount = isNoSizeStyle
    ? standardSize
    : Object.values(sizes).reduce((sum, v) => sum + v, 0);

  // 确认卡片展示用: 无尺码品类数量落在180码上
  const effectiveSizes: Record<number, number> = isNoSizeStyle
    ? { ...Object.fromEntries(SIZE_OPTIONS.map((s) => [s, 0])), 180: standardSize }
    : sizes;

  // 今日日期(本地时区 YYYY-MM-DD), 仅用于确认卡片预览
  const todayStr = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();

  // ===== 补录功能 =====
  // 判断补录商品是否为无尺码分类
  const isRestockNoSize = (() => {
    if (!restockProduct) return false;
    const style = String(restockProduct.style_category || "").trim();
    return noSizeStyles.includes(style);
  })();

  const handleRestockSearch = async (sidOverride?: string) => {
    const sid = (sidOverride || restockSaleId).trim().toUpperCase();
    if (!sid) {
      setRestockError("请输入商品编号");
      return;
    }
    setRestockLoading(true);
    setRestockError("");
    setRestockProduct(null);
    setRestockSizes(Object.fromEntries(SIZE_OPTIONS.map((s) => [s, 0])));
    setShowRestockDropdown(false);
    try {
      // 并行拉取: 入库记录 + 售出汇总 + 退货汇总（用于计算各尺码剩余数量）
      const [res, salesRes, returnsRes] = await Promise.all([
        fetch(`/api/inbound-records?sale_id=${encodeURIComponent(sid)}`),
        fetch(`/api/sales-summary?sale_id=${encodeURIComponent(sid)}`).catch(() => null),
        fetch(`/api/returns-summary?sale_id=${encodeURIComponent(sid)}`).catch(() => null),
      ]);
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) {
        setRestockError(`未找到编号 ${sid} 的入库记录`);
        return;
      }
      // 取最新一条记录作为商品基础信息
      const latest = data[0];
      // 汇总所有入库记录的各尺码数量
      const sizeTotals: Record<number, number> = Object.fromEntries(SIZE_OPTIONS.map((s) => [s, 0]));
      for (const rec of data) {
        for (const s of SIZE_OPTIONS) {
          sizeTotals[s] += Number(rec[`size_${s}`]) || 0;
        }
      }
      // 剩余数量 = 入库合计 − 已售合计 + 已退合计（按尺码）
      let salesRow: Record<string, unknown> | null = null;
      let returnsRow: Record<string, unknown> | null = null;
      try {
        const salesData = salesRes && salesRes.ok ? await salesRes.json() : [];
        if (Array.isArray(salesData) && salesData.length > 0) salesRow = salesData[0];
        const returnsData = returnsRes && returnsRes.ok ? await returnsRes.json() : [];
        if (Array.isArray(returnsData) && returnsData.length > 0) returnsRow = returnsData[0];
      } catch { /* 汇总查询失败时按无售出处理，仅显示入库数量 */ }
      const remaining: Record<number, number> = Object.fromEntries(SIZE_OPTIONS.map((s) => [s, 0]));
      for (const s of SIZE_OPTIONS) {
        const sold = salesRow ? Number(salesRow[`size_${s}`]) || 0 : 0;
        const returned = returnsRow ? Number(returnsRow[`size_${s}`]) || 0 : 0;
        remaining[s] = Math.max(0, sizeTotals[s] - sold + returned);
      }
      const productWithTotals = { ...latest, _sizeTotals: remaining, _inboundTotals: sizeTotals, _recordCount: data.length };
      setRestockProduct(productWithTotals);
    } catch {
      setRestockError("查询失败，请重试");
    } finally {
      setRestockLoading(false);
    }
  };

  // 输入编号时实时过滤下拉
  const handleRestockInput = (value: string) => {
    const val = value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    setRestockSaleId(val);
    setRestockError("");
    setRestockProduct(null);
    setShowRestockDropdown(false);
    if (val.trim()) {
      const filtered = restockIndexList
        .filter(
          (r) =>
            r.sale_id.toLowerCase().includes(val.toLowerCase()) ||
            r.name.toLowerCase().includes(val.toLowerCase())
        )
        .slice(0, 10);
      setRestockDropdown(filtered);
      setShowRestockDropdown(filtered.length > 0);
    } else {
      setRestockDropdown([]);
    }
  };

  // 点击下拉项
  const handleRestockSelect = (item: { sale_id: string; name: string; photo: string; manufacturer: string }) => {
    setRestockSaleId(item.sale_id);
    setShowRestockDropdown(false);
    handleRestockSearch(item.sale_id);
  };

  const updateRestockSize = (size: number, delta: number) => {
    setRestockSizes((prev) => ({
      ...prev,
      [size]: Math.max(0, (prev[size] || 0) + delta),
    }));
  };

  const setRestockSizeValue = (size: number, value: string) => {
    const num = parseInt(value, 10);
    setRestockSizes((prev) => ({
      ...prev,
      [size]: isNaN(num) ? 0 : Math.max(0, num),
    }));
  };

  const handleRestockSubmit = async () => {
    if (!restockProduct) return;
    // 无尺码分类时只统计 size_180（标码），有尺码时统计全部
    const totalRestock = isRestockNoSize
      ? restockSizes[NO_SIZE_STORE] || 0
      : Object.values(restockSizes).reduce((sum, v) => sum + v, 0);
    if (totalRestock === 0) {
      showToast("请输入补录数量", "error");
      return;
    }

    setRestockSubmitting(true);
    try {
      const sid = String(restockProduct.sale_id || "").toUpperCase();
      const record: Record<string, unknown> = {
        sale_id: sid,
        photo: restockProduct.photo || "",
        name: restockProduct.name || "",
        manufacturer: restockProduct.manufacturer || "",
        shelf_no: restockProduct.shelf_no || "",
        cost_price: Number(restockProduct.cost_price) || 0,
        sell_price: Number(restockProduct.sell_price) || 0,
        season: restockProduct.season || "",
        style_category: restockProduct.style_category || "",
        notes: `补录入库 ${new Date().toLocaleString("zh-CN")}`,
        inbound_date: new Date().toISOString(),
      };
      for (const s of SIZE_OPTIONS) {
        // 无尺码分类时，只有 size_180 写入补录数量，其他尺码为 0
        if (isRestockNoSize) {
          record[`size_${s}`] = s === NO_SIZE_STORE ? restockSizes[NO_SIZE_STORE] || 0 : 0;
        } else {
          record[`size_${s}`] = restockSizes[s] || 0;
        }
      }

      const res = await fetch("/api/inbound-records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(record),
      });

      if (!res.ok) {
        const err = await res.json();
        showToast("补录失败: " + (err.error || "未知错误"), "error");
        return;
      }

      showToast(`补录成功！共入库 ${totalRestock} 件（${sid}）`, "success");
      // 重置补录弹窗
      setShowRestockDialog(false);
      setRestockSaleId("");
      setRestockProduct(null);
      setRestockSizes(Object.fromEntries(SIZE_OPTIONS.map((s) => [s, 0])));
      setRestockError("");
      setShowRestockDropdown(false);
    } catch {
      showToast("网络错误，请重试", "error");
    } finally {
      setRestockSubmitting(false);
    }
  };

  const openRestockDialog = () => {
    setShowRestockDialog(true);
    setRestockSaleId("");
    setRestockProduct(null);
    setRestockError("");
    setRestockSizes(Object.fromEntries(SIZE_OPTIONS.map((s) => [s, 0])));
    setShowRestockDropdown(false);
    setRestockDropdown([]);
  };

  return (
    <PageWrapper>
      {/* Header */}
      <div className="flex items-center gap-3 lg:gap-4 mb-6 lg:mb-8">
        <Link
          href="/links"
          className="flex h-10 w-10 items-center justify-center rounded-xl border-[3px] border-gray-900 bg-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-gray-900">
          <span className="highlight-yellow">入库登记</span>
        </h1>
        <button
          onClick={openRestockDialog}
          className="flex items-center gap-1.5 h-10 px-3 lg:px-4 rounded-xl border-[3px] border-gray-900 bg-[#7B61FF] shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
          title="补录入库"
        >
          <RefreshCw className="h-4 w-4 lg:h-5 lg:w-5 text-white" />
          <span className="text-xs lg:text-sm font-extrabold text-white">补录</span>
        </button>
      </div>

      <div className="max-w-2xl mx-auto">
        {/* Photo Upload */}
        <div className="mb-6">
          <label className="text-sm lg:text-base font-extrabold text-gray-900 mb-2 block">
            商品照片
          </label>
          <div className="flex gap-3">
            <div
              onClick={() => !photoUploading && fileInputRef.current?.click()}
              className="flex-1 h-[200px] rounded-xl border-[3px] border-dashed border-gray-400 bg-gray-50 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-gray-900 hover:bg-gray-100 transition-all relative overflow-hidden"
            >
              {photoUploading ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
                  <span className="text-xs font-bold text-gray-500">正在压缩并上传...</span>
                </div>
              ) : photo ? (
                <img src={photo} alt="Preview" className="w-full h-full object-cover rounded-lg" />
              ) : (
                <>
                  <Image className="h-8 w-8 text-gray-400" />
                  <span className="text-xs font-bold text-gray-400">点击上传照片</span>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoUpload}
                className="hidden"
              />
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => cameraInputRef.current?.click()}
                disabled={photoUploading}
                className="flex h-10 w-10 items-center justify-center rounded-xl border-[3px] border-gray-900 bg-[#4A90E2] shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[3px] active:translate-y-[3px] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                title="拍照"
              >
                <Camera className="h-5 w-5 text-white" />
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={photoUploading}
                className="flex h-10 w-10 items-center justify-center rounded-xl border-[3px] border-gray-900 bg-[#FFC93C] shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[3px] active:translate-y-[3px] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                title="从相册选择"
              >
                <Image className="h-5 w-5 text-gray-900" />
              </button>
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handlePhotoUpload}
                className="hidden"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 mb-6">
          {/* Sale ID */}
          <div>
            <label className="text-sm lg:text-base font-extrabold text-gray-900 mb-1 block">
              售卖编号 <span className="text-red-500">*</span>
            </label>
            <Input
              value={saleId}
              onChange={(e) => {
                const val = e.target.value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
                setSaleId(val);
                setSaleIdExists(false);
              }}
              onBlur={(e) => checkSaleId(e.target.value)}
              placeholder={lastSaleId ? `上次录入：${lastSaleId}` : "例如: WUHE001"}
              className="text-sm"
            />
            {checkingSaleId && <p className="text-xs text-gray-400 mt-1">正在检查编号...</p>}
            {saleIdExists && (
              <p className="text-xs text-red-500 font-bold mt-1 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> 该编号已入库，请勿重复登记！
              </p>
            )}
          </div>

          {/* Name */}
          <div>
            <label className="text-sm lg:text-base font-extrabold text-gray-900 mb-1 block">
              衣服名称 <span className="text-xs font-normal text-gray-400">(非必填)</span>
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onFocus={() => setNameBubbleOpen(true)}
                  onBlur={() => setTimeout(() => setNameBubbleOpen(false), 150)}
                  placeholder="例如: 夏季短袖T恤"
                  className="text-sm"
                />
                {/* 名称预输入气泡: 颜色/款式/细节三组, 点击追加进输入框 */}
                {nameBubbleOpen && (
                  <div className="absolute left-0 right-0 bottom-full mb-1 z-30 max-h-64 overflow-y-auto rounded-xl border-[3px] border-gray-900 bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-2.5 space-y-2">
                    {NAME_PRESET_GROUPS.map((g) => (
                      <div key={g.key}>
                        <p className="text-[10px] font-extrabold text-gray-400 mb-1">{g.label}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {namePresets[g.key].map((v) => (
                            <button
                              key={v}
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => setName((prev) => prev + v)}
                              className="rounded-lg border-2 border-gray-900 bg-gray-100 px-2.5 py-1 text-xs font-extrabold text-gray-700 transition-all hover:bg-gray-900 hover:text-white"
                            >
                              {v}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={openNameDialog}
                className="flex h-10 w-10 items-center justify-center rounded-xl border-[3px] border-gray-900 bg-gray-100 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[3px] active:translate-y-[3px] transition-all shrink-0"
                title="管理名称预输入"
              >
                <Settings2 className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Manufacturer */}
          <div>
            <label className="text-sm lg:text-base font-extrabold text-gray-900 mb-1 block">
              厂家名称 <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2">
              {/* 输入框: 输入时自动检索厂家并填入 */}
              <div className="relative flex-1">
                <input
                  type="text"
                  value={mfrInput}
                  onChange={(e) => {
                    const v = e.target.value;
                    setMfrInput(v);
                    setManufacturer(v);
                    setMfrDropdownOpen(true);
                    // 完全匹配已有厂家时高亮选中
                    if (v && manufacturers.some((m) => m === v)) setMfrHighlight(v);
                  }}
                  onFocus={() => setMfrDropdownOpen(true)}
                  onBlur={() => setTimeout(() => setMfrDropdownOpen(false), 150)}
                  placeholder="输入厂家名称自动检索"
                  className={`neo-input w-full text-sm ${
                    mfrInvalid
                      ? "!border-[#FF6B7A] !text-[#FF6B7A] !bg-[#FF6B7A]/5"
                      : ""
                  }`}
                />
                {/* 不在厂家库中提示 */}
                {mfrInvalid && (
                  <p className="absolute left-0 -bottom-5 text-[10px] font-bold text-[#FF6B7A] whitespace-nowrap">
                    该厂家不在厂家库中, 请从检索列表选择或先添加
                  </p>
                )}
                {/* 自动检索下拉 */}
                {mfrDropdownOpen && mfrFilteredList.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 z-30 max-h-56 overflow-auto rounded-xl border-[3px] border-gray-900 bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                    {mfrFilteredList.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setMfrInput(m);
                          setManufacturer(m);
                          setMfrHighlight(m);
                          setMfrDropdownOpen(false);
                        }}
                        className={`block w-full text-left px-3 py-2 text-sm font-bold truncate ${
                          m === mfrHighlight
                            ? "bg-[#FFC93C] text-gray-900"
                            : m === manufacturer
                              ? "bg-gray-100 text-gray-900"
                              : "text-gray-700 hover:bg-gray-100"
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {/* 下拉框: 保留单独翻找功能 */}
              <select
                value={manufacturers.includes(manufacturer) ? manufacturer : ""}
                onChange={(e) => {
                  setManufacturer(e.target.value);
                  setMfrInput(e.target.value);
                  setMfrHighlight(e.target.value);
                }}
                className="neo-input w-28 lg:w-36 text-sm"
                title="下拉选择厂家"
              >
                <option value="">选择</option>
                {manufacturers.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <button
                onClick={() => { setMfrDraft([...manufacturers]); setMfrHasChanges(false); setShowMfrDialog(true); }}
                className="flex h-10 w-10 items-center justify-center rounded-xl border-[3px] border-gray-900 bg-gray-100 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[3px] active:translate-y-[3px] transition-all shrink-0"
                title="管理厂家"
              >
                <Settings2 className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Cost Price */}
          <div>
            <label className="text-sm lg:text-base font-extrabold text-green-600 mb-1 block">
              进价 <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={costPrice}
                  onChange={(e) => setCostPrice(e.target.value)}
                  onFocus={() => setCostBubbleOpen(true)}
                  onBlur={() => setTimeout(() => setCostBubbleOpen(false), 150)}
                  placeholder="例如: 29.9"
                  className="text-sm font-bold"
                  style={
                    costPrice !== "" && Number(costPrice) > 100
                      ? { borderColor: "#ef4444", color: "#dc2626" }
                      : { borderColor: "#22c55e", color: "#16a34a" }
                  }
                />
                {/* 预选进价气泡: 点击输入框时从上方弹出, 点击直接填入 */}
                {costBubbleOpen && costPresets.length > 0 && (
                  <div className="absolute left-0 right-0 bottom-full mb-1 z-30 rounded-xl border-[3px] border-gray-900 bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-2">
                    <div className="flex flex-wrap gap-1.5">
                      {costPresets.map((v) => (
                        <button
                          key={v}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => { setCostPrice(v); setCostBubbleOpen(false); }}
                          className={`rounded-lg border-2 border-green-600 px-3 py-1.5 text-sm font-extrabold transition-all ${
                            costPrice === v
                              ? "bg-green-600 text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,0.3)]"
                              : "bg-white text-green-700 hover:bg-green-50"
                          }`}
                        >
                          ¥{v}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <button
                onClick={openCostDialog}
                className="flex h-10 w-10 items-center justify-center rounded-xl border-[3px] border-gray-900 bg-gray-100 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[3px] active:translate-y-[3px] transition-all shrink-0"
                title="管理进价预选"
              >
                <Settings2 className="h-5 w-5" />
              </button>
            </div>
            {/* 进价超过 100: 输入框标红 + 提示确认售价 */}
            {costPrice !== "" && Number(costPrice) > 100 && (
              <p className="mt-1 text-xs font-bold text-red-500 flex items-center gap-1">
                ⚠️ 进价超过 100，请确认售价是否正常
              </p>
            )}
          </div>

          {/* Shelf No - 三级货架选择 */}
          <div>
            <label className="text-sm lg:text-base font-extrabold text-gray-900 mb-1 block">
              货架号
            </label>
            <div className="flex gap-2">
              <div className="flex-1 flex gap-1.5">
                <select
                  value={shelfLevel1}
                  onChange={(e) => { setShelfLevel1(e.target.value); setShelfLevel2(""); setShelfLevel3(""); }}
                  className="neo-input flex-1 text-sm"
                >
                  <option value="">一排</option>
                  {Object.keys(shelfData).map((k) => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>
                <select
                  value={shelfLevel2}
                  onChange={(e) => { setShelfLevel2(e.target.value); setShelfLevel3(""); }}
                  disabled={!shelfLevel1}
                  className="neo-input flex-1 text-sm disabled:opacity-40"
                >
                  <option value="">货架号</option>
                  {shelfLevel1 && (shelfData[shelfLevel1] || []).map((n) => (
                    <option key={n} value={String(n)}>{n}</option>
                  ))}
                </select>
                <select
                  value={shelfLevel3}
                  onChange={(e) => setShelfLevel3(e.target.value)}
                  disabled={!shelfLevel2}
                  className="neo-input flex-1 text-sm disabled:opacity-40"
                >
                  <option value="">层</option>
                  {DEFAULT_LAYERS.map((n) => (
                    <option key={n} value={String(n)}>{n}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={() => { setShelfDraft({...shelfData}); setShelfHasChanges(false); setShowShelfDialog(true); }}
                className="flex h-10 w-10 items-center justify-center rounded-xl border-[3px] border-gray-900 bg-gray-100 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[3px] active:translate-y-[3px] transition-all shrink-0"
                title="管理货架"
              >
                <Settings2 className="h-5 w-5" />
              </button>
            </div>
            {shelfLevel1 && shelfLevel2 && shelfLevel3 && (
              <p className="text-[10px] text-gray-500 mt-1 font-bold">
                {getShelfNo()}（{shelfLevel1}货架第{shelfLevel3}层）
              </p>
            )}
          </div>

          {/* Season */}
          <div>
            <label className="text-sm lg:text-base font-extrabold text-gray-900 mb-1 block">
              季节分类
            </label>
            <select
              value={season}
              onChange={(e) => setSeason(e.target.value)}
              className="neo-input w-full text-sm"
            >
              <option value="">请选择季节</option>
              {SEASON_CATEGORIES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Style */}
          <div>
            <label className="text-sm lg:text-base font-extrabold text-gray-900 mb-1 block">
              款式分类
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <select
                  value={style}
                  onChange={(e) => handleStyleChange(e.target.value)}
                  className="neo-input w-full text-sm"
                >
                  <option value="">请选择款式</option>
                  <optgroup label="── 含尺码分类 ──">
                    {sizeStyles.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </optgroup>
                  <optgroup label="── 不含尺码分类 ──">
                    {noSizeStyles.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </optgroup>
                </select>
              </div>
              <button
                onClick={() => { setStyleSizeDraft([...sizeStyles]); setStyleNoSizeDraft([...noSizeStyles]); setStyleHasChanges(false); setShowStyleDialog(true); }}
                className="flex h-10 w-10 items-center justify-center rounded-xl border-[3px] border-gray-900 bg-gray-100 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[3px] active:translate-y-[3px] transition-all shrink-0"
                title="管理款式"
              >
                <Settings2 className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Sizes */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm lg:text-base font-extrabold text-gray-900">
              {isNoSizeStyle ? "标码数量" : "尺码数量"}
            </label>
            <span className="text-xs lg:text-sm font-bold text-gray-500">
              合计: <NumberPop value={totalSizeCount} /> 件
            </span>
          </div>
          {isNoSizeStyle ? (
            <div className="rounded-xl border-[3px] border-gray-900 bg-white p-3 inline-flex items-center gap-3">
              <span className="text-sm font-extrabold text-gray-900">标码</span>
              <button
                type="button"
                onClick={() => setStandardSize((prev) => Math.max(0, prev - 1))}
                className="flex h-8 w-8 items-center justify-center rounded-lg border-[2px] border-gray-900 bg-[#FF6B7A] text-white active:scale-90 transition-transform"
              >
                <Minus className="h-4 w-4" />
              </button>
              <input
                type="text"
                inputMode="numeric"
                value={focusedSize === -1 && standardSize === 0 ? "" : standardSize}
                onFocus={() => setFocusedSize(-1)}
                onBlur={() => setFocusedSize(null)}
                onChange={(e) => {
                  const num = parseInt(e.target.value, 10);
                  setStandardSize(isNaN(num) ? 0 : Math.max(0, num));
                }}
                className="w-16 text-center text-base font-extrabold text-gray-900 border-none outline-none bg-transparent"
              />
              <button
                type="button"
                onClick={() => setStandardSize((prev) => prev + 1)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border-[2px] border-gray-900 bg-[#4CD964] text-white active:scale-90 transition-transform"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <SizeGrid
              sizeList={SIZE_OPTIONS}
              sizes={sizes}
              onDelta={updateSize}
              onSetValue={setSizeValue}
            />
          )}
        </div>

        {/* Notes */}
        <div className="mb-8">
          <label className="text-sm lg:text-base font-extrabold text-gray-900 mb-1 block">
            备注 <span className="text-xs font-normal text-gray-400">(非必填)</span>
          </label>
          <div className="flex items-stretch gap-2">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="请输入备注信息..."
              rows={4}
              className="neo-input flex-1 text-sm resize-none"
            />
            {/* 快捷填入图标按钮: 右侧上下并排; 已填入时变"取消填入"(一键删除本次填入的行) */}
            <div className="flex flex-col justify-center gap-2 shrink-0">
              {heightInserted ? (
                <button
                  onClick={cancelHeight}
                  className="h-10 px-2.5 flex items-center gap-1 rounded-xl border-[3px] border-gray-900 bg-[#FF6B6B] text-white text-xs font-extrabold shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[3px] active:translate-y-[3px] transition-all whitespace-nowrap"
                  title="删除本次填入的身高备注"
                >
                  取消填入<X className="h-3.5 w-3.5" />
                </button>
              ) : (
                <button
                  onClick={() => setShowHeightDialog(true)}
                  className="h-10 w-10 flex items-center justify-center rounded-xl border-[3px] border-gray-900 bg-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[3px] active:translate-y-[3px] transition-all"
                  title="身高批量填入"
                >
                  <Ruler className="h-5 w-5 text-gray-700" />
                </button>
              )}
              {pantsInserted ? (
                <button
                  onClick={cancelPants}
                  className="h-10 px-2.5 flex items-center gap-1 rounded-xl border-[3px] border-gray-900 bg-[#FF6B6B] text-white text-xs font-extrabold shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[3px] active:translate-y-[3px] transition-all whitespace-nowrap"
                  title="删除本次填入的裤长备注"
                >
                  取消填入<X className="h-3.5 w-3.5" />
                </button>
              ) : (
                <button
                  onClick={() => setShowPantsDialog(true)}
                  className="h-10 w-10 flex items-center justify-center rounded-xl border-[3px] border-gray-900 bg-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[3px] active:translate-y-[3px] transition-all"
                  title="裤长批量填入"
                >
                  <Shirt className="h-5 w-5 text-gray-700" />
                </button>
              )}
              <button
                onClick={() => appendNotes(["待定"])}
                className="h-10 w-10 flex items-center justify-center rounded-xl border-[3px] border-gray-900 bg-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[3px] active:translate-y-[3px] transition-all"
                title="备注追加: 待定"
              >
                <Clock className="h-5 w-5 text-gray-700" />
              </button>
            </div>
          </div>
        </div>

        {/* 备注快捷填入悬浮窗(条件挂载, 状态随挂载重置) */}
        {showHeightDialog && (
          <RemarkRowsDialog
            title="身高"
            rowLabel="建议身高"
            mode="height"
            onClose={() => setShowHeightDialog(false)}
            onConfirm={confirmHeight}
          />
        )}
        {showPantsDialog && (
          <RemarkRowsDialog
            title="裤长"
            rowLabel="对应尺码"
            mode="pants"
            // 已选数量的尺码(去重升序): 110-140各5件 → 自动生成4行并预选110/120/130/140
            initialSizes={SIZE_OPTIONS.filter((s) => (sizes[s] || 0) > 0).map((s) => String(s))}
            onClose={() => setShowPantsDialog(false)}
            onConfirm={confirmPants}
          />
        )}

        {/* 下一步: 先弹商品卡片确认, 再在悬浮窗内提交入库 */}
        <Button
          variant="primary"
          onClick={handleNext}
          disabled={submitting}
          className="w-full py-4 text-base lg:text-lg font-extrabold"
        >
          下一步
        </Button>
      </div>

      {/* 入库信息确认悬浮窗: 一比一照搬总表商品卡片 */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => !submitting && setShowConfirm(false)}>
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            className="w-full max-w-sm max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-center text-base font-extrabold text-white mb-3">请核对入库信息</h2>
            <InboundConfirmCard
              photo={photo || ""}
              saleId={saleId.trim()}
              name={name.trim()}
              costPrice={Number(costPrice) || 0}
              shelfNo={getShelfNo()}
              sizesMap={effectiveSizes}
              totalCount={totalSizeCount}
              notes={notes}
              today={todayStr}
            />
            {/* 卡片下方两个按钮并排: 上一步 / 提交入库 */}
            <div className="grid grid-cols-2 gap-3 mt-4">
              <Button
                variant="secondary"
                onClick={() => setShowConfirm(false)}
                disabled={submitting}
                className="py-3.5 text-base font-extrabold"
              >
                上一步
              </Button>
              <Button
                variant="primary"
                onClick={handleSubmit}
                disabled={submitting}
                className="py-3.5 text-base font-extrabold"
              >
                {submitting ? "提交中..." : "提交入库"}
              </Button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Cost Preset Dialog: 进价预选管理 */}
      {showCostDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-[90%] max-w-md max-h-[80vh] bg-white rounded-2xl border-[3px] border-gray-900 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] p-6 flex flex-col"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-extrabold">进价预选管理</h2>
              <button
                onClick={() => setShowCostDialog(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border-[2px] border-gray-900 hover:bg-gray-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Add new */}
            <div className="flex gap-2 mb-4">
              <Input
                value={newCostPreset}
                onChange={(e) => setNewCostPreset(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addCostPreset()}
                placeholder="输入新预选金额, 如 19.9"
                className="text-sm flex-1"
              />
              <button
                onClick={addCostPreset}
                className="flex h-10 w-10 items-center justify-center rounded-xl border-[3px] border-gray-900 bg-[#4CD964] shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[3px] active:translate-y-[3px] transition-all"
              >
                <PlusCircle className="h-5 w-5 text-white" />
              </button>
            </div>

            {/* Preset list */}
            <div className="flex-1 overflow-y-auto space-y-1">
              {costDraft.length === 0 && (
                <p className="text-xs text-gray-400 font-bold text-center py-4">暂无预选项, 请先添加</p>
              )}
              {costDraft.map((v, index) => (
                <div key={`${v}-${index}`} className="flex items-center justify-between p-2 rounded-lg border-[2px] border-gray-200">
                  <span className="text-sm font-bold text-green-700">¥{v}</span>
                  <button
                    onClick={() => { setCostDraft((prev) => prev.filter((_, i) => i !== index)); setCostHasChanges(true); }}
                    className="flex h-6 w-6 items-center justify-center rounded-md border-[2px] border-gray-300 text-red-400 hover:bg-red-50 hover:border-red-400"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>

            {/* 保存修改按钮 */}
            <div className="mt-4 pt-3 border-t-[2px] border-gray-200">
              <button
                onClick={saveCostPresets}
                disabled={!costHasChanges}
                className={`w-full py-2.5 text-sm font-extrabold rounded-xl border-[3px] border-gray-900 transition-all ${
                  costHasChanges
                    ? "bg-[#4CD964] text-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[3px] active:translate-y-[3px]"
                    : "bg-gray-200 text-gray-400 cursor-not-allowed"
                }`}
              >
                {costHasChanges ? "保存修改" : "已保存"}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Name Preset Dialog: 名称预输入管理(颜色/款式/细节三组) */}
      {showNameDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-[90%] max-w-md max-h-[85vh] bg-white rounded-2xl border-[3px] border-gray-900 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] p-6 flex flex-col"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-extrabold">名称预输入管理</h2>
              <button
                onClick={() => setShowNameDialog(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border-[2px] border-gray-900 hover:bg-gray-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3">
              {NAME_PRESET_GROUPS.map((g) => (
                <div key={g.key} className="rounded-xl border-[2px] border-gray-200 p-3">
                  <p className="text-sm font-extrabold text-gray-900 mb-2">{g.label}</p>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {nameDraft[g.key].map((v) => (
                      <span key={v} className="flex items-center gap-1 rounded-lg border-[2px] border-gray-200 px-2 py-1 text-xs font-bold text-gray-700">
                        {v}
                        <button
                          onClick={() => removeNamePreset(g.key, v)}
                          className="flex h-4 w-4 items-center justify-center rounded text-red-400 hover:bg-red-50 hover:text-red-600"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-1.5">
                    <Input
                      value={newNamePreset[g.key]}
                      onChange={(e) => setNewNamePreset((prev) => ({ ...prev, [g.key]: e.target.value }))}
                      onKeyDown={(e) => e.key === "Enter" && addNamePreset(g.key)}
                      placeholder={`新${g.label}, 如${g.key === "detail" ? "小猪佩奇" : "黄色"}`}
                      className="text-xs flex-1"
                    />
                    <button
                      onClick={() => addNamePreset(g.key)}
                      className="flex h-10 w-10 items-center justify-center rounded-xl border-[3px] border-gray-900 bg-[#4CD964] shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[3px] active:translate-y-[3px] transition-all shrink-0"
                    >
                      <PlusCircle className="h-5 w-5 text-white" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* 保存修改按钮 */}
            <div className="mt-4 pt-3 border-t-[2px] border-gray-200">
              <button
                onClick={saveNamePresets}
                disabled={!nameHasChanges}
                className={`w-full py-2.5 text-sm font-extrabold rounded-xl border-[3px] border-gray-900 transition-all ${
                  nameHasChanges
                    ? "bg-[#4CD964] text-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[3px] active:translate-y-[3px]"
                    : "bg-gray-200 text-gray-400 cursor-not-allowed"
                }`}
              >
                {nameHasChanges ? "保存修改" : "已保存"}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Manufacturer Dialog */}
      {showMfrDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-[90%] max-w-md max-h-[80vh] bg-white rounded-2xl border-[3px] border-gray-900 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] p-6 flex flex-col"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-extrabold">厂家管理</h2>
              <button
                onClick={() => {
                  setShowMfrDialog(false);
                  setMfrSortMode(false);
                }}
                className="flex h-8 w-8 items-center justify-center rounded-lg border-[2px] border-gray-900 hover:bg-gray-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Add new */}
            <div className="flex gap-2 mb-4">
              <Input
                value={newMfrName}
                onChange={(e) => setNewMfrName(e.target.value)}
                placeholder="输入新厂家名称"
                className="text-sm flex-1"
                onKeyDown={(e) => e.key === "Enter" && addManufacturer()}
              />
              <button
                onClick={addManufacturer}
                className="flex h-10 w-10 items-center justify-center rounded-xl border-[3px] border-gray-900 bg-[#4CD964] shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[3px] active:translate-y-[3px] transition-all"
              >
                <PlusCircle className="h-5 w-5 text-white" />
              </button>
            </div>

            {/* Toggle sort mode */}
            <button
              onClick={() => setMfrSortMode(!mfrSortMode)}
              className="text-xs font-bold text-[#4A90E2] mb-3 self-start"
            >
              {mfrSortMode ? "完成排序" : "排序（拖拽或箭头）"}
            </button>

            {/* Manufacturer list */}
            <div className="flex-1 overflow-y-auto space-y-1">
              {mfrDraft.map((m, index) => (
                <div
                  key={m}
                  draggable={mfrSortMode}
                  onDragStart={() => mfrSortMode && setDragIndex(index)}
                  onDragOver={(e) => {
                    if (mfrSortMode && dragIndex !== null && dragIndex !== index) {
                      e.preventDefault();
                      moveManufacturer(dragIndex, index);
                      setDragIndex(index);
                    }
                  }}
                  onDragEnd={() => setDragIndex(null)}
                  className={`flex items-center justify-between p-2 rounded-lg border-[2px] border-gray-200 ${
                    mfrSortMode ? "cursor-grab active:cursor-grabbing" : ""
                  } ${index === dragIndex ? "bg-gray-100" : ""}`}
                >
                  <div className="flex items-center gap-2">
                    {mfrSortMode && <GripVertical className="h-4 w-4 text-gray-400" />}
                    <span className="text-sm font-bold">{m}</span>
                  </div>
                  {mfrSortMode ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        aria-label={`上移 ${m}`}
                        disabled={index === 0}
                        onClick={() => moveManufacturer(index, index - 1)}
                        className="flex h-8 w-8 items-center justify-center rounded-md border-[2px] border-gray-900 text-gray-700 disabled:opacity-30 active:bg-gray-100"
                      >
                        <ChevronUp className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        aria-label={`下移 ${m}`}
                        disabled={index === mfrDraft.length - 1}
                        onClick={() => moveManufacturer(index, index + 1)}
                        className="flex h-8 w-8 items-center justify-center rounded-md border-[2px] border-gray-900 text-gray-700 disabled:opacity-30 active:bg-gray-100"
                      >
                        <ChevronDown className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setPendingRemove({ kind: "mfr", name: m })}
                      className="flex h-6 w-6 items-center justify-center rounded-md border-[2px] border-gray-300 text-red-400 hover:bg-red-50 hover:border-red-400"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* 保存修改按钮 */}
            <div className="mt-4 pt-3 border-t-[2px] border-gray-200">
              <button
                onClick={saveManufacturers}
                disabled={!mfrHasChanges}
                className={`w-full py-2.5 text-sm font-extrabold rounded-xl border-[3px] border-gray-900 transition-all ${
                  mfrHasChanges
                    ? "bg-[#4CD964] text-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[3px] active:translate-y-[3px]"
                    : "bg-gray-200 text-gray-400 cursor-not-allowed"
                }`}
              >
                {mfrHasChanges ? "保存修改" : "已保存"}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Shelf Management Dialog */}
      {showShelfDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-[90%] max-w-md max-h-[80vh] bg-white rounded-2xl border-[3px] border-gray-900 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] p-6 flex flex-col"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-extrabold">货架管理</h2>
              <button
                onClick={() => { setShowShelfDialog(false); setExpandedShelfRow(null); setExpandedShelfNum(null); }}
                className="flex h-8 w-8 items-center justify-center rounded-lg border-[2px] border-gray-900 hover:bg-gray-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex gap-2 mb-4">
              <Input
                value={newShelfLevel1}
                onChange={(e) => setNewShelfLevel1(e.target.value)}
                placeholder="排编号 (如: D)"
                className="text-sm flex-1"
                maxLength={1}
              />
              <Input
                type="number"
                value={newShelfLevel2Count}
                onChange={(e) => setNewShelfLevel2Count(e.target.value)}
                placeholder="货架数"
                className="text-sm w-20"
                min="1"
                max="20"
              />
              <button
                onClick={addShelfLevel1}
                className="flex h-10 w-10 items-center justify-center rounded-xl border-[3px] border-gray-900 bg-[#4CD964] shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[3px] active:translate-y-[3px] transition-all"
              >
                <PlusCircle className="h-5 w-5 text-white" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2">
              {Object.entries(shelfDraft).map(([key, positions]) => {
                const isRowExpanded = expandedShelfRow === key;
                return (
                  <div key={key} className="rounded-lg border-[2px] border-gray-200 overflow-hidden">
                    {/* 一级：排 */}
                    <div
                      className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-50"
                      onClick={() => setExpandedShelfRow(isRowExpanded ? null : key)}
                    >
                      <div className="flex items-center gap-2">
                        <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform ${isRowExpanded ? "rotate-180" : ""}`} />
                        <span className="text-sm font-extrabold">{key} 排</span>
                        <span className="text-[10px] text-gray-400">({positions.length}个货架)</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (shelfChecking) return; // 检查进行中防重复点击
                            setTransferFromShelf(key);
                            const allShelves: string[] = [];
                            for (const pos of positions) {
                              for (const layer of DEFAULT_LAYERS) {
                                allShelves.push(`${key}-${pos}-${layer}`);
                              }
                            }
                            // 并行查询该排下所有货架位(原为逐个串行等待, 排大时卡数秒)
                            setShelfChecking(true);
                            try {
                              const results = await Promise.all(allShelves.map((sn) => checkShelfProducts(sn)));
                              const found: Record<string, { id: string; name: string; count: number }[]> = {};
                              allShelves.forEach((sn, i) => {
                                if (results[i].length > 0) found[sn] = results[i];
                              });
                              if (Object.keys(found).length > 0) {
                                setShelfProducts((prev) => ({ ...prev, ...found }));
                              }
                            } finally {
                              setShelfChecking(false);
                            }
                            setShowTransferDialog(true);
                          }}
                          className="flex h-6 px-2 items-center justify-center rounded-md border-[2px] border-[#4A90E2] text-[10px] font-bold text-[#4A90E2] hover:bg-blue-50"
                          title="搬运整排货物"
                        >
                          搬运
                        </button>
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            await removeShelfLevel1(key);
                          }}
                          className="flex h-6 w-6 items-center justify-center rounded-md border-[2px] border-gray-300 text-red-400 hover:bg-red-50 hover:border-red-400"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    </div>

                    {/* 二级：货架号 */}
                    {isRowExpanded && (
                      <div className="border-t-[2px] border-gray-200 bg-gray-50/50">
                        {positions.map((shelfNum) => {
                          const isNumExpanded = expandedShelfNum === `${key}-${shelfNum}`;
                          return (
                            <div key={shelfNum} className="border-b border-gray-100 last:border-b-0">
                              <div
                                className="flex items-center justify-between pl-8 pr-3 py-2 cursor-pointer hover:bg-gray-100"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpandedShelfNum(isNumExpanded ? null : `${key}-${shelfNum}`);
                                }}
                              >
                                <div className="flex items-center gap-2">
                                  <ChevronDown className={`h-3 w-3 text-gray-400 transition-transform ${isNumExpanded ? "rotate-180" : ""}`} />
                                  <span className="text-xs font-bold text-gray-700">货架 {shelfNum}</span>
                                  <span className="text-[10px] text-gray-400">({DEFAULT_LAYERS.length}层)</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={async (ev) => {
                                      ev.stopPropagation();
                                      await handleTransferShelfNum(key, shelfNum);
                                    }}
                                    className="flex h-5 px-1.5 items-center justify-center rounded-md border-[1px] border-[#4A90E2] text-[9px] font-bold text-[#4A90E2] hover:bg-blue-50"
                                    title="搬运此货架"
                                  >
                                    搬运
                                  </button>
                                  <button
                                    onClick={async (ev) => {
                                      ev.stopPropagation();
                                      await removeShelfNumFromRow(key, shelfNum);
                                    }}
                                    className="flex h-5 w-5 items-center justify-center rounded-md border-[1px] border-gray-300 text-red-400 hover:bg-red-50 hover:border-red-400"
                                  >
                                    <X className="h-2.5 w-2.5" />
                                  </button>
                                </div>
                              </div>

                              {/* 三级：层 */}
                              {isNumExpanded && (
                                <div className="pl-14 pr-3 py-1 space-y-0.5 bg-gray-100/50">
                                  {DEFAULT_LAYERS.map((layer) => {
                                    const fullShelfNo = `${key}-${shelfNum}-${layer}`;
                                    return (
                                      <div key={layer} className="flex items-center justify-between py-1">
                                        <span className="text-[10px] text-gray-600">
                                          第 {layer} 层 <span className="text-gray-400 font-mono">({fullShelfNo})</span>
                                        </span>
                                        <div className="flex items-center gap-1">
                                          <button
                                            onClick={async (ev) => {
                                              ev.stopPropagation();
                                              setTransferFromShelf(`${key}-${shelfNum}`);
                                              const products = await checkShelfProducts(fullShelfNo);
                                              if (products.length > 0) {
                                                setShelfProducts((prev) => ({ ...prev, [fullShelfNo]: products }));
                                              }
                                              setShowTransferDialog(true);
                                            }}
                                            className="flex h-5 px-1.5 items-center justify-center rounded-md border-[1px] border-[#4A90E2] text-[9px] font-bold text-[#4A90E2] hover:bg-blue-50"
                                            title="搬运此层"
                                          >
                                            搬运
                                          </button>
                                          <button
                                            onClick={async (ev) => {
                                              ev.stopPropagation();
                                              const products = await checkShelfProducts(fullShelfNo);
                                              if (products.length > 0) {
                                                setShelfProducts((prev) => ({ ...prev, [fullShelfNo]: products }));
                                                showToast(`该层(${fullShelfNo})有 ${products.length} 种商品，请先搬运后再删除`, "error");
                                                return;
                                              }
                                              showToast(`该层(${fullShelfNo})暂无商品，层删除功能暂不支持单独删除层，如需调整请修改货架结构`, "info");
                                            }}
                                            className="flex h-5 w-5 items-center justify-center rounded-md border-[1px] border-gray-300 text-red-400 hover:bg-red-50 hover:border-red-400"
                                          >
                                            <X className="h-2.5 w-2.5" />
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      addShelfNumToRow(key);
                                    }}
                                    className="flex items-center gap-1 text-[9px] font-bold text-[#4CD964] hover:underline py-1"
                                  >
                                    <PlusCircle className="h-2.5 w-2.5" /> 在此排添加货架号
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            addShelfNumToRow(key);
                          }}
                          className="flex items-center gap-1 text-[9px] font-bold text-[#4CD964] hover:underline py-1.5 pl-8"
                        >
                          <PlusCircle className="h-2.5 w-2.5" /> 添加货架号
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* 保存修改按钮 */}
            <div className="mt-4 pt-3 border-t-[2px] border-gray-200">
              <button
                onClick={saveShelf}
                disabled={!shelfHasChanges}
                className={`w-full py-2.5 text-sm font-extrabold rounded-xl border-[3px] border-gray-900 transition-all ${
                  shelfHasChanges
                    ? "bg-[#4CD964] text-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[3px] active:translate-y-[3px]"
                    : "bg-gray-200 text-gray-400 cursor-not-allowed"
                }`}
              >
                {shelfHasChanges ? "保存修改" : "已保存"}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Style Management Dialog */}
      {showStyleDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-[90%] max-w-md max-h-[80vh] bg-white rounded-2xl border-[3px] border-gray-900 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] p-6 flex flex-col"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-extrabold">款式管理</h2>
              <button
                onClick={() => { setShowStyleDialog(false); setStyleSortMode(false); }}
                className="flex h-8 w-8 items-center justify-center rounded-lg border-[2px] border-gray-900 hover:bg-gray-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Add new */}
            <div className="flex gap-2 mb-2">
              <Input
                value={newStyleName}
                onChange={(e) => setNewStyleName(e.target.value)}
                placeholder="输入新款式名称"
                className="text-sm flex-1"
                onKeyDown={(e) => e.key === "Enter" && addStyle()}
              />
              <select
                value={newStyleType}
                onChange={(e) => setNewStyleType(e.target.value as "size" | "nosize")}
                className="neo-input text-sm w-24"
              >
                <option value="size">含尺码</option>
                <option value="nosize">不含尺码</option>
              </select>
              <button
                onClick={addStyle}
                className="flex h-10 w-10 items-center justify-center rounded-xl border-[3px] border-gray-900 bg-[#4CD964] shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[3px] active:translate-y-[3px] transition-all"
              >
                <PlusCircle className="h-5 w-5 text-white" />
              </button>
            </div>

            <button
              onClick={() => setStyleSortMode(!styleSortMode)}
              className="text-xs font-bold text-[#4A90E2] mb-3 self-start"
            >
              {styleSortMode ? "完成排序" : "排序（拖拽或箭头）"}
            </button>

            <div className="flex-1 overflow-y-auto space-y-3">
              {/* 含尺码 */}
              <div>
                <p className="text-xs font-extrabold text-gray-500 mb-1">含尺码分类</p>
                <div className="space-y-1">
                  {styleSizeDraft.map((s, index) => (
                    <div
                      key={s}
                      draggable={styleSortMode}
                      onDragStart={() => { styleSortMode && setStyleDragIndex(index); setStyleDragType("size"); }}
                      onDragOver={(e) => {
                        if (styleSortMode && styleDragIndex !== null && styleDragType === "size" && styleDragIndex !== index) {
                          e.preventDefault();
                          moveStyle(styleDragIndex, index, "size");
                          setStyleDragIndex(index);
                        }
                      }}
                      onDragEnd={() => { setStyleDragIndex(null); setStyleDragType(null); }}
                      className={`flex items-center justify-between p-2 rounded-lg border-[2px] border-gray-200 ${styleSortMode ? "cursor-grab active:cursor-grabbing" : ""}`}
                    >
                      <div className="flex items-center gap-2">
                        {styleSortMode && <GripVertical className="h-4 w-4 text-gray-400" />}
                        <span className="text-sm font-bold">{s}</span>
                      </div>
                      {styleSortMode ? (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            aria-label={`上移 ${s}`}
                            disabled={index === 0}
                            onClick={() => moveStyle(index, index - 1, "size")}
                            className="flex h-8 w-8 items-center justify-center rounded-md border-[2px] border-gray-900 text-gray-700 disabled:opacity-30 active:bg-gray-100"
                          >
                            <ChevronUp className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            aria-label={`下移 ${s}`}
                            disabled={index === styleSizeDraft.length - 1}
                            onClick={() => moveStyle(index, index + 1, "size")}
                            className="flex h-8 w-8 items-center justify-center rounded-md border-[2px] border-gray-900 text-gray-700 disabled:opacity-30 active:bg-gray-100"
                          >
                            <ChevronDown className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setPendingRemove({ kind: "style", name: s, styleType: "size" })}
                          className="flex h-6 w-6 items-center justify-center rounded-md border-[2px] border-gray-300 text-red-400 hover:bg-red-50 hover:border-red-400"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* 不含尺码 */}
              <div>
                <p className="text-xs font-extrabold text-gray-500 mb-1">不含尺码分类</p>
                <div className="space-y-1">
                  {styleNoSizeDraft.map((s, index) => (
                    <div
                      key={s}
                      draggable={styleSortMode}
                      onDragStart={() => { styleSortMode && setStyleDragIndex(index); setStyleDragType("nosize"); }}
                      onDragOver={(e) => {
                        if (styleSortMode && styleDragIndex !== null && styleDragType === "nosize" && styleDragIndex !== index) {
                          e.preventDefault();
                          moveStyle(styleDragIndex, index, "nosize");
                          setStyleDragIndex(index);
                        }
                      }}
                      onDragEnd={() => { setStyleDragIndex(null); setStyleDragType(null); }}
                      className={`flex items-center justify-between p-2 rounded-lg border-[2px] border-gray-200 ${styleSortMode ? "cursor-grab active:cursor-grabbing" : ""}`}
                    >
                      <div className="flex items-center gap-2">
                        {styleSortMode && <GripVertical className="h-4 w-4 text-gray-400" />}
                        <span className="text-sm font-bold">{s}</span>
                      </div>
                      {styleSortMode ? (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            aria-label={`上移 ${s}`}
                            disabled={index === 0}
                            onClick={() => moveStyle(index, index - 1, "nosize")}
                            className="flex h-8 w-8 items-center justify-center rounded-md border-[2px] border-gray-900 text-gray-700 disabled:opacity-30 active:bg-gray-100"
                          >
                            <ChevronUp className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            aria-label={`下移 ${s}`}
                            disabled={index === styleNoSizeDraft.length - 1}
                            onClick={() => moveStyle(index, index + 1, "nosize")}
                            className="flex h-8 w-8 items-center justify-center rounded-md border-[2px] border-gray-900 text-gray-700 disabled:opacity-30 active:bg-gray-100"
                          >
                            <ChevronDown className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setPendingRemove({ kind: "style", name: s, styleType: "nosize" })}
                          className="flex h-6 w-6 items-center justify-center rounded-md border-[2px] border-gray-300 text-red-400 hover:bg-red-50 hover:border-red-400"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 保存修改按钮 */}
            <div className="mt-4 pt-3 border-t-[2px] border-gray-200">
              <button
                onClick={saveStyles}
                disabled={!styleHasChanges}
                className={`w-full py-2.5 text-sm font-extrabold rounded-xl border-[3px] border-gray-900 transition-all ${
                  styleHasChanges
                    ? "bg-[#4CD964] text-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[3px] active:translate-y-[3px]"
                    : "bg-gray-200 text-gray-400 cursor-not-allowed"
                }`}
              >
                {styleHasChanges ? "保存修改" : "已保存"}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Import Dialog */}
      {showImportDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-[90%] max-w-lg max-h-[85vh] bg-white rounded-2xl border-[3px] border-gray-900 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] p-6 flex flex-col"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-extrabold">批量导入</h2>
              <button
                onClick={() => { setShowImportDialog(false); setImportResult(null); }}
                className="flex h-8 w-8 items-center justify-center rounded-lg border-[2px] border-gray-900 hover:bg-gray-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {/* 下载模板 */}
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-gray-500">
                  支持 CSV 格式批量导入。必填: 售卖编号, 厂家名称, 进价。
                </p>
                <button
                  onClick={downloadTemplate}
                  className="flex items-center gap-1.5 text-xs font-bold text-[#4A90E2] hover:underline"
                >
                  <Upload className="h-3.5 w-3.5" />
                  下载模板
                </button>
              </div>

              {/* 列映射 */}
              <div className="mb-4 p-3 rounded-xl border-[2px] border-gray-200 bg-gray-50">
                <p className="text-xs font-extrabold text-gray-500 mb-2">列映射（CSV表头 → 系统字段）</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {Object.entries(importMapping).map(([field, csvHeader]) => (
                    <div key={field} className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold text-gray-500 w-16 shrink-0">{field.replace("_", " ")}:</span>
                      <Input
                        value={csvHeader}
                        onChange={(e) =>
                          setImportMapping((prev) => ({ ...prev, [field]: e.target.value }))
                        }
                        className="text-[10px] h-6 flex-1"
                        placeholder={field}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {!importing && !importResult && (
                <div
                  onClick={() => importFileRef.current?.click()}
                  className="h-[120px] rounded-xl border-[3px] border-dashed border-gray-400 bg-gray-50 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-gray-900 hover:bg-gray-100 transition-all mb-4"
                >
                  <Upload className="h-8 w-8 text-gray-400" />
                  <span className="text-xs font-bold text-gray-400">点击选择 CSV 文件</span>
                  <input
                    ref={importFileRef}
                    type="file"
                    accept=".csv"
                    onChange={handleImportFile}
                    className="hidden"
                  />
                </div>
              )}

              {importing && (
                <div className="flex flex-col items-center gap-3 py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
                  <span className="text-sm font-bold text-gray-500">正在导入中...</span>
                </div>
              )}

              {importResult && (
                <div className="mb-4 space-y-2">
                  <div className="flex gap-4">
                    <div className="flex-1 rounded-xl border-[2px] border-green-500 bg-green-50 p-3 text-center">
                      <p className="text-2xl font-extrabold text-green-600">{importResult.success}</p>
                      <p className="text-xs font-bold text-green-500">成功</p>
                    </div>
                    <div className="flex-1 rounded-xl border-[2px] border-red-500 bg-red-50 p-3 text-center">
                      <p className="text-2xl font-extrabold text-red-600">{importResult.fail}</p>
                      <p className="text-xs font-bold text-red-500">失败</p>
                    </div>
                  </div>
                  {importResult.errors.length > 0 && (
                    <div className="max-h-[120px] overflow-y-auto rounded-lg border-[2px] border-gray-200 p-2">
                      {importResult.errors.map((err, i) => (
                        <p key={i} className="text-[10px] text-red-500">{err}</p>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => setImportResult(null)}
                    className="w-full py-2 text-sm font-bold rounded-xl border-[2px] border-gray-900 bg-gray-100 hover:bg-gray-200"
                  >
                    继续导入
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    {/* Transfer Dialog */}
      {showTransferDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-[90%] max-w-md max-h-[80vh] bg-white rounded-2xl border-[3px] border-gray-900 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] p-6 flex flex-col"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-extrabold">货物搬运</h2>
              <button
                onClick={() => setShowTransferDialog(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border-[2px] border-gray-900 hover:bg-gray-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-gray-500 mb-3">
              将 <span className="font-extrabold text-gray-900">{transferFromShelf}</span> 排的所有商品搬运到目标货架
            </p>

            {/* 当前货架商品列表 */}
            <div className="mb-3">
              <p className="text-xs font-extrabold text-gray-500 mb-1">当前货架商品:</p>
              <div className="max-h-[120px] overflow-y-auto space-y-1">
                {Object.entries(shelfProducts).filter(([sn]) => sn.startsWith(transferFromShelf)).map(([sn, products]) => (
                  products.length > 0 && (
                    <div key={sn} className="text-[10px] text-gray-600 p-1.5 rounded border-[1px] border-gray-200">
                      <span className="font-bold">{sn}</span>: {products.map((p) => `${p.name}(${p.count}件)`).join(", ")}
                    </div>
                  )
                ))}
                {Object.values(shelfProducts).flat().length === 0 && (
                  <p className="text-[10px] text-gray-400">该排没有商品</p>
                )}
              </div>
            </div>

            {/* 目标货架 */}
            <div className="mb-4">
              <p className="text-xs font-extrabold text-gray-500 mb-1">目标货架:</p>
              <select
                value={transferToShelf}
                onChange={(e) => setTransferToShelf(e.target.value)}
                className="neo-input w-full text-sm"
              >
                <option value="">请选择目标货架</option>
                {Object.entries(shelfData).map(([key, positions]) => (
                  positions.map((pos) => (
                    DEFAULT_LAYERS.map((layer) => {
                      const sn = `${key}-${pos}-${layer}`;
                      return (
                        <option key={sn} value={sn} disabled={sn.startsWith(transferFromShelf)}>
                          {sn} ({key}货架第{layer}层)
                        </option>
                      );
                    })
                  ))
                ))}
              </select>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setShowTransferDialog(false)}
                className="flex-1 py-2 text-sm font-bold rounded-xl border-[2px] border-gray-900 bg-gray-100 hover:bg-gray-200"
              >
                取消
              </button>
              <button
                onClick={handleTransferShelf}
                disabled={!transferToShelf || transferring}
                className="flex-1 py-2 text-sm font-bold text-white rounded-xl border-[3px] border-gray-900 bg-[#4A90E2] shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[3px] active:translate-y-[3px] transition-all disabled:opacity-50"
              >
                {transferring ? "搬运中..." : "确认搬运"}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Restock Dialog - 补录入库弹窗 */}
      {showRestockDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-full max-w-lg max-h-[90vh] bg-white rounded-2xl border-[3px] border-gray-900 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 lg:p-5 border-b-[2px] border-gray-200">
              <h2 className="text-base lg:text-lg font-extrabold flex items-center gap-2">
                <RefreshCw className="h-4 w-4 lg:h-5 lg:w-5 text-[#7B61FF]" />
                补录入库
              </h2>
              <button
                onClick={() => setShowRestockDialog(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border-[2px] border-gray-900 hover:bg-gray-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body - 可滚动 */}
            <div className="flex-1 overflow-y-auto p-4 lg:p-5 space-y-4">
              {/* 商品编号输入（带自动索引下拉） */}
              <div className="relative">
                <label className="text-xs lg:text-sm font-extrabold text-gray-900 mb-1.5 block">
                  商品编号 <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      value={restockSaleId}
                      onChange={(e) => handleRestockInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          setShowRestockDropdown(false);
                          handleRestockSearch();
                        }
                      }}
                      onBlur={() => setTimeout(() => setShowRestockDropdown(false), 150)}
                      onFocus={() => {
                        if (restockDropdown.length > 0) setShowRestockDropdown(true);
                      }}
                      placeholder="输入编号或名称搜索"
                      className="text-sm w-full"
                    />
                  </div>
                  <button
                    onClick={() => handleRestockSearch()}
                    disabled={restockLoading || !restockSaleId.trim()}
                    className="flex items-center gap-1.5 px-3 lg:px-4 rounded-xl border-[3px] border-gray-900 bg-[#7B61FF] text-white font-extrabold text-xs lg:text-sm shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[3px] active:translate-y-[3px] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {restockLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    查询
                  </button>
                </div>
                {/* 检索结果: 内嵌展开(撑开弹窗高度, 避免被 overflow 裁剪) */}
                {showRestockDropdown && restockDropdown.length > 0 && (
                  <div className="mt-1.5 bg-white rounded-xl border-[3px] border-gray-900 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] max-h-52 overflow-y-auto">
                    {restockDropdown.map((item) => (
                      <button
                        key={item.sale_id}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleRestockSelect(item);
                        }}
                        className="w-full flex items-center gap-2 p-2 hover:bg-purple-50 border-b border-gray-100 last:border-b-0 text-left"
                      >
                        {item.photo ? (
                          <img src={item.photo} alt="" className="w-8 h-8 rounded border border-gray-300 object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-8 h-8 rounded border border-gray-300 bg-gray-200 flex items-center justify-center flex-shrink-0">
                            <Image className="h-3 w-3 text-gray-400" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-extrabold text-gray-900 truncate">{item.sale_id}</p>
                          <p className="text-[10px] text-gray-500 truncate">{item.name || "未命名"} · {item.manufacturer || "-"}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {restockError && (
                  <p className="text-xs text-red-500 font-bold mt-1.5 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> {restockError}
                  </p>
                )}
              </div>

              {/* 商品详情展示 */}
              {restockProduct && (
                <>
                  {/* 商品基础信息卡片 */}
                  <div className="rounded-xl border-[3px] border-gray-900 bg-gray-50 p-3 lg:p-4">
                    <div className="flex gap-3 lg:gap-4">
                      {/* 商品照片 */}
                      {restockProduct.photo ? (
                        <img
                          src={String(restockProduct.photo)}
                          alt={String(restockProduct.name || "")}
                          className="w-16 h-16 lg:w-20 lg:h-20 rounded-lg border-[2px] border-gray-300 object-cover flex-shrink-0"
                        />
                      ) : (
                        <div className="w-16 h-16 lg:w-20 lg:h-20 rounded-lg border-[2px] border-gray-300 bg-gray-200 flex items-center justify-center flex-shrink-0">
                          <Image className="h-6 w-6 text-gray-400" />
                        </div>
                      )}
                      {/* 商品信息 */}
                      <div className="flex-1 min-w-0">
                        <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs lg:text-sm">
                          <div className="col-span-2">
                            <span className="text-gray-500 font-bold">编号:</span>
                            <span className="ml-1 font-extrabold text-gray-900">{String(restockProduct.sale_id || "")}</span>
                            <span className="ml-2 text-[10px] text-gray-400">({restockProduct._recordCount as number}条记录)</span>
                          </div>
                          <div>
                            <span className="text-gray-500 font-bold">名称:</span>
                            <span className="ml-1 font-bold text-gray-900 truncate">{String(restockProduct.name || "未命名")}</span>
                          </div>
                          <div>
                            <span className="text-gray-500 font-bold">厂家:</span>
                            <span className="ml-1 font-bold text-gray-900">{String(restockProduct.manufacturer || "-")}</span>
                          </div>
                          <div>
                            <span className="text-gray-500 font-bold">进价:</span>
                            <span className="ml-1 font-bold text-gray-900">¥{Number(restockProduct.cost_price || 0).toFixed(2)}</span>
                          </div>
                          <div>
                            <span className="text-gray-500 font-bold">售价:</span>
                            <span className="ml-1 font-bold text-[#FF6B6B]">¥{Number(restockProduct.sell_price || 0).toFixed(2)}</span>
                          </div>
                          <div>
                            <span className="text-gray-500 font-bold">货架号:</span>
                            <span className="ml-1 font-bold text-gray-900">{String(restockProduct.shelf_no || "-")}</span>
                          </div>
                          <div>
                            <span className="text-gray-500 font-bold">季节:</span>
                            <span className="ml-1 font-bold text-gray-900">{String(restockProduct.season || "-")}</span>
                          </div>
                          <div className="col-span-2">
                            <span className="text-gray-500 font-bold">款式:</span>
                            <span className="ml-1 font-bold text-gray-900">{String(restockProduct.style_category || "-")}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 尺码补录 - 无尺码分类时只显示标码输入框 */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs lg:text-sm font-extrabold text-gray-900">
                        {isRestockNoSize ? "标码补录数量" : "补录数量"}
                      </label>
                      <span className="text-xs lg:text-sm font-bold text-[#7B61FF]">
                        本次补录: {isRestockNoSize ? restockSizes[NO_SIZE_STORE] || 0 : Object.values(restockSizes).reduce((sum, v) => sum + v, 0)} 件
                      </span>
                    </div>
                    {isRestockNoSize ? (
                      // 无尺码分类：只显示一个标码输入框（居中放大显示）
                      <div className="flex justify-center">
                        <div className="w-40 rounded-xl border-[3px] border-gray-900 bg-white p-3">
                          <div className="text-center mb-2">
                            <span className="text-sm font-extrabold text-gray-900">标码</span>
                            <p className="text-xs text-gray-500">剩余 {(restockProduct._sizeTotals as Record<number, number>)[NO_SIZE_STORE] || 0} 件</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => updateRestockSize(NO_SIZE_STORE, -1)}
                              className="flex h-9 w-9 items-center justify-center rounded-md border-[2px] border-gray-900 bg-[#FF6B7A] text-white active:scale-90 transition-transform"
                            >
                              <Minus className="h-4 w-4" />
                            </button>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={restockSizes[NO_SIZE_STORE] || 0}
                              onChange={(e) => setRestockSizeValue(NO_SIZE_STORE, e.target.value)}
                              className={`w-full text-center text-lg font-extrabold border-none outline-none bg-transparent ${
                                (restockSizes[NO_SIZE_STORE] || 0) > 0 ? "text-[#7B61FF]" : "text-gray-300"
                              }`}
                            />
                            <button
                              type="button"
                              onClick={() => updateRestockSize(NO_SIZE_STORE, 1)}
                              className="flex h-9 w-9 items-center justify-center rounded-md border-[2px] border-gray-900 bg-[#4CD964] text-white active:scale-90 transition-transform"
                            >
                              <Plus className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      // 有尺码：显示所有尺码
                      <SizeGrid
                        sizeList={SIZE_OPTIONS}
                        sizes={restockSizes}
                        onDelta={updateRestockSize}
                        onSetValue={setRestockSizeValue}
                        accent="purple"
                        pulse={false}
                        gridClassName="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-5 gap-2"
                        subLabelOf={(size) => `剩余 ${(restockProduct._sizeTotals as Record<number, number>)[size] || 0} 件`}
                      />
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Footer - 提交按钮 */}
            {restockProduct && (
              <div className="p-4 lg:p-5 border-t-[2px] border-gray-200">
                <button
                  onClick={handleRestockSubmit}
                  disabled={restockSubmitting || (isRestockNoSize ? (restockSizes[NO_SIZE_STORE] || 0) === 0 : Object.values(restockSizes).reduce((sum, v) => sum + v, 0) === 0)}
                  className="w-full py-3 text-sm lg:text-base font-extrabold text-white rounded-xl border-[3px] border-gray-900 bg-[#7B61FF] shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[3px] active:translate-y-[3px] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {restockSubmitting ? "提交中..." : `确认补录 ${isRestockNoSize ? restockSizes[NO_SIZE_STORE] || 0 : Object.values(restockSizes).reduce((sum, v) => sum + v, 0)} 件`}
                </button>
              </div>
            )}
          </motion.div>
        </div>
      )}

      {/* 删除厂家/款式二次确认 */}
      <ConfirmDialog
        open={pendingRemove !== null}
        title={`确认删除「${pendingRemove?.name || ""}」？`}
        description={
          pendingRemove?.kind === "mfr"
            ? "将从厂家列表中移除（需点「保存修改」后生效）。"
            : "将从款式列表中移除（需保存后生效）。"
        }
        confirmText="确认删除"
        onCancel={() => setPendingRemove(null)}
        onConfirm={() => {
          if (!pendingRemove) return;
          if (pendingRemove.kind === "mfr") removeManufacturer(pendingRemove.name);
          else removeStyle(pendingRemove.name, pendingRemove.styleType);
          setPendingRemove(null);
        }}
      />
    </PageWrapper>
  );
}