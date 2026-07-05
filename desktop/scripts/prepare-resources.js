const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const desktopRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(desktopRoot, "..");
const frontendRoot = path.join(repoRoot, "frontend");
const configsRoot = path.join(repoRoot, "configs");
const exampleImagesRoot = path.join(repoRoot, "test", "data", "example", "pics");
const resourcesRoot = path.join(desktopRoot, "resources");
const frontendDist = path.join(frontendRoot, "dist");
const packagedFrontend = path.join(resourcesRoot, "frontend");
const packagedBackend = path.join(resourcesRoot, "backend");
const packagedConfigs = path.join(resourcesRoot, "configs");
const packagedExampleImages = path.join(resourcesRoot, "example-images");

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
  return process.platform === "win32" ? "pc-server-backend.exe" : "pc-server-backend";
}

function expectedExecutableName(baseName) {
  return process.platform === "win32" ? `${baseName}.exe` : baseName;
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

function ensureGitkeep(directory) {
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, ".gitkeep"), "");
}

function prepareLinuxRuntimeResources() {
  const mnnDir = path.join(resourcesRoot, "mnn");
  const mobiinferDir = path.join(resourcesRoot, "mobiinfer");
  const llamaCppDir = path.join(resourcesRoot, "llama-cpp");
  const hdcDir = path.join(resourcesRoot, "hdc");

  copyFileIfExists(
    path.join(repoRoot, "3rdparty", "MNN", "apps", "mnncli", "build_mnncli", "mnncli"),
    path.join(mnnDir, "mnncli")
  );
  copyFileIfExists(
    path.join(repoRoot, "3rdparty", "mobiinfer", "apps", "mnncli", "build_mnncli", "mnncli"),
    path.join(mobiinferDir, "mnncli")
  );
  copyRuntimeDir(
    path.join(repoRoot, "3rdparty", "llama.cpp", "build-cpu-native", "bin"),
    path.join(llamaCppDir, "cpu")
  );
  copyRuntimeDir(
    path.join(repoRoot, "3rdparty", "llama.cpp", "build-cuda-native", "bin"),
    path.join(llamaCppDir, "cuda")
  );

  const hdcSource = process.env.HDC_BIN || findOnPath("hdc");
  if (hdcSource && !hdcSource.endsWith(".exe")) {
    copyFileIfExists(hdcSource, path.join(hdcDir, "hdc"));
  } else {
    fs.mkdirSync(hdcDir, { recursive: true });
  }

  for (const directory of [mnnDir, mobiinferDir, hdcDir]) {
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
fs.copyFileSync(path.join(exampleImagesRoot, "taobao_full_1.jpg"), path.join(packagedExampleImages, "taobao_full_1.jpg"));
fs.mkdirSync(packagedBackend, { recursive: true });
fs.mkdirSync(path.join(resourcesRoot, "mnn"), { recursive: true });
fs.mkdirSync(path.join(resourcesRoot, "mobiinfer"), { recursive: true });
fs.mkdirSync(path.join(resourcesRoot, "llama-cpp"), { recursive: true });
fs.mkdirSync(path.join(resourcesRoot, "llama-cpp", "cpu"), { recursive: true });
fs.mkdirSync(path.join(resourcesRoot, "llama-cpp", "cuda"), { recursive: true });
fs.mkdirSync(path.join(resourcesRoot, "hdc"), { recursive: true });

if (process.platform === "linux") {
  prepareLinuxRuntimeResources();
}

const backendExecutable = path.join(packagedBackend, expectedBackendName());
if (!fs.existsSync(backendExecutable)) {
  const message =
    `Backend executable not found: ${backendExecutable}\n` +
    "Build it first with scripts/build-backend.sh on Linux or scripts/windows/build-backend.ps1 on Windows.";
  if (process.platform === "win32") {
    throw new Error(message);
  }
  console.warn(message);
}

const mnnExecutable = path.join(resourcesRoot, "mnn", expectedExecutableName("mnncli"));
if (!fs.existsSync(mnnExecutable)) {
  const message =
    `MNN executable not found: ${mnnExecutable}\n` +
    "Build MNN mnncli and copy it to desktop/resources/mnn before packaging.";
  console.warn(message);
}

const mobiinferExecutable = path.join(resourcesRoot, "mobiinfer", expectedExecutableName("mnncli"));
if (!fs.existsSync(mobiinferExecutable)) {
  const message =
    `MobiInfer executable not found: ${mobiinferExecutable}\n` +
    "Build MobiInfer mnncli and copy it to desktop/resources/mobiinfer before packaging.";
  console.warn(message);
}

const hdcExecutable = path.join(resourcesRoot, "hdc", expectedExecutableName("hdc"));
if (!fs.existsSync(hdcExecutable)) {
  console.warn(
    `hdc executable not found: ${hdcExecutable}\n` +
      "The packaged app can still use hdc from PATH, but bundling hdc is recommended."
  );
}

const llamaCppCpuExecutable = path.join(resourcesRoot, "llama-cpp", "cpu", expectedExecutableName("llama-server"));
const llamaCppCudaExecutable = path.join(resourcesRoot, "llama-cpp", "cuda", expectedExecutableName("llama-server"));
const legacyLlamaCppExecutable = path.join(resourcesRoot, "llama-cpp", expectedExecutableName("llama-server"));
if (!fs.existsSync(llamaCppCpuExecutable) && !fs.existsSync(legacyLlamaCppExecutable)) {
  console.warn(
    `CPU llama.cpp server executable not found: ${llamaCppCpuExecutable}\n` +
      "Build it with scripts/windows/build-llama-cpp.ps1 -Mode cpu if you want CPU fallback."
  );
}
if (!fs.existsSync(llamaCppCudaExecutable)) {
  console.warn(
    `CUDA llama.cpp server executable not found: ${llamaCppCudaExecutable}\n` +
      "Build it with scripts/windows/build-llama-cpp.ps1 -Mode cuda if you want CUDA acceleration."
  );
}

console.log(`Prepared frontend resources at ${packagedFrontend}`);
console.log(`Prepared configs resources at ${packagedConfigs}`);
console.log(`Prepared example images at ${packagedExampleImages}`);
