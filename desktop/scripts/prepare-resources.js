const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const desktopRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(desktopRoot, "..");
const frontendRoot = path.join(repoRoot, "frontend");
const configsRoot = path.join(repoRoot, "configs");
const resourcesRoot = path.join(desktopRoot, "resources");
const frontendDist = path.join(frontendRoot, "dist");
const packagedFrontend = path.join(resourcesRoot, "frontend");
const packagedBackend = path.join(resourcesRoot, "backend");
const packagedConfigs = path.join(resourcesRoot, "configs");

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

run(npmCommand(), ["run", "build"], frontendRoot);

if (!fs.existsSync(frontendDist)) {
  throw new Error(`Frontend dist directory not found: ${frontendDist}`);
}

copyDir(frontendDist, packagedFrontend);
copyDir(configsRoot, packagedConfigs);
fs.mkdirSync(packagedBackend, { recursive: true });
fs.mkdirSync(path.join(resourcesRoot, "mnn"), { recursive: true });
fs.mkdirSync(path.join(resourcesRoot, "llama-cpp"), { recursive: true });
fs.mkdirSync(path.join(resourcesRoot, "llama-cpp", "cpu"), { recursive: true });
fs.mkdirSync(path.join(resourcesRoot, "llama-cpp", "cuda"), { recursive: true });
fs.mkdirSync(path.join(resourcesRoot, "hdc"), { recursive: true });

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
    "Build Windows mnncli and copy it to desktop/resources/mnn before packaging.";
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
