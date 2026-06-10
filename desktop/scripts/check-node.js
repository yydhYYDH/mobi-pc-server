var major = Number(process.versions.node.split(".")[0]);

if (major < 20) {
  console.error(
    "Node.js 20 or newer is required. Current version: " +
      process.version +
      "\nRun: nvm install 20 && nvm use 20"
  );
  process.exit(1);
}
