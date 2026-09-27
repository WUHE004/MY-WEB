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

    // 直播改价表(sale_id → 新售价), 存于 settings.live_prices
    const { data: priceRow } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "live_prices")
      .single();
    const prices = (priceRow?.value as Record<string, number>) || {};

    return NextResponse.json({
      selections: data || [],
      members: Object.values(memberMap),
      prices,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// POST: 切换单个选品（管理栏总表选品模式调用, 按天独立记录）
// add: 选品(同编号同一天只保留一条, 不影响往日记录); remove: 取消选品(仅删除今日记录)
// price: 修改直播售价(存入 settings.live_prices, price 为 null 表示清除改价)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { member_name, sale_id, action, price } = body as {
      member_name: string; sale_id: string; action: "add" | "remove" | "price"; price?: number | null;
    };

    if (!member_name || !sale_id) {
      return NextResponse.json({ error: "缺少 member_name 或 sale_id" }, { status: 400 });
    }

    // 改价: 独立于选品状态, 只在直播选品卡片角标位置显示
    if (action === "price") {
      const { data: cur } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "live_prices")
        .single();
      const map: Record<string, number> = { ...((cur?.value as Record<string, number>) || {}) };
      if (price === null || price === undefined || Number.isNaN(Number(price))) {
        delete map[sale_id];
      } else {
        map[sale_id] = Number(price);
      }
      const { error: upErr } = await supabase
        .from("settings")
        .upsert({ key: "live_prices", value: map, updated_at: new Date().toISOString() }, { onConflict: "key" });
      if (upErr) {
        return NextResponse.json({ error: upErr.message }, { status: 500 });
      }
      return NextResponse.json({ success: true });
    }

    // 北京时间今日区间 [start, end): 今日选品/取消只影响今日记录, 往日记录保留
    const now = new Date();
    const bj = new Date(now.getTime() + (8 * 60 + now.getTimezoneOffset()) * 60000);
    const start = new Date(Date.UTC(bj.getFullYear(), bj.getMonth(), bj.getDate()) - 8 * 3600000);
    const end = new Date(start.getTime() + 24 * 3600000);

    if (action === "remove") {
      // 取消选品: 只删除今日记录, 往日记录保留
      const { error: delErr } = await supabase
        .from("live_selections")
        .delete()
        .eq("sale_id", sale_id)
        .gte("created_at", start.toISOString())
        .lt("created_at", end.toISOString());
      if (delErr) {
        return NextResponse.json({ error: delErr.message }, { status: 500 });
      }
      return NextResponse.json({ success: true });
    }

    // 选品: 同编号同一天已有记录则不重复插入
    const { data: existing } = await supabase
      .from("live_selections")
      .select("id")
      .eq("sale_id", sale_id)
      .gte("created_at", start.toISOString())
      .lt("created_at", end.toISOString())
      .limit(1);
    if (existing && existing.length > 0) {
      return NextResponse.json({ success: true });
    }

    const { error } = await supabase.from("live_selections").insert([{ member_name, sale_id }]);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// DELETE: 按记录 id 批量删除(直播选品编辑模式取消选品用), 或清空某成员的选品, 或清空所有成员选品（all=true）
export async function DELETE(request: NextRequest) {
  try {
    let member_name: string | null = null;
    let clearAll = false;
    let ids: string[] = [];
    const { searchParams } = new URL(request.url);
    member_name = searchParams.get("member_name");
    clearAll = searchParams.get("all") === "true";
    const idsParam = searchParams.get("ids");
    if (idsParam) ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean);

    // 也支持从 body 获取
    if (!member_name && !clearAll && ids.length === 0) {
      try {
        const body = await request.json();
        member_name = body.member_name;
        clearAll = body.all === true;
        if (Array.isArray(body.ids)) ids = body.ids.filter(Boolean);
      } catch { /* ignore */ }
    }

    if (ids.length > 0) {
      // 按记录 id 精确删除(编辑模式取消某天某条选品)
      const { error: delErr } = await supabase.from("live_selections").delete().in("id", ids);
      if (delErr) {
        return NextResponse.json({ error: delErr.message }, { status: 500 });
      }
      return NextResponse.json({ success: true });
    }

    if (!member_name && !clearAll) {
      return NextResponse.json({ error: "缺少 member_name、all 或 ids 参数" }, { status: 400 });
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