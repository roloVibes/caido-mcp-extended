#!/usr/bin/env node
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const distIndex = join(__dirname, "../dist/index.js");

import(distIndex).catch((err) => {
  console.error("Failed to start caido-mcp-extended:", err.message);
  console.error("Run 'npm run build' first if using from source.");
  process.exit(1);
});
