import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// 表名 → 中文名映射
const TABLE_LABELS: Record<string, string> = {
  inbound_records: "入库记录",
  sales_records: "销售记录",
  return_records: "退货记录",
  members: "成员管理",
  model_library: "模特库",
  model_usage: "模型用量",
  accounts: "账户管理",
  live_selections: "直播选品",
  douyin_links: "抖音链接",
  pack_records: "打包记录",
  pack_items: "打包明细",
  monthly_revenue: "月度营收",
  transactions: "交易记录",
  category_data: "分类数据",
  platform_revenue: "平台营收",
  settings: "系统设置",
  links: "快捷链接",
};

export async function GET() {
  try {
    // 通过 information_schema 查询所有 public 表及其列信息
    const { data, error } = await supabase
      .from("information_schema.columns")
      .select("table_name, column_name, data_type, is_nullable")
      .eq("table_schema", "public")
      .order("table_name", { ascending: true })
      .order("ordinal_position", { ascending: true });

    if (error) {
      console.error("查询表结构失败:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 按表名分组
    const tableMap = new Map<string, Array<{ name: string; type: string; nullable: boolean }>>();
    for (const row of (data || [])) {
      const tn = row.table_name as string;
      if (!tableMap.has(tn)) tableMap.set(tn, []);
      tableMap.get(tn)!.push({
        name: row.column_name as string,
        type: row.data_type as string,
        nullable: (row.is_nullable as string) === "YES",
      });
    }

    const tables = Array.from(tableMap.entries()).map(([name, columns]) => ({
      name,
      label: TABLE_LABELS[name] || name,
      columns,
    }));

    return NextResponse.json({ tables });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("db-admin/tables 错误:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}