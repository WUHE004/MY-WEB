import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// GET: 获取所有成员的选品列表
export async function GET() {
  try {
    const { data, error } = await supabase
      .from("live_selections")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 按成员分组统计
    const memberMap: Record<string, { member_name: string; sale_ids: string[]; count: number }> = {};
    for (const row of data || []) {
      const name = row.member_name;
      if (!memberMap[name]) {
        memberMap[name] = { member_name: name, sale_ids: [], count: 0 };
      }
      memberMap[name].sale_ids.push(row.sale_id);
      memberMap[name].count = memberMap[name].sale_ids.length;
    }

    return NextResponse.json({
      selections: data || [],
      members: Object.values(memberMap),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// POST: 同步选品（替换该成员的全部选品）
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { member_name, sale_ids } = body as { member_name: string; sale_ids: string[] };

    if (!member_name) {
      return NextResponse.json({ error: "缺少 member_name" }, { status: 400 });
    }

    // 删除该成员旧选品
    await supabase.from("live_selections").delete().eq("member_name", member_name);

    // 插入新选品
    if (sale_ids && sale_ids.length > 0) {
      const rows = sale_ids.map((sid) => ({
        member_name,
        sale_id: sid,
      }));
      const { error } = await supabase.from("live_selections").insert(rows);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// DELETE: 清空某成员的选品，或清空所有成员选品（all=true）
export async function DELETE(request: NextRequest) {
  try {
    let member_name: string | null = null;
    let clearAll = false;
    const { searchParams } = new URL(request.url);
    member_name = searchParams.get("member_name");
    clearAll = searchParams.get("all") === "true";

    // 也支持从 body 获取
    if (!member_name && !clearAll) {
      try {
        const body = await request.json();
        member_name = body.member_name;
        clearAll = body.all === true;
      } catch { /* ignore */ }
    }

    if (!member_name && !clearAll) {
      return NextResponse.json({ error: "缺少 member_name 或 all 参数" }, { status: 400 });
    }

    let error: any = null;
    if (clearAll) {
      const res = await supabase.from("live_selections").delete().neq("member_name", "");
      error = res.error;
    } else {
      const res = await supabase.from("live_selections").delete().eq("member_name", member_name);
      error = res.error;
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}