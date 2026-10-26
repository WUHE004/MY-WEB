import type { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { extractUser } from "@/lib/auth";

// 操作日志公共模块: 各写操作接口在成功后调用 logOp 记录流水
// 设计原则: 日志失败绝不影响业务(内部全吞异常), 调用方用 void logOp(...) fire-and-forget 不阻塞主流程

// 业务字段中文标签(diff 展示用)
const CN_FIELDS: Record<string, string> = {
  sell_price: "售价",
  cost_price: "进价",
  total_stock: "总库存",
  shelf_no: "货架",
  quantity: "数量",
  size: "尺码",
  return_price: "退货价",
  notes: "备注",
  tracking_number: "快递单号",
  product_name: "商品名",
  name: "名称",
  manufacturer: "厂家",
  status: "状态",
  role: "权限",
  season: "季节",
  style_category: "款式",
  phone: "手机号",
  address: "地址",
  recipient: "收件人",
  recipient_phone: "收件电话",
  registration_date: "登记日期",
  inbound_date: "入库日期",
  order_time: "下单时间",
  defect_type: "次品类型",
  packer: "打包人",
  submitter: "提交人",
  return_time: "退货时间",
  is_active: "启用状态",
  description: "描述",
  type: "类型",
};

// 字段名 → 中文标签(尺码列 size_80 → "80码", 未映射的原样返回)
export function cnField(key: string): string { const m = key.match(/^size_(\d+)$/); if (m) return `${m[1]}码`; return CN_FIELDS[key] ?? key; }

// 数据库英文表名 → 中文表名（db-admin 操作日志的对象列显示用）
const TABLE_CN: Record<string, string> = {
  inbound_records: "入库登记清单",
  sales_records: "售卖记录",
  return_records: "退货记录",
  members: "成员管理",
  model_library: "模特库",
  model_usage: "模特使用记录",
  live_selections: "直播选品",
  live_shoot_scripts: "直播脚本",
  live_track_news: "跟款动态",
  douyin_links: "抖音链接",
  pack_records: "打包记录",
  pack_items: "打包商品",
  payment_qr_codes: "收款码",
  product_display: "商品展示",
  returns_daily_stats: "退货日统计",
  returns_summary: "退货汇总",
  sales_daily_stats: "售卖日统计",
  sales_summary: "售卖汇总",
  settings: "系统设置",
  shipping_tracks: "物流跟踪",
  sms_codes: "短信验证码",
  web_orders: "网页订单",
};
export function cnTable(t: string): string { return TABLE_CN[t] ?? t; }

const fmtVal = (v: unknown): string => (v == null || v === "" ? "空" : String(v));

export interface LogDetail {
  field: string;
  from: string;
  to: string;
}

// 比对新旧行生成中文明细数组(仅记录有变化的字段; 跳过 id/时间戳)
export function buildDiff(
  oldRow: Record<string, unknown> | null | undefined,
  newRow: Record<string, unknown>,
  keys?: string[],
): LogDetail[] {
  if (!oldRow) return [];
  const out: LogDetail[] = [];
  for (const k of keys ?? Object.keys(newRow)) {
    if (k === "id" || k === "created_at" || k === "updated_at" || k === "photo") continue;
    const a = fmtVal(oldRow[k]);
    const b = fmtVal(newRow[k]);
    if (a !== b) out.push({ field: cnField(k), from: a, to: b });
  }
  return out;
}

export interface OpEntry {
  action: string; // 动作码: live_select / live_price / inbound_add / sale_add / ... (前端按前缀着色)
  label: string; // 动作标签: 选品 / 改价 / 入库登记 / ...
  operator?: string; // 指定操作人(无 JWT 的接口传 body 里的名字, 如选品人); 缺省从 JWT 解析
  table?: string; // 对象表名
  id?: string; // 对象主键
  target?: string; // 对象显示文本: "编号001 · A316 连衣裙"
  detail?: LogDetail[] | string; // 改动明细数组或自由文本
}

// 从 JWT 解析操作人用户名(members.id=sub → name), 失败返回 fallback
async function resolveOperator(request: Request | null, fallback?: string): Promise<string> {
  try {
    const user = request ? extractUser(request) : null;
    if (user?.sub) {
      const { data } = await supabase.from("members").select("name").eq("id", user.sub).single();
      if (data?.name) return data.name;
    }
  } catch {
    // 无 token/查不到 → fallback
  }
  return fallback || "系统";
}

// 记录一条操作日志(内部全吞异常, 不影响业务); 调用方: void logOp(request, {...})
// request 可为 null(无 HTTP 上下文的系统动作, 如定时归档), 此时操作人记为"系统"或 fallback
export async function logOp(request: Request | null, entry: OpEntry): Promise<void> {
  try {
    const operator = await resolveOperator(request, entry.operator);
    await supabase.from("operation_logs").insert({
      action: entry.action,
      label: entry.label,
      operator,
      target_table: entry.table ?? null,
      target_id: entry.id ?? null,
      target_label: entry.target ?? null,
      detail: entry.detail ?? null,
    });
  } catch (e) {
    console.error("操作日志记录失败", e);
  }
}
