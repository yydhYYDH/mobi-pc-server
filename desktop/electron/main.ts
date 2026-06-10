import { app, BrowserWindow, shell } from "electron";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const BACKEND_PORT = Number(process.env.PC_SERVER_BACKEND_PORT ?? "8000");
const BACKEND_HOST = process.env.PC_SERVER_BACKEND_HOST ?? "127.0.0.1";
const BACKEND_BASE_URL = `http://${BACKEND_HOST}:${BACKEND_PORT}`;
const FRONTEND_DEV_URL = process.env.PC_SERVER_FRONTEND_URL ?? "http://127.0.0.1:5173";
const SKIP_BACKEND = process.env.PC_SERVER_SKIP_BACKEND === "1";

let backendProcess: ChildProcessWithoutNullStreams | undefined;
let frontendProcess: ChildProcessWithoutNullStreams | undefined;
let mainWindow: BrowserWindow | undefined;

function repoRoot(): string {
  return path.resolve(__dirname, "..", "..");
}

function backendExecutablePath(): string {
  const executableName = process.platform === "win32" ? "pc-server-backend.exe" : "pc-server-backend";
  return path.join(process.resourcesPath, "backend", executableName);
}

function npmCommand(): string {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function devPythonCommand(): string {
  const override = process.env.PC_SERVER_PYTHON;
  if (override) {
    return override;
  }

  const venvPython =
    process.platform === "win32"
      ? path.join(repoRoot(), "backend", ".venv", "Scripts", "python.exe")
      : path.join(repoRoot(), "backend", ".venv", "bin", "python");

  if (fs.existsSync(venvPython)) {
    return venvPython;
  }

  return process.platform === "win32" ? "python" : "python3";
}

function attachProcessLogging(label: string, processRef: ChildProcessWithoutNullStreams): void {
  processRef.stdout.on("data", (data: Buffer) => {
    console.log(`[${label}] ${data.toString().trimEnd()}`);
  });

  processRef.stderr.on("data", (data: Buffer) => {
    console.error(`[${label}] ${data.toString().trimEnd()}`);
  });

  processRef.on("error", (error) => {
    console.error(`[${label}] failed to start`, error);
  });

  processRef.on("exit", (code, signal) => {
    if (backendProcess === processRef) {
      backendProcess = undefined;
    }
    if (frontendProcess === processRef) {
      frontendProcess = undefined;
    }
    console.log(`[${label}] exited with code=${code ?? "null"} signal=${signal ?? "null"}`);
  });
}

function startBackend(): void {
  if (SKIP_BACKEND) {
    return;
  }

  if (app.isPackaged) {
    backendProcess = spawn(backendExecutablePath(), [], {
      cwd: process.resourcesPath,
      env: process.env,
      windowsHide: true
    });
    attachProcessLogging("backend", backendProcess);
    return;
  }

  backendProcess = spawn(
    devPythonCommand(),
    ["-m", "uvicorn", "app.main:app", "--host", BACKEND_HOST, "--port", String(BACKEND_PORT)],
    {
      cwd: path.join(repoRoot(), "backend"),
      env: process.env,
      windowsHide: true
    }
  );
  attachProcessLogging("backend", backendProcess);
}

function startFrontendDevServer(): void {
  if (app.isPackaged || process.env.PC_SERVER_SKIP_FRONTEND === "1") {
    return;
  }

  frontendProcess = spawn(npmCommand(), ["run", "dev"], {
    cwd: path.join(repoRoot(), "frontend"),
    env: process.env,
    shell: process.platform === "win32",
    windowsHide: true
  });
  attachProcessLogging("frontend", frontendProcess);
}

function stopBackend(): void {
  if (!backendProcess || backendProcess.killed) {
    return;
  }

  backendProcess.kill(process.platform === "win32" ? undefined : "SIGTERM");
  backendProcess = undefined;
}

function stopFrontend(): void {
  if (!frontendProcess || frontendProcess.killed) {
    return;
  }

  frontendProcess.kill(process.platform === "win32" ? undefined : "SIGTERM");
  frontendProcess = undefined;
}

function urlCheck(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const request = http.get(url, (response) => {
      response.resume();
      resolve(response.statusCode !== undefined && response.statusCode >= 200 && response.statusCode < 300);
    });

    request.on("error", () => resolve(false));
    request.setTimeout(1000, () => {
      request.destroy();
      resolve(false);
    });
  });
}

function healthCheck(): Promise<boolean> {
  return urlCheck(`${BACKEND_BASE_URL}/api/health`);
}

async function waitForBackend(timeoutMs = 15000): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await healthCheck()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  throw new Error(`Backend did not become healthy at ${BACKEND_BASE_URL}/api/health`);
}

async function waitForFrontend(timeoutMs = 15000): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await urlCheck(FRONTEND_DEV_URL)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  throw new Error(`Frontend did not become available at ${FRONTEND_DEV_URL}`);
}

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  if (app.isPackaged) {
    await mainWindow.loadFile(path.join(process.resourcesPath, "frontend", "index.html"));
  } else {
    await mainWindow.loadURL(FRONTEND_DEV_URL);
  }
}

app.whenReady().then(async () => {
  startFrontendDevServer();
  startBackend();

  try {
    await Promise.all([waitForBackend(), app.isPackaged ? Promise.resolve() : waitForFrontend()]);
  } catch (error) {
    console.error(error);
  }

  await createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  stopFrontend();
  stopBackend();
});
