import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const saleId = searchParams.get("sale_id");

  // 按 sale_id 查询某商品的所有入库记录（用于补录时获取商品详情）
  if (saleId) {
    const { data, error } = await supabase
      .from("inbound_records")
      .select("*")
      .eq("sale_id", saleId.toUpperCase())
      .order("inbound_date", { ascending: false });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data || []);
  }

  // 并行拉取全表：count + 全页并行（原先逐页串行，2s+ → ~1s）
  // 排序加 id 次级键保证分页确定性
  const PAGE_SIZE = 1000;
  const { count, error: countErr } = await supabase
    .from("inbound_records")
    .select("*", { count: "exact", head: true });

  if (countErr) {
    return NextResponse.json({ error: countErr.message }, { status: 500 });
  }

  let allData: Record<string, any>[] = [];
  if (count && count > 0) {
    const pages = Math.ceil(count / PAGE_SIZE) + 1;
    const results = await Promise.all(
      Array.from({ length: pages }, (_, p) =>
        supabase
          .from("inbound_records")
          .select("*")
          .order("inbound_date", { ascending: false })
          .order("id", { ascending: false })
          .range(p * PAGE_SIZE, (p + 1) * PAGE_SIZE - 1)
      )
    );
    for (const r of results) {
      if (r.error) {
        return NextResponse.json({ error: r.error.message }, { status: 500 });
      }
      if (r.data) allData = allData.concat(r.data as Record<string, any>[]);
    }
  }

  return NextResponse.json(allData);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const totalStock =
      Number(body.size_80 || 0) +
      Number(body.size_90 || 0) +
      Number(body.size_95 || 0) +
      Number(body.size_100 || 0) +
      Number(body.size_105 || 0) +
      Number(body.size_110 || 0) +
      Number(body.size_120 || 0) +
      Number(body.size_130 || 0) +
      Number(body.size_140 || 0) +
      Number(body.size_150 || 0) +
      Number(body.size_160 || 0) +
      Number(body.size_170 || 0) +
      Number(body.size_180 || 0);

    const record = {
      inbound_date: body.inbound_date || new Date().toISOString(),
      sale_id: body.sale_id || "",
      photo: (body.photo && body.photo !== "0" && String(body.photo).trim() !== "0") 
        ? String(body.photo).replace(/^`+|`+$/g, "").trim() 
        : "",
      name: (body.name && body.name !== "0" && String(body.name).trim() !== "0") ? body.name : "",
      manufacturer: body.manufacturer || "",
      size_80: Number(body.size_80) || 0,
      size_90: Number(body.size_90) || 0,
      size_95: Number(body.size_95) || 0,
      size_100: Number(body.size_100) || 0,
      size_105: Number(body.size_105) || 0,
      size_110: Number(body.size_110) || 0,
      size_120: Number(body.size_120) || 0,
      size_130: Number(body.size_130) || 0,
      size_140: Number(body.size_140) || 0,
      size_150: Number(body.size_150) || 0,
      size_160: Number(body.size_160) || 0,
      size_170: Number(body.size_170) || 0,
      size_180: Number(body.size_180) || 0,
      shelf_no: body.shelf_no || "",
      total_stock: totalStock,
      cost_price: Number(body.cost_price) || 0,
      season: body.season || "",
      style_category: body.style_category || "",
      notes: body.notes || "",
    };

    const { data, error } = await supabase
      .from("inbound_records")
      .insert(record)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

// PUT: 编辑入库记录
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { sale_id, ...fields } = body;

    if (!sale_id) {
      return NextResponse.json({ error: "sale_id 不能为空" }, { status: 400 });
    }

    // 计算 total_stock
    const updateData: Record<string, unknown> = {};

    if (fields.photo !== undefined) updateData.photo = String(fields.photo).replace(/^`+|`+$/g, "").trim();
    if (fields.name !== undefined) updateData.name = fields.name;
    if (fields.manufacturer !== undefined) updateData.manufacturer = fields.manufacturer;
    if (fields.cost_price !== undefined) updateData.cost_price = Number(fields.cost_price) || 0;
    if (fields.shelf_no !== undefined) updateData.shelf_no = fields.shelf_no;
    if (fields.sell_price !== undefined) updateData.sell_price = Number(fields.sell_price) || 0;
    if (fields.season !== undefined) updateData.season = fields.season;
    if (fields.style_category !== undefined) updateData.style_category = fields.style_category;
    if (fields.notes !== undefined) updateData.notes = fields.notes;

    // 尺码字段
    let totalStock = 0;
    for (const s of [80, 90, 95, 100, 105, 110, 120, 130, 140, 150, 160, 170, 180]) {
      if (fields[`size_${s}`] !== undefined) {
        const val = Number(fields[`size_${s}`]) || 0;
        updateData[`size_${s}`] = val;
        totalStock += val;
      }
    }

    if (totalStock > 0 || Object.keys(updateData).some((k) => k.startsWith("size_"))) {
      // 如果修改了尺码，需要重新计算 total_stock
      // 先获取现有记录中未修改的尺码值
      const { data: existing } = await supabase
        .from("inbound_records")
        .select("size_80,size_90,size_95,size_100,size_105,size_110,size_120,size_130,size_140,size_150,size_160,size_170,size_180")
        .eq("sale_id", sale_id)
        .maybeSingle();

      let calculatedTotal = totalStock;
      if (existing) {
        const ex = existing as Record<string, unknown>;
        for (const s of [80, 90, 95, 100, 105, 110, 120, 130, 140, 150, 160, 170, 180]) {
          if (fields[`size_${s}`] === undefined) {
            calculatedTotal += Number(ex[`size_${s}`]) || 0;
          }
        }
      }
      updateData.total_stock = calculatedTotal;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "没有需要更新的字段" }, { status: 400 });
    }

    const { error } = await supabase
      .from("inbound_records")
      .update(updateData)
      .eq("sale_id", sale_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ message: "更新成功", sale_id, updated: Object.keys(updateData) });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}