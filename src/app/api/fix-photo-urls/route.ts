import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// GET /api/fix-photo-urls - 清理 inbound_records 表中 photo 字段的反引号
export async function GET() {
  try {
    // 获取所有有 photo 的记录
    const { data, error } = await supabase
      .from("inbound_records")
      .select("id, photo")
      .not("photo", "eq", "");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let fixedCount = 0;
    const errors: string[] = [];

    // 清理每条记录的 photo URL
    for (const record of data || []) {
      if (!record.photo) continue;
      
      const originalPhoto = String(record.photo);
      const cleanPhoto = originalPhoto.replace(/^`+|`+$/g, "").trim();
      
      if (originalPhoto !== cleanPhoto) {
        const { error: updateError } = await supabase
          .from("inbound_records")
          .update({ photo: cleanPhoto })
          .eq("id", record.id);
        
        if (updateError) {
          errors.push(`记录 ${record.id}: ${updateError.message}`);
        } else {
          fixedCount++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      totalRecords: data?.length || 0,
      fixedCount,
      errors: errors.slice(0, 10),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
