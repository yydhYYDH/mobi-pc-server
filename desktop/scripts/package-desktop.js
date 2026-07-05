const path = require("node:path");
const { spawnSync } = require("node:child_process");

const desktopRoot = path.resolve(__dirname, "..");
const target = process.argv[2] || "--dir";

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function electronBuilderCommand() {
  return path.join(
    desktopRoot,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "electron-builder.cmd" : "electron-builder"
  );
}

function resourcesDirForTarget() {
  if (target === "--win" || target.startsWith("--win=")) {
    return "resources-win";
  }
  if (target === "--linux" || target.startsWith("--linux=")) {
    return "resources-linux";
  }
  return process.platform === "win32" ? "resources-win" : "resources-linux";
}

function platformForTarget() {
  if (target === "--win" || target.startsWith("--win=")) {
    return "win32";
  }
  if (target === "--linux" || target.startsWith("--linux=")) {
    return "linux";
  }
  return process.platform;
}

function run(command, args, env) {
  const result = spawnSync(command, args, {
    cwd: desktopRoot,
    env,
    stdio: "inherit",
    shell: process.platform === "win32"
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const resourcesDir = resourcesDirForTarget();
const env = {
  ...process.env,
  PC_SERVER_DESKTOP_RESOURCES: resourcesDir,
  PC_SERVER_DESKTOP_TARGET_PLATFORM: platformForTarget()
};

console.log(`Using desktop resource staging directory: ${resourcesDir}`);
run(npmCommand(), ["run", "build"], env);
run(npmCommand(), ["run", "prepare:resources"], env);
run(electronBuilderCommand(), [target], env);
