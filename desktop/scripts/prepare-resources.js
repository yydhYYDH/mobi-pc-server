const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  assertNativeExecutableForTarget,
  nativeExecutableMatchesTarget,
  removeIfIncompatible
} = require("./native-platform");

const desktopRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(desktopRoot, "..");
const frontendRoot = path.join(repoRoot, "frontend");
const configsRoot = path.join(repoRoot, "configs");
const exampleImagesRoot = path.join(repoRoot, "test", "data", "example", "pics");
const targetPlatform = normalizedTargetPlatform(process.env.PC_SERVER_DESKTOP_TARGET_PLATFORM || process.platform);
const targetArch = normalizedTargetArch();
const defaultResourcesDir = defaultResourcesDirectory(targetPlatform, targetArch);
const resourcesRoot = path.resolve(desktopRoot, process.env.PC_SERVER_DESKTOP_RESOURCES || defaultResourcesDir);
const frontendDist = path.join(frontendRoot, "dist");
const packagedFrontend = path.join(resourcesRoot, "frontend");
const packagedBackend = path.join(resourcesRoot, "backend");
const packagedConfigs = path.join(resourcesRoot, "configs");
const packagedExampleImages = path.join(resourcesRoot, "example-images");

function normalizedTargetPlatform(platform) {
  if (platform === "win" || platform === "windows") {
    return "win32";
  }
  if (platform === "mac" || platform === "macos") {
    return "darwin";
  }
  return platform;
}

function normalizedTargetArch() {
  const arch = process.env.PC_SERVER_DESKTOP_TARGET_ARCH || process.arch;
  if (arch === "x64" || arch === "x86_64") {
    return "x64";
  }
  if (arch === "arm64" || arch === "aarch64") {
    return "arm64";
  }
  return "arm64";
}

function defaultResourcesDirectory(platform, arch) {
  if (platform === "win32") {
    return `resources-win-${arch}`;
  }
  if (platform === "darwin") {
    return `resources-mac-${arch}`;
  }
  if (platform === "linux") {
    return `resources-linux-${arch}`;
  }
  return `resources-${platform}-${arch}`;
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32"
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
}

function copyDir(source, target) {
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, { recursive: true });
}

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function expectedBackendName() {
  return targetPlatform === "win32" ? "pc-server-backend.exe" : "pc-server-backend";
}

function expectedExecutableName(baseName) {
  return targetPlatform === "win32" ? `${baseName}.exe` : baseName;
}

function copyFileIfExists(source, target) {
  if (!source || !fs.existsSync(source)) {
    return false;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  fs.chmodSync(target, 0o755);
  return true;
}

function copyNativeFileIfCompatible(source, target, label) {
  if (!source || !fs.existsSync(source)) {
    return false;
  }
  if (!nativeExecutableMatchesTarget(source, targetPlatform)) {
    console.warn(`${label} skipped because it is not compatible with ${targetPlatform}: ${source}`);
    return false;
  }
  return copyFileIfExists(source, target);
}

function copyHdcRuntime(source, targetDirectory) {
  if (!source || !fs.existsSync(source)) {
    fs.mkdirSync(targetDirectory, { recursive: true });
    return false;
  }

  const executableName = expectedExecutableName("hdc");
  const sourceDirectory = path.dirname(source);
  const copied = copyFileIfExists(source, path.join(targetDirectory, executableName));
  const libraryNames =
    targetPlatform === "darwin"
      ? ["libusb_shared.dylib"]
      : targetPlatform === "win32"
        ? ["libusb_shared.dll"]
        : ["libusb_shared.so"];

  for (const libraryName of libraryNames) {
    copyFileIfExists(path.join(sourceDirectory, libraryName), path.join(targetDirectory, libraryName));
  }

  return copied;
}

function copyRuntimeDir(source, target) {
  if (!source || !fs.existsSync(source)) {
    return false;
  }
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    copyRuntimeEntry(path.join(source, entry.name), path.join(target, entry.name));
  }
  return true;
}

