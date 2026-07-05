const fs = require("node:fs");
const path = require("node:path");

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

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "linux") {
    return;
  }

  removeWindowsRuntimeFiles(path.join(context.appOutDir, "resources"));
};
