const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  assertNativeExecutableForTarget,
  nativeExecutableFormat,
  nativeExecutableMatchesTarget
} = require("./native-platform");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawmate-native-platform-"));

try {
  const elf = path.join(tempDir, "linux-bin");
  const macho = path.join(tempDir, "mac-bin");
  const pe = path.join(tempDir, "win.exe");

  fs.writeFileSync(elf, Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01]));
  fs.writeFileSync(macho, Buffer.from([0xcf, 0xfa, 0xed, 0xfe, 0x00, 0x00]));
  fs.writeFileSync(pe, Buffer.from([0x4d, 0x5a, 0x90, 0x00]));

  assert.equal(nativeExecutableFormat(elf), "elf");
  assert.equal(nativeExecutableFormat(macho), "macho");
  assert.equal(nativeExecutableFormat(pe), "pe");

  assert.equal(nativeExecutableMatchesTarget(elf, "linux"), true);
  assert.equal(nativeExecutableMatchesTarget(macho, "linux"), false);
  assert.equal(nativeExecutableMatchesTarget(pe, "win32"), true);

  assert.throws(
    () => assertNativeExecutableForTarget(macho, "linux", "backend"),
    /backend.*expected Linux ELF.*found macOS Mach-O/
  );
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log("native platform tests passed");
