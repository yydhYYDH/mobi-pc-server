const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const desktopRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(desktopRoot, "..");
const frontendRoot = path.join(repoRoot, "frontend");
const resourcesRoot = path.join(desktopRoot, "resources");
const frontendDist = path.join(frontendRoot, "dist");
const packagedFrontend = path.join(resourcesRoot, "frontend");
const packagedBackend = path.join(resourcesRoot, "backend");

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    shell: false
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

run(npmCommand(), ["run", "build"], frontendRoot);

if (!fs.existsSync(frontendDist)) {
  throw new Error(`Frontend dist directory not found: ${frontendDist}`);
}

copyDir(frontendDist, packagedFrontend);
fs.mkdirSync(packagedBackend, { recursive: true });
fs.mkdirSync(path.join(resourcesRoot, "mnn"), { recursive: true });
fs.mkdirSync(path.join(resourcesRoot, "hdc"), { recursive: true });

const backendExecutable = path.join(packagedBackend, expectedBackendName());
if (!fs.existsSync(backendExecutable)) {
  console.warn(
    `Backend executable not found: ${backendExecutable}\n` +
      "Build it first with scripts/build-backend.sh on Linux or scripts/windows/build-backend.ps1 on Windows."
  );
}

console.log(`Prepared frontend resources at ${packagedFrontend}`);
