const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function removeWindowsRuntimeFiles(directory) {
  if (!fs.existsSync(directory)) {
    return;
  }

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      removeWindowsRuntimeFiles(entryPath);
      continue;
    }

    if (entry.isFile() && /\.(?:exe|dll)$/i.test(entry.name)) {
      fs.rmSync(entryPath, { force: true });
    }
  }
}

function findAppBundle(appOutDir) {
  if (!fs.existsSync(appOutDir)) {
    return null;
  }

  for (const entry of fs.readdirSync(appOutDir, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name.endsWith(".app")) {
      return path.join(appOutDir, entry.name);
    }
  }
  return null;
}

function adHocSignDarwinApp(appOutDir) {
  if (process.env.PC_SERVER_MAC_ADHOC_SIGN === "0") {
    return;
  }

  const appBundle = findAppBundle(appOutDir);
  if (!appBundle) {
    throw new Error(`macOS app bundle not found in ${appOutDir}`);
  }

  const result = spawnSync("codesign", ["--force", "--deep", "--sign", "-", appBundle], {
    stdio: "inherit"
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`codesign failed for ${appBundle}`);
  }
}

exports.default = async function afterPack(context) {
  if (context.electronPlatformName === "darwin") {
    adHocSignDarwinApp(context.appOutDir);
    return;
  }

  if (context.electronPlatformName !== "linux") {
    return;
  }

  removeWindowsRuntimeFiles(path.join(context.appOutDir, "resources"));
};
