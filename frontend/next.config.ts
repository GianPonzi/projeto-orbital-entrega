import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Gera `.next/standalone/server.js` com só o que o servidor usa — é o que a
  // imagem Docker copia, sem `node_modules` inteiro (`output.md:24`).
  output: "standalone",
  logging: {
    browserToTerminal: true,
    // 'error' - errors only (default)
    // 'warn' - warnings and errors
    // 'true' - all console output
    // 'false' - disable
  },
};

export default nextConfig;
