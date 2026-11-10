import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Reachable from laptop, PC and phone in the same network (http://<IP>:5173/terminal).
    host: true,
    proxy: {
      "/api": "http://localhost:4000",
      "/media": "http://localhost:4000",
    },
  },
});
