import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = mkdtempSync(join(tmpdir(), "pc-server-hdc-target-"));
const tscBin = process.platform === "win32"
  ? join(rootDir, "node_modules", ".bin", "tsc.cmd")
  : join(rootDir, "node_modules", ".bin", "tsc");

function run(command, args) {
  return spawnSync(command, args, {
    cwd: rootDir,
    stdio: "inherit"
  }).status ?? 1;
}

try {
  const compileStatus = run(tscBin, [
    "--outDir",
    outDir,
    "--module",
    "NodeNext",
    "--moduleResolution",
    "NodeNext",
    "--target",
    "ES2020",
    "--skipLibCheck",
    "--strict",
    "--lib",
    "ES2020,DOM",
    "src/domain/hdcTarget.ts",
    "tests/hdcTarget.test.ts"
  ]);
  if (compileStatus !== 0) {
    process.exit(compileStatus);
  }

  process.exit(run(process.execPath, [join(outDir, "tests", "hdcTarget.test.js")]));
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
