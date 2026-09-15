import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "react/index": "src/react/index.ts",
    "core/index": "src/core/index.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: false,
  minify: "terser",
  external: [
    "react",
    "react-dom",
    "@chakra-ui/react",
    "@powerduck/openapi-parser",
    "@powerduck/tree",
    "@powerduck/openapi-codegen",
    "@powerduck/md-editor",
  ],
  injectStyle: false,
});
