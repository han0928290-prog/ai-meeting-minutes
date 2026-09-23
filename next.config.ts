import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ffmpeg 執行檔依平台安裝在各自的套件裡（require 路徑是動態的），不讓 bundler 打包
  serverExternalPackages: ["@ffmpeg-installer/ffmpeg"],
  // 部署時自動追蹤不到動態 require 的執行檔，明確把 Linux 版 ffmpeg 帶進會用到它的 API
  outputFileTracingIncludes: {
    "/api/meetings": ["./node_modules/@ffmpeg-installer/linux-x64/**/*"],
    "/api/meetings/*/chunks/*": ["./node_modules/@ffmpeg-installer/linux-x64/**/*"],
  },
};

export default nextConfig;
