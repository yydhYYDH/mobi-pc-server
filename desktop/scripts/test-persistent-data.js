const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  initializePersistentData,
  legacyPackagedDataRoot,
  persistentDataRoot
} = require("../dist/persistent-data");

function withTempDir(test) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "clawmate-persistent-data-"));
  try {
    test(directory);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

withTempDir((root) => {
  const repoRoot = path.join(root, "repo");
  const appDataPath = path.join(root, "app-data");

  assert.equal(
    persistentDataRoot({
      appDataPath,
      env: {},
      executablePath: path.join(root, "ClawMate.app", "Contents", "MacOS", "ClawMate"),
      isPackaged: true,
      repoRoot
    }),
    path.join(appDataPath, "ClawMate")
  );

  assert.equal(
    persistentDataRoot({
      appDataPath,
      env: {},
      executablePath: path.join(root, "desktop", "ClawMate"),
      isPackaged: false,
      repoRoot
    }),
    repoRoot
  );

  assert.equal(
    persistentDataRoot({
      appDataPath,
      env: { PC_SERVER_DATA_DIR: path.join(root, "override") },
      executablePath: path.join(root, "desktop", "ClawMate"),
      isPackaged: true,
      repoRoot
    }),
    path.join(root, "override")
  );
});

withTempDir((root) => {
  const executablePath = path.join(root, "ClawMate.app", "Contents", "MacOS", "ClawMate");
  assert.equal(
    legacyPackagedDataRoot(executablePath),
    path.join(root, "ClawMate.app", "Contents", "MacOS", "pc-server-data")
  );
});

withTempDir((root) => {
  const bundledConfigs = path.join(root, "resources", "configs");
  const dataRoot = path.join(root, "user-data", "ClawMate");
  const configsDir = path.join(dataRoot, "configs");
  const legacyRoot = path.join(root, "legacy", "pc-server-data");

  fs.mkdirSync(path.join(bundledConfigs, "nested"), { recursive: true });
  fs.writeFileSync(path.join(bundledConfigs, "models.json"), "[{\"id\":\"bundled\"}]\n");
  fs.writeFileSync(path.join(bundledConfigs, "nested", "default.json"), "{\"ok\":true}\n");

  fs.mkdirSync(path.join(configsDir, "nested"), { recursive: true });
  fs.writeFileSync(path.join(configsDir, "models.json"), "[{\"id\":\"user\"}]\n");

  fs.mkdirSync(path.join(legacyRoot, "models", "model-a"), { recursive: true });
  fs.writeFileSync(path.join(legacyRoot, "models", "model-a", "model.gguf"), "legacy model");
  fs.mkdirSync(path.join(legacyRoot, "logs"), { recursive: true });
  fs.writeFileSync(path.join(legacyRoot, "logs", "backend.log"), "legacy log");

  initializePersistentData({
    bundledConfigsDir: bundledConfigs,
    configsDir,
    dataRoot,
    legacyDataRoots: [legacyRoot]
  });

  assert.equal(fs.readFileSync(path.join(configsDir, "models.json"), "utf8"), "[{\"id\":\"bundled\"}]\n");
  assert.equal(
    fs.readFileSync(path.join(configsDir, "nested", "default.json"), "utf8"),
    "{\"ok\":true}\n"
  );
  assert.equal(
    fs.readFileSync(path.join(dataRoot, "models", "model-a", "model.gguf"), "utf8"),
    "legacy model"
  );
  assert.equal(
    fs.readFileSync(path.join(dataRoot, "logs", "backend.log"), "utf8"),
    "legacy log"
  );
});

console.log("persistent data tests passed");
