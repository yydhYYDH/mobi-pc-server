var fs = require("fs");
var path = require("path");

var major = Number(process.versions.node.split(".")[0]);

if (major < 20) {
  console.error(
    "Node.js 20 or newer is required. Current version: " +
      process.version +
      "\nRun: nvm install 20 && nvm use 20"
  );
  process.exit(1);
}

var tscBin =
  process.platform === "win32"
    ? path.join(__dirname, "..", "node_modules", ".bin", "tsc.cmd")
    : path.join(__dirname, "..", "node_modules", ".bin", "tsc");

if (!fs.existsSync(tscBin)) {
  console.error(
    "TypeScript is not installed for the desktop package.\n" +
      "Run: cd desktop && npm install"
  );
  process.exit(1);
}
