import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// GET: 获取所有打包记录（含关联商品）
export async function GET() {
  try {
    const { data: records, error } = await supabase
      .from("pack_records")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 获取所有关联商品
    const { data: items } = await supabase
      .from("pack_items")
      .select("*")
      .order("created_at", { ascending: true });

    const result = (records || []).map((record) => ({
      ...record,
      items: (items || []).filter((item) => item.pack_id === record.id),
    }));

    return NextResponse.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST: 创建打包记录
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tracking_number, items, submitter, status } = body;

    if (!tracking_number) {
      return NextResponse.json({ error: "面单号不能为空" }, { status: 400 });
    }

    // 创建打包记录
    const { data: record, error: recordErr } = await supabase
      .from("pack_records")
      .insert({
        tracking_number: tracking_number.trim(),
        status: status || "pending",
        submitter: submitter || "",
        packer: "",
      })
      .select()
      .single();

    if (recordErr) {
      return NextResponse.json({ error: recordErr.message }, { status: 400 });
    }

    // 插入关联商品
    if (items && Array.isArray(items) && items.length > 0) {
      const packItems = items.map((item: Record<string, unknown>) => ({
        pack_id: record.id,
        sale_id: item.sale_id || "",
        photo: item.photo || "",
        product_name: item.product_name || "",
        size: Number(item.size) || 0,
        quantity: Number(item.quantity) || 0,
        sell_price: Number(item.sell_price) || 0,
        shelf_no: item.shelf_no || "",
        order_time: item.order_time || "",
        manufacturer: item.manufacturer || "",
      }));

      const { error: itemsErr } = await supabase.from("pack_items").insert(packItems);
      if (itemsErr) {
        return NextResponse.json({ error: itemsErr.message }, { status: 400 });
      }
    }

    return NextResponse.json({ ...record, items: items || [] }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

// PUT: 更新打包记录状态
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, status, packer } = body;

    if (!id) {
      return NextResponse.json({ error: "记录ID不能为空" }, { status: 400 });
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (status) updates.status = status;
    if (packer !== undefined) updates.packer = packer;

    const { data, error } = await supabase
      .from("pack_records")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(data);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

// DELETE: 删除打包记录及其关联商品
// ?id=xxx 删除单条；?all=true 清空所有记录
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const all = searchParams.get("all") === "true";

    if (all) {
      // 清空所有 pack_items 和 pack_records
      const { error: itemsErr } = await supabase.from("pack_items").delete().neq("id", 0);
      if (itemsErr) {
        return NextResponse.json({ error: itemsErr.message }, { status: 400 });
      }
      const { error: recordErr } = await supabase.from("pack_records").delete().neq("id", 0);
      if (recordErr) {
        return NextResponse.json({ error: recordErr.message }, { status: 400 });
      }
      return NextResponse.json({ success: true, cleared: true });
    }

    if (!id) {
      return NextResponse.json({ error: "记录ID不能为空" }, { status: 400 });
    }

    // 先删除关联的 pack_items
    const { error: itemsErr } = await supabase
      .from("pack_items")
      .delete()
      .eq("pack_id", Number(id));

    if (itemsErr) {
      return NextResponse.json({ error: itemsErr.message }, { status: 400 });
    }

    // 再删除 pack_records
    const { error: recordErr } = await supabase
      .from("pack_records")
      .delete()
      .eq("id", Number(id));

    if (recordErr) {
      return NextResponse.json({ error: recordErr.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}