const path = require("node:path");
const { spawnSync } = require("node:child_process");

const desktopRoot = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const target = args[0] || "--dir";

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

function hasArg(value) {
  return args.includes(value);
}

function targetMatches(value) {
  return target === value || target.startsWith(`${value}=`);
}

function hostElectronArch() {
  return process.arch === "x64" ? "x64" : "arm64";
}

function archForTarget() {
  if (hasArg("--x64")) {
    return "x64";
  }
  if (hasArg("--arm64")) {
    return "arm64";
  }
  return hostElectronArch();
}

function resourcesDirForTarget() {
  if (targetMatches("--win")) {
    return "resources-win";
  }
  if (targetMatches("--mac")) {
    return `resources-mac-${archForTarget()}`;
  }
  if (targetMatches("--linux")) {
    return "resources-linux";
  }

  if (process.platform === "win32") {
    return "resources-win";
  }
  if (process.platform === "darwin") {
    return `resources-mac-${archForTarget()}`;
  }
  return "resources-linux";
}

function platformForTarget() {
  if (targetMatches("--win")) {
    return "win32";
  }
  if (targetMatches("--mac")) {
    return "darwin";
  }
  if (targetMatches("--linux")) {
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
  PC_SERVER_DESKTOP_TARGET_ARCH: archForTarget(),
  PC_SERVER_DESKTOP_TARGET_PLATFORM: platformForTarget()
};

console.log(`Using desktop resource staging directory: ${resourcesDir}`);
run(npmCommand(), ["run", "build"], env);
run(npmCommand(), ["run", "prepare:resources"], env);
run(electronBuilderCommand(), args.length > 0 ? args : [target], env);