function copyRuntimeEntry(source, target) {
  const stats = fs.lstatSync(source);
  fs.rmSync(target, { recursive: true, force: true });

  if (stats.isSymbolicLink()) {
    fs.symlinkSync(fs.readlinkSync(source), target);
    return;
  }

  if (stats.isDirectory()) {
    fs.mkdirSync(target, { recursive: true });
    for (const entry of fs.readdirSync(source)) {
      copyRuntimeEntry(path.join(source, entry), path.join(target, entry));
    }
    return;
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  fs.chmodSync(target, stats.mode);
}

function copyWindowsDlls(source, target) {
  if (!source || !fs.existsSync(source)) {
    return false;
  }

  let copied = false;
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    if (entry.isDirectory()) {
      copied = copyWindowsDlls(sourcePath, target) || copied;
      continue;
    }
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".dll")) {
      continue;
    }
    if (nativeExecutableMatchesTarget(sourcePath, targetPlatform)) {
      copied = copyFileIfExists(sourcePath, path.join(target, entry.name)) || copied;
    }
  }
  return copied;
}

function spawnOutput(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: false
  });

  if (result.error || result.status !== 0) {
    return "";
  }

  return result.stdout || "";
}

function darwinRpaths(file) {
  return spawnOutput("otool", ["-l", file])
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("path "))
    .map((line) => line.split(/\s+/)[1])
    .filter(Boolean);
}

function patchDarwinRuntimeRpaths(directory) {
  if (targetPlatform !== "darwin" || !fs.existsSync(directory)) {
    return;
  }

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isFile()) {
      continue;
    }

    const file = path.join(directory, entry.name);
    if (entry.name !== "llama-server" && !entry.name.endsWith(".dylib")) {
      continue;
    }

    for (const rpath of darwinRpaths(file)) {
      if (path.isAbsolute(rpath)) {
        spawnSync("install_name_tool", ["-delete_rpath", rpath, file], { stdio: "ignore" });
      }
    }

    const currentRpaths = darwinRpaths(file);
    for (const rpath of ["@executable_path", "@loader_path"]) {
      if (!currentRpaths.includes(rpath)) {
        spawnSync("install_name_tool", ["-add_rpath", rpath, file], { stdio: "ignore" });
      }
    }
  }
}

function findOnPath(executable) {
  for (const segment of (process.env.PATH ?? "").split(path.delimiter)) {
    if (!segment) {
      continue;
    }
    const candidate = path.join(segment, executable);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return "";
}

function hostPlatformMatchesTarget() {
  return normalizedTargetPlatform(process.platform) === targetPlatform;
}

function hdcSourceCandidates() {
  const platformSpecificEnv =
    targetPlatform === "linux"
      ? process.env.HDC_BIN_LINUX
      : targetPlatform === "darwin"
        ? process.env.HDC_BIN_DARWIN
        : process.env.HDC_BIN_WIN;
  const candidates = [platformSpecificEnv, process.env.HDC_BIN];
  if (hostPlatformMatchesTarget()) {
    candidates.push(findOnPath("hdc"));
  }
  return candidates.filter(Boolean);
}

function copyTargetHdcRuntime(targetDirectory) {
  fs.mkdirSync(targetDirectory, { recursive: true });
  const target = path.join(targetDirectory, expectedExecutableName("hdc"));
  removeIfIncompatible(target, targetPlatform, "Existing bundled hdc");

  for (const source of hdcSourceCandidates()) {
    if (source.endsWith(".exe") && targetPlatform !== "win32") {
      continue;
    }
    if (!nativeExecutableMatchesTarget(source, targetPlatform)) {
      console.warn(`hdc skipped because it is not compatible with ${targetPlatform}: ${source}`);
      continue;
    }
    return copyHdcRuntime(source, targetDirectory);
  }
  return false;
}

function ensureGitkeep(directory) {
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, ".gitkeep"), "");
}

function removeLinuxRuntimeFiles(directory) {
  if (!fs.existsSync(directory)) {
    return;
  }

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      removeLinuxRuntimeFiles(entryPath);
      continue;
    }

    if (!entry.isFile() && !entry.isSymbolicLink()) {
      continue;
    }

    const extension = path.extname(entry.name);
    const isLinuxSharedObject = entry.name.includes(".so");
    const isLinuxExecutable = !extension && entry.name !== ".gitkeep";
    if (isLinuxSharedObject || isLinuxExecutable) {
      fs.rmSync(entryPath, { force: true });
    }
  }
}

