import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  // 分页获取所有记录，避免默认1000条限制
  let allData: Record<string, any>[] = [];
  let page = 0;
  const pageSize = 1000;

  while (true) {
    const { data: chunk, error } = await supabase
      .from("inbound_records")
      .select("*")
      .range(page * pageSize, (page + 1) * pageSize - 1)
      .order("inbound_date", { ascending: false });

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