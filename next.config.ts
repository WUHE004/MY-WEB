import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // sharp 的 libvips 二进制（.so）通过 dlopen 动态加载，文件追踪无法自动发现，
  // 需显式包含进 serverless 函数包，否则 Vercel 上报 ERR_DLOPEN_FAILED: libvips-cpp.so
  outputFileTracingIncludes: {
    "/api/import/photos": ["./node_modules/@img/**"],
    "/api/import/supplement-photos": ["./node_modules/@img/**"],
    "/api/photo-gen/agnes": ["./node_modules/@img/**"],
    "/api/photo-gen/generate": ["./node_modules/@img/**"],
    "/api/photo-gen/video": ["./node_modules/@img/**"],
    "/api/query-product": ["./node_modules/@img/**"],
    "/api/upload/model-photo": ["./node_modules/@img/**"],
    "/api/webhook/wechat-bot": ["./node_modules/@img/**"],
  },
  images: {
    remotePatterns: [
      // Supabase Storage（商品图片、用户上传图片等）
      {
        protocol: "https",
        hostname: "**.supabase.co",
        pathname: "/storage/**",
      },
      // Trae 文生图 API（AI 生成的图片）
      {
        protocol: "https",
        hostname: "trae-api-cn.mchost.guru",
        pathname: "/api/ide/**",
      },
    ],
  },
};

export default nextConfig;