function cleanPlatformRuntimeResources() {
  if (targetPlatform !== "win32") {
    return;
  }

  for (const directory of [
    packagedBackend,
    path.join(resourcesRoot, "mobiinfer"),
    path.join(resourcesRoot, "llama-cpp"),
    path.join(resourcesRoot, "hdc")
  ]) {
    removeLinuxRuntimeFiles(directory);
  }
}

function seedBackendExecutable() {
  const backendName = expectedBackendName();
  const sourceCandidates = [
    path.join(repoRoot, "backend", "dist", backendName)
  ];
  const target = path.join(packagedBackend, backendName);
  removeIfIncompatible(target, targetPlatform, "Existing backend executable");

  for (const source of sourceCandidates) {
    if (copyNativeFileIfCompatible(source, target, "Backend executable")) {
      return;
    }
  }
}

function prepareWindowsRuntimeResources() {
  const mobiinferDir = path.join(resourcesRoot, "mobiinfer");
  const llamaCppDir = path.join(resourcesRoot, "llama-cpp");
  const hdcDir = path.join(resourcesRoot, "hdc");
  const mobiinferBuildDir = path.join(
    repoRoot,
    "3rdparty",
    "mobiinfer",
    "apps",
    "mnncli",
    `build_mnncli_win_${targetArch}`
  );
  const legacyMobiinferBuildDir = path.join(
    repoRoot,
    "3rdparty",
    "mobiinfer",
    "apps",
    "mnncli",
    "build_mnncli_win"
  );

  const copiedMobiInfer =
    copyNativeFileIfCompatible(
      path.join(mobiinferBuildDir, "mnncli.exe"),
      path.join(mobiinferDir, "mnncli.exe"),
      "MobiInfer executable"
    ) ||
    copyNativeFileIfCompatible(
      path.join(legacyMobiinferBuildDir, "mnncli.exe"),
      path.join(mobiinferDir, "mnncli.exe"),
      "MobiInfer executable"
    );

  if (copiedMobiInfer) {
    copyWindowsDlls(mobiinferBuildDir, mobiinferDir);
    copyWindowsDlls(
      path.join(repoRoot, "3rdparty", "mobiinfer", `build_mnn_static_win_${targetArch}`),
      mobiinferDir
    );
    copyWindowsDlls(legacyMobiinferBuildDir, mobiinferDir);
    copyWindowsDlls(path.join(repoRoot, "3rdparty", "mobiinfer", "build_mnn_static_win"), mobiinferDir);
  }

  copyRuntimeDir(
    path.join(repoRoot, "3rdparty", "llama.cpp", `build-windows-${targetArch}`, "bin"),
    path.join(llamaCppDir, "cpu")
  ) ||
    copyRuntimeDir(
      path.join(repoRoot, "3rdparty", "llama.cpp", "build-windows", "bin"),
      path.join(llamaCppDir, "cpu")
    );
  copyRuntimeDir(
    path.join(repoRoot, "3rdparty", "llama.cpp", `build-cuda-windows-${targetArch}`, "bin"),
    path.join(llamaCppDir, "cuda")
  ) ||
    copyRuntimeDir(
      path.join(repoRoot, "3rdparty", "llama.cpp", "build-cuda-windows", "bin"),
      path.join(llamaCppDir, "cuda")
    );

  copyTargetHdcRuntime(hdcDir);
  for (const directory of [mobiinferDir, hdcDir]) {
    ensureGitkeep(directory);
  }
}

function prepareLinuxRuntimeResources() {
  const mobiinferDir = path.join(resourcesRoot, "mobiinfer");
  const llamaCppDir = path.join(resourcesRoot, "llama-cpp");
  const hdcDir = path.join(resourcesRoot, "hdc");
  const platformArch = `linux-${targetArch}`;

  copyNativeFileIfCompatible(
    path.join(repoRoot, "3rdparty", "mobiinfer", "apps", "mnncli", `build_mnncli_${platformArch}`, "mnncli"),
    path.join(mobiinferDir, "mnncli"),
    "MobiInfer executable"
  ) ||
    copyNativeFileIfCompatible(
      path.join(repoRoot, "3rdparty", "mobiinfer", "apps", "mnncli", "build_mnncli", "mnncli"),
      path.join(mobiinferDir, "mnncli"),
      "MobiInfer executable"
    );
  copyRuntimeDir(
    path.join(repoRoot, "3rdparty", "llama.cpp", `build-${platformArch}-cpu`, "bin"),
    path.join(llamaCppDir, "cpu")
  ) ||
    copyRuntimeDir(
      path.join(repoRoot, "3rdparty", "llama.cpp", "build-cpu-native", "bin"),
      path.join(llamaCppDir, "cpu")
    );
  copyRuntimeDir(
    path.join(repoRoot, "3rdparty", "llama.cpp", `build-${platformArch}-cuda`, "bin"),
    path.join(llamaCppDir, "cuda")
  ) ||
    copyRuntimeDir(
      path.join(repoRoot, "3rdparty", "llama.cpp", "build-cuda-native", "bin"),
      path.join(llamaCppDir, "cuda")
    );

  copyTargetHdcRuntime(hdcDir);

  for (const directory of [mobiinferDir, hdcDir]) {
    ensureGitkeep(directory);
  }
}

