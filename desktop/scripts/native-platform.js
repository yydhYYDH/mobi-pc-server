const fs = require("node:fs");

const FORMAT_LABELS = {
  elf: "Linux ELF",
  macho: "macOS Mach-O",
  pe: "Windows PE",
  unknown: "unknown binary format"
};

const EXPECTED_FORMAT_BY_PLATFORM = {
  darwin: "macho",
  linux: "elf",
  win32: "pe"
};

function nativeExecutableFormat(file) {
  if (!file || !fs.existsSync(file)) {
    return "unknown";
  }

  const header = fs.readFileSync(file, { flag: "r" }).subarray(0, 4);
  if (header.length < 2) {
    return "unknown";
  }

  if (header[0] === 0x7f && header[1] === 0x45 && header[2] === 0x4c && header[3] === 0x46) {
    return "elf";
  }

  if (header[0] === 0x4d && header[1] === 0x5a) {
    return "pe";
  }

  const hex = [...header].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  if (["feedface", "cefaedfe", "feedfacf", "cffaedfe", "cafebabe", "bebafeca"].includes(hex)) {
    return "macho";
  }

  return "unknown";
}

function expectedFormatForTarget(targetPlatform) {
  return EXPECTED_FORMAT_BY_PLATFORM[targetPlatform] ?? "unknown";
}

function nativeExecutableMatchesTarget(file, targetPlatform) {
  const expected = expectedFormatForTarget(targetPlatform);
  if (expected === "unknown") {
    return true;
  }
  return nativeExecutableFormat(file) === expected;
}

function assertNativeExecutableForTarget(file, targetPlatform, label) {
  if (nativeExecutableMatchesTarget(file, targetPlatform)) {
    return;
  }

  const expected = FORMAT_LABELS[expectedFormatForTarget(targetPlatform)] ?? FORMAT_LABELS.unknown;
  const actual = FORMAT_LABELS[nativeExecutableFormat(file)] ?? FORMAT_LABELS.unknown;
  throw new Error(`${label} has incompatible native format: expected ${expected}, found ${actual}: ${file}`);
}

function removeIfIncompatible(file, targetPlatform, label) {
  if (!fs.existsSync(file) || nativeExecutableMatchesTarget(file, targetPlatform)) {
    return false;
  }

  const expected = FORMAT_LABELS[expectedFormatForTarget(targetPlatform)] ?? FORMAT_LABELS.unknown;
  const actual = FORMAT_LABELS[nativeExecutableFormat(file)] ?? FORMAT_LABELS.unknown;
  fs.rmSync(file, { force: true });
  console.warn(`${label} removed because it targets ${actual}; expected ${expected}: ${file}`);
  return true;
}

module.exports = {
  assertNativeExecutableForTarget,
  expectedFormatForTarget,
  nativeExecutableFormat,
  nativeExecutableMatchesTarget,
  removeIfIncompatible
};
