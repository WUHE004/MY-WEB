import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
