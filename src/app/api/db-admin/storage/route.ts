import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// GET: 获取所有 storage buckets 和文件列表
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const bucket = searchParams.get("bucket") || "";
    const path = searchParams.get("path") || "";

    if (!bucket) {
      // 列出所有 buckets
      const { data: buckets, error } = await supabase.storage.listBuckets();
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const bucketList = await Promise.all(
        (buckets || []).map(async (b) => {
          // 获取每个 bucket 的根目录文件以计算大小
          const { data: files } = await supabase.storage.from(b.name).list();
          const totalSize = (files || []).reduce((sum, f) => {
            const meta = (f as { metadata?: { size?: number } }).metadata;
            return sum + (meta?.size || 0);
          }, 0);
          return {
            id: b.id,
            name: b.name,
            public: b.public,
            fileCount: (files || []).length,
            totalSize,
          };
        })
      );

      return NextResponse.json({ buckets: bucketList });
    }

    // 列出指定 bucket 下的文件
    const { data: files, error } = await supabase.storage.from(bucket).list(path, {
      sortBy: { column: "name", order: "asc" },
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const fileList = (files || []).map((f) => ({
      name: f.name,
      id: f.id,
      size: (f as { metadata?: { size?: number } }).metadata?.size || 0,
      created_at: f.created_at,
      updated_at: f.updated_at,
      isFolder: !f.id, // 文件夹没有 id
    }));

    return NextResponse.json({
      bucket,
      path,
      files: fileList,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE: 删除文件
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const bucket = searchParams.get("bucket");
    const filePath = searchParams.get("path");

    if (!bucket || !filePath) {
      return NextResponse.json({ error: "缺少 bucket 或 path 参数" }, { status: 400 });
    }

    const { error } = await supabase.storage.from(bucket).remove([filePath]);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}