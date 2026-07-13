import fs from "node:fs";
import path from "node:path";

const PRODUCT_DATA_DIRECTORY = "ClawMate";
const LEGACY_DATA_DIRECTORY = "pc-server-data";

type Environment = NodeJS.ProcessEnv | Record<string, string | undefined>;

export type PersistentDataRootOptions = {
  appDataPath: string;
  env?: Environment;
  executablePath: string;
  isPackaged: boolean;
  repoRoot: string;
};

export type InitializePersistentDataOptions = {
  bundledConfigsDir: string;
  configsDir: string;
  dataRoot: string;
  legacyDataRoots?: string[];
};

export function persistentDataRoot(options: PersistentDataRootOptions): string {
  const override = options.env?.PC_SERVER_DATA_DIR?.trim();
  if (override) {
    return path.resolve(override);
  }

  if (options.isPackaged) {
    return path.join(options.appDataPath, PRODUCT_DATA_DIRECTORY);
  }

  return options.repoRoot;
}

export function legacyPackagedDataRoot(executablePath: string): string {
  return path.join(path.dirname(executablePath), LEGACY_DATA_DIRECTORY);
}

export function initializePersistentData(options: InitializePersistentDataOptions): void {
  fs.mkdirSync(options.dataRoot, { recursive: true });

  for (const legacyRoot of options.legacyDataRoots ?? []) {
    if (!legacyRoot || !fs.existsSync(legacyRoot)) {
      continue;
    }
    if (path.resolve(legacyRoot) === path.resolve(options.dataRoot)) {
      continue;
    }
    copyMissingEntries(legacyRoot, options.dataRoot);
  }

  copyMissingEntries(options.bundledConfigsDir, options.configsDir);
}

function copyMissingEntries(source: string, target: string): void {
  if (!source || !fs.existsSync(source)) {
    fs.mkdirSync(target, { recursive: true });
    return;
  }

  const stats = fs.lstatSync(source);
  if (stats.isDirectory()) {
    fs.mkdirSync(target, { recursive: true });
    for (const entry of fs.readdirSync(source)) {
      copyMissingEntries(path.join(source, entry), path.join(target, entry));
    }
    return;
  }

  if (fs.existsSync(target)) {
    return;
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (stats.isSymbolicLink()) {
    fs.symlinkSync(fs.readlinkSync(source), target);
    return;
  }

  fs.copyFileSync(source, target);
  fs.chmodSync(target, stats.mode);
}
