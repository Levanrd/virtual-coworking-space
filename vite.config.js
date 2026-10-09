import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiTarget = process.env.CG_API_TARGET || "http://127.0.0.1:3001";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          three: ["three"],
          react: ["react", "react-dom"],
          socket: ["socket.io-client"],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/socket.io": { target: apiTarget, ws: true },
      "/api": { target: apiTarget, changeOrigin: false },
    },
  },
});
