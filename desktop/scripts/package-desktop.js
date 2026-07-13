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
  if (hasArg("--arm64") || hasArg("--arm")) {
    return "arm64";
  }
  return hostElectronArch();
}

function electronBuilderArgs() {
  const builderArgs = args.length > 0 ? args : [target];
  return builderArgs.map((arg) => (arg === "--arm" ? "--arm64" : arg));
}

function platformResourceName(platform, arch) {
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

function resourcesDirForTarget() {
  if (targetMatches("--win")) {
    return platformResourceName("win32", archForTarget());
  }
  if (targetMatches("--mac")) {
    return platformResourceName("darwin", archForTarget());
  }
  if (targetMatches("--linux")) {
    return platformResourceName("linux", archForTarget());
  }

  if (process.platform === "win32") {
    return platformResourceName("win32", archForTarget());
  }
  if (process.platform === "darwin") {
    return platformResourceName("darwin", archForTarget());
  }
  return platformResourceName("linux", archForTarget());
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
run(electronBuilderCommand(), electronBuilderArgs(), env);