function prepareDarwinRuntimeResources() {
  const mobiinferDir = path.join(resourcesRoot, "mobiinfer");
  const llamaCppDir = path.join(resourcesRoot, "llama-cpp");
  const hdcDir = path.join(resourcesRoot, "hdc");
  const platformArch = `darwin-${targetArch}`;

  copyNativeFileIfCompatible(
    path.join(repoRoot, "3rdparty", "mobiinfer", "apps", "mnncli", `build_mnncli_${platformArch}`, "mnncli"),
    path.join(mobiinferDir, "mnncli"),
    "MobiInfer executable"
  ) ||
    copyNativeFileIfCompatible(
      path.join(repoRoot, "3rdparty", "mobiinfer", "apps", "mnncli", "build_mnncli", "mnncli"),
      path.join(mobiinferDir, "mnncli"),
      "MobiInfer executable"
    );

  const copiedLlamaCpp =
    copyRuntimeDir(
      path.join(repoRoot, "3rdparty", "llama.cpp", `build-${platformArch}-metal`, "bin"),
      path.join(llamaCppDir, "cpu")
    ) ||
    copyRuntimeDir(
      path.join(repoRoot, "3rdparty", "llama.cpp", `build-${platformArch}-cpu`, "bin"),
      path.join(llamaCppDir, "cpu")
    ) ||
    copyRuntimeDir(
      path.join(repoRoot, "3rdparty", "llama.cpp", "build-metal-native", "bin"),
      path.join(llamaCppDir, "cpu")
    ) ||
    copyRuntimeDir(
      path.join(repoRoot, "3rdparty", "llama.cpp", "build-cpu-native", "bin"),
      path.join(llamaCppDir, "cpu")
    ) ||
    copyRuntimeDir(
      path.join(repoRoot, "3rdparty", "llama.cpp", "build", "bin"),
      path.join(llamaCppDir, "cpu")
    );

  if (!copiedLlamaCpp) {
    fs.mkdirSync(path.join(llamaCppDir, "cpu"), { recursive: true });
  }
  patchDarwinRuntimeRpaths(path.join(llamaCppDir, "cpu"));

  copyTargetHdcRuntime(hdcDir);

  for (const directory of [mobiinferDir, hdcDir]) {
    ensureGitkeep(directory);
  }
}

run(npmCommand(), ["run", "build"], frontendRoot);

if (!fs.existsSync(frontendDist)) {
  throw new Error(`Frontend dist directory not found: ${frontendDist}`);
}

copyDir(frontendDist, packagedFrontend);
copyDir(configsRoot, packagedConfigs);
fs.rmSync(packagedExampleImages, { recursive: true, force: true });
fs.mkdirSync(packagedExampleImages, { recursive: true });
fs.copyFileSync(path.join(exampleImagesRoot, "taobao_1_4.jpg"), path.join(packagedExampleImages, "taobao_1_4.jpg"));
fs.mkdirSync(packagedBackend, { recursive: true });
fs.mkdirSync(path.join(resourcesRoot, "mobiinfer"), { recursive: true });
fs.mkdirSync(path.join(resourcesRoot, "llama-cpp"), { recursive: true });
fs.mkdirSync(path.join(resourcesRoot, "llama-cpp", "cpu"), { recursive: true });
fs.mkdirSync(path.join(resourcesRoot, "llama-cpp", "cuda"), { recursive: true });
fs.mkdirSync(path.join(resourcesRoot, "hdc"), { recursive: true });

