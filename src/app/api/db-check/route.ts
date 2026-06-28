import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// GET /api/db-check - 检查数据库表和数据
export async function GET() {
  const result: Record<string, any> = {};

  try {
    // 获取所有表名
    const { data: tables, error: tablesError } = await supabase
      .from("pg_tables")
      .select("schemaname, tablename")
      .eq("schemaname", "public")
      .order("tablename");

    if (tablesError) {
      result.tables_error = tablesError.message;
    } else {
      result.tables = tables?.map(t => t.tablename) || [];
    }

    // 逐个表查询数据量
    const tableNames = [
      "products",
      "members",
      "inbound_records",
      "sales_records",
      "return_records",
      "web_orders",
      "settings",
      "sms_codes",
      "payment_qr_codes",
      "shipping_tracks",
      "douyin_links",
      "accounts",
      "links",
    ];

    result.table_stats = {};

    for (const tableName of tableNames) {
      try {
        const { count, error } = await supabase
          .from(tableName)
          .select("*", { count: "exact", head: true });

        if (error) {
          result.table_stats[tableName] = { exists: false, error: error.message };
        } else {
          // 获取前3条数据预览
          const { data } = await supabase
            .from(tableName)
            .select("*")
            .limit(3)
            .order("id", { ascending: false });

          result.table_stats[tableName] = {
            exists: true,
            count: count || 0,
            sample: data || [],
          };
        }
      } catch (err: any) {
        result.table_stats[tableName] = { exists: false, error: err.message };
      }
    }

    // 检查 Storage 存储桶
    try {
      const { data: buckets, error: bucketsError } = await supabase
        .storage
        .listBuckets();

      if (bucketsError) {
        result.storage_error = bucketsError.message;
      } else {
        result.storage_buckets = buckets?.map(b => ({
          id: b.id,
          name: b.name,
          public: b.public,
          file_size_limit: b.file_size_limit,
        })) || [];
      }
    } catch (err: any) {
      result.storage_error = err.message;
    }

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: err.message,
      ...result,
    }, { status: 500 });
  }
}
