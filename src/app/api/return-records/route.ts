import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { upsertReturnsSummary } from "@/app/api/returns-summary/route";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const saleId = searchParams.get("sale_id");

  // 分页获取所有记录，避免默认1000条限制
  let allData: Record<string, any>[] = [];
  let page = 0;
  const pageSize = 1000;

  if (saleId) {
    // 有筛选条件时，直接查询（结果通常不会超过1000条）
    const { data, error } = await supabase
      .from("return_records")
      .select("*")
      .eq("sale_id", saleId)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data);
  }

  // 无筛选条件时，分页获取全部数据
  while (true) {
    const { data: chunk, error } = await supabase
      .from("return_records")
      .select("*")
      .range(page * pageSize, (page + 1) * pageSize - 1)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!chunk || chunk.length === 0) break;
    allData = allData.concat(chunk);
    if (chunk.length < pageSize) break;
    page++;
  }

  return NextResponse.json(allData);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const records = Array.isArray(body) ? body : [body];

    const inserted = [];
    for (const record of records) {
      const row = {
        sale_id: record.sale_id || "",
        size: Number(record.size) || 0,
        quantity: Number(record.quantity) || 0,
        return_price: Number(record.return_price) || 0,
        remarks: record.remarks || "",
        registrant: record.registrant || "",
        return_time: (record.return_time && record.return_time !== "0") ? record.return_time : new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from("return_records")
        .insert(row)
        .select()
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      inserted.push(data);

      // 更新退货总表
      upsertReturnsSummary(record.sale_id || "").catch((e) => console.error("upsert returns summary error:", e));
    }

    return NextResponse.json(inserted, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

// PUT: 编辑退货记录（按 sale_id + size 修改总数量）
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { sale_id, size, quantity } = body;

    if (!sale_id || !size) {
      return NextResponse.json({ error: "sale_id 和 size 不能为空" }, { status: 400 });
    }

    const newQty = Number(quantity) || 0;

    // 查询当前该 sale_id + size 的总数量
    const { data: existing, error: fetchErr } = await supabase
      .from("return_records")
      .select("id, quantity, return_price")
      .eq("sale_id", sale_id)
      .eq("size", Number(size))
      .order("created_at", { ascending: false });

    if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }

    const currentTotal = (existing || []).reduce((sum, r) => sum + (Number(r.quantity) || 0), 0);
    const delta = newQty - currentTotal;

    if (delta === 0) {
      return NextResponse.json({ message: "无需更新", currentTotal, newTotal: newQty });
    }

    if (delta > 0) {
      // 需要增加：创建一条新记录
      const latest = (existing && existing.length > 0) ? existing[0] : null;
      const newRecord = {
        sale_id,
        size: Number(size),
        quantity: delta,
        return_price: latest?.return_price ?? 0,
        remarks: "编辑补录",
        registrant: "管理员",
        return_time: new Date().toISOString(),
      };

      const { error: insertErr } = await supabase
        .from("return_records")
        .insert(newRecord);

      if (insertErr) {
        return NextResponse.json({ error: insertErr.message }, { status: 400 });
      }

      // 更新退货总表
      upsertReturnsSummary(sale_id).catch((e) => console.error("upsert returns summary error:", e));

      return NextResponse.json({ message: "已增加", delta, currentTotal, newTotal: newQty });
    } else {
      // 需要减少：从最新记录开始扣减
      let remaining = Math.abs(delta);
      const sorted = (existing || []).sort((a, b) => (b.id || 0) - (a.id || 0));

      for (const record of sorted) {
        if (remaining <= 0) break;
        const currentQty = Number(record.quantity) || 0;
        const toRemove = Math.min(currentQty, remaining);

        if (toRemove >= currentQty) {
          await supabase.from("return_records").delete().eq("id", record.id);
        } else {
          await supabase
            .from("return_records")
            .update({ quantity: currentQty - toRemove })
            .eq("id", record.id);
        }
        remaining -= toRemove;
      }

      // 更新退货总表
      upsertReturnsSummary(sale_id).catch((e) => console.error("upsert returns summary error:", e));

      return NextResponse.json({ message: "已减少", delta, currentTotal, newTotal: newQty });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}