import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: [
      { find: "@powerduck/oas-document/react/index.css", replacement: fileURLToPath(new URL("../src/react/OasDocument.css", import.meta.url)) },
      { find: "@powerduck/oas-document/react", replacement: fileURLToPath(new URL("../src/react/index.ts", import.meta.url)) },
    ],
  },
  server: { host: "127.0.0.1", port: 4173, strictPort: true },
});
