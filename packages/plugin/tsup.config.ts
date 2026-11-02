import { defineConfig } from "tsup";

export default defineConfig({
  entry: { mcp: "src/mcp.ts", hook: "src/hook.ts" },
  format: ["esm"],
  platform: "node",
  target: "node22",
  bundle: true,
  noExternal: [/.*/],
  splitting: false,
  sourcemap: true,
  clean: true,
  minify: false,
  banner: {
    js: "import { createRequire as __agentGcCreateRequire } from 'node:module'; const require = __agentGcCreateRequire(import.meta.url);",
  },
});
