import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// POST /api/setup-settings - 初始化 settings 表
export async function POST() {
  try {
    // 尝试创建 settings 表
    const { error: createError } = await supabase.rpc("create_settings_table" as never);
    if (createError) {
      // 如果 RPC 不存在，尝试直接用 SQL
      // 这里我们通过尝试插入来检测表是否存在
    }

    // 尝试 upsert 默认数据
    const defaults = {
      size_styles: ["T恤", "裤子", "裙子", "外套", "卫衣", "套装", "连体衣", "羽绒服", "衬衫", "内衣", "其他"],
      no_size_styles: ["母婴", "日用", "配饰"],
      shelf_data: { A: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], B: [1, 2], C: [1, 2, 3, 4, 5] },
      manufacturers: [
        "大炳家", "小礼物", "海燕家", "曾姐姐", "程祥家", "老刘家",
        "茶七厘家", "大咖家", "梓东家", "米可鑫家", "红姐家", "一鸣家",
        "小渔家", "奇布鲁家", "笨笨家", "小绵羊家", "婴时尚家", "啊正家",
        "钱多多家", "化磊家", "喜宝家", "收购家", "衣品汇家", "程哲家",
        "梨子家", "韩瑞家", "静静家", "衣鞋柜家", "晓晓家", "晓丽家",
        "甜妈家", "番薯家", "圆啊圆", "可乐家", "可可家", "凑凑",
        "童优格", "艾衣诺", "幸运儿", "丹丹家", "百变童年", "大妞童装",
        "阿勇", "丫丫家", "陈丽家",
      ],
    };

    const results = [];
    for (const [key, value] of Object.entries(defaults)) {
      const { error } = await supabase
        .from("settings")
        .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });

      if (error) {
        results.push({ key, error: error.message });
      } else {
        results.push({ key, status: "ok" });
      }
    }

    const hasErrors = results.some((r) => "error" in r);
    return NextResponse.json({
      results,
      message: hasErrors
        ? "部分初始化失败，请确保 settings 表已创建（执行 src/lib/settings-schema.sql）"
        : "设置初始化完成",
    });
  } catch (err) {
    return NextResponse.json(
      { error: "初始化失败，请手动在 Supabase SQL Editor 执行 src/lib/settings-schema.sql" },
      { status: 500 }
    );
  }
}