seedBackendExecutable();

if (targetPlatform === "linux") {
  prepareLinuxRuntimeResources();
}
if (targetPlatform === "win32") {
  prepareWindowsRuntimeResources();
}
if (targetPlatform === "darwin") {
  prepareDarwinRuntimeResources();
}

cleanPlatformRuntimeResources();

const backendExecutable = path.join(packagedBackend, expectedBackendName());
if (!fs.existsSync(backendExecutable)) {
  const message =
    `Backend executable not found: ${backendExecutable}\n` +
    "Build it first with scripts/build-backend.sh on Linux/macOS or scripts/windows/build-backend.ps1 on Windows.";
  if (
    (targetPlatform === "win32" || targetPlatform === "darwin" || targetPlatform === "linux") &&
    process.env.PC_SERVER_ALLOW_MISSING_BACKEND !== "1"
  ) {
    throw new Error(message);
  }
  console.warn(message);
} else {
  assertNativeExecutableForTarget(backendExecutable, targetPlatform, "Backend executable");
}

const mobiinferExecutable = path.join(resourcesRoot, "mobiinfer", expectedExecutableName("mnncli"));
if (!fs.existsSync(mobiinferExecutable)) {
  const message =
    `MobiInfer executable not found: ${mobiinferExecutable}\n` +
    `Build MobiInfer mnncli and copy it to ${path.relative(desktopRoot, path.join(resourcesRoot, "mobiinfer"))} before packaging.`;
  console.warn(message);
} else {
  assertNativeExecutableForTarget(mobiinferExecutable, targetPlatform, "MobiInfer executable");
}

const hdcExecutable = path.join(resourcesRoot, "hdc", expectedExecutableName("hdc"));
if (!fs.existsSync(hdcExecutable)) {
  console.warn(
    `hdc executable not found: ${hdcExecutable}\n` +
      "The packaged app can still use hdc from PATH, but bundling hdc is recommended."
  );
} else {
  assertNativeExecutableForTarget(hdcExecutable, targetPlatform, "hdc executable");
}

const llamaCppCpuExecutable = path.join(resourcesRoot, "llama-cpp", "cpu", expectedExecutableName("llama-server"));
const llamaCppCudaExecutable = path.join(resourcesRoot, "llama-cpp", "cuda", expectedExecutableName("llama-server"));
const legacyLlamaCppExecutable = path.join(resourcesRoot, "llama-cpp", expectedExecutableName("llama-server"));
if (
  !fs.existsSync(llamaCppCpuExecutable) &&
  !fs.existsSync(llamaCppCudaExecutable) &&
  !fs.existsSync(legacyLlamaCppExecutable)
) {
  const llamaCppBuildHint =
    targetPlatform === "win32"
      ? "Build it with scripts/windows/build-llama-cpp.ps1 -Mode cpu."
      : targetPlatform === "darwin"
        ? "Build it with LLAMA_CPP_BUILD_MODE=metal ./scripts/build-llama-cpp.sh."
        : "Build it with LLAMA_CPP_BUILD_MODE=cpu or LLAMA_CPP_BUILD_MODE=cuda ./scripts/build-llama-cpp.sh.";
  console.warn(
    `llama.cpp server executable not found under ${path.join(resourcesRoot, "llama-cpp")}\n` +
      llamaCppBuildHint
  );
}
for (const [label, executable] of [
  ["llama.cpp CPU server", llamaCppCpuExecutable],
  ["llama.cpp CUDA server", llamaCppCudaExecutable],
  ["llama.cpp legacy server", legacyLlamaCppExecutable]
]) {
  if (fs.existsSync(executable)) {
    assertNativeExecutableForTarget(executable, targetPlatform, label);
  }
}
if (targetPlatform !== "darwin" && !fs.existsSync(llamaCppCudaExecutable)) {
  console.warn(
    `CUDA llama.cpp server executable not found: ${llamaCppCudaExecutable}\n` +
      "Build it with scripts/windows/build-llama-cpp.ps1 -Mode cuda if you want CUDA acceleration."
  );
}

console.log(`Prepared frontend resources at ${packagedFrontend}`);
console.log(`Prepared configs resources at ${packagedConfigs}`);
console.log(`Prepared example images at ${packagedExampleImages}`);
