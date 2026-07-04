import { Menu, app, BrowserWindow, shell } from "electron";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";

const BACKEND_HOST = process.env.PC_SERVER_BACKEND_HOST ?? "127.0.0.1";
let backendPort = Number(process.env.PC_SERVER_BACKEND_PORT ?? "18188");
let frontendDevUrl = process.env.PC_SERVER_FRONTEND_URL ?? "http://127.0.0.1:5173";
const SKIP_BACKEND = process.env.PC_SERVER_SKIP_BACKEND === "1";

let backendProcess: ChildProcessWithoutNullStreams | undefined;
let frontendProcess: ChildProcessWithoutNullStreams | undefined;
let mainWindow: BrowserWindow | undefined;
let isQuitting = false;

function repoRoot(): string {
  return path.resolve(__dirname, "..", "..");
}

function backendExecutablePath(): string {
  const executableName = process.platform === "win32" ? "pc-server-backend.exe" : "pc-server-backend";
  return path.join(process.resourcesPath, "backend", executableName);
}

function appDataRoot(): string {
  return app.isPackaged
    ? path.join(path.dirname(process.execPath), "pc-server-data")
    : path.join(repoRoot(), "pc-server-data");
}

function npmCommand(): string {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function nodeCommand(): string {
  return process.env.npm_node_execpath ?? (process.platform === "win32" ? "node.exe" : "node");
}

function frontendViteBin(): string {
  return path.join(repoRoot(), "frontend", "node_modules", "vite", "bin", "vite.js");
}

function logBuffer(label: string, data: Buffer, error = false): void {
  const text = data.toString("utf8").trimEnd();
  if (!text) {
    return;
  }

  if (error) {
    console.error(`[${label}] ${text}`);
  } else {
    console.log(`[${label}] ${text}`);
  }
}

function parsePort(url: string): number {
  return Number(new URL(url).port);
}

function backendBaseUrl(): string {
  return `http://${BACKEND_HOST}:${backendPort}`;
}

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

async function pickFrontendPort(startPort: number): Promise<number> {
  for (let port = startPort; port < startPort + 20; port += 1) {
    if (await isPortFree(port)) {
      return port;
    }
  }
  throw new Error(`No available frontend port found from ${startPort} to ${startPort + 19}`);
}

async function pickBackendPort(startPort: number): Promise<number> {
  for (let port = startPort; port < startPort + 20; port += 1) {
    if (await isPortFree(port)) {
      return port;
    }
  }
  throw new Error(`No available backend port found from ${startPort} to ${startPort + 19}`);
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
    logBuffer(label, data);
  });

  processRef.stderr.on("data", (data: Buffer) => {
    logBuffer(label, data, true);
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
      env: childEnv(),
      windowsHide: true
    });
    attachProcessLogging("backend", backendProcess);
    return;
  }

  backendProcess = spawn(
    devPythonCommand(),
    ["-m", "uvicorn", "app.main:app", "--host", BACKEND_HOST, "--port", String(backendPort)],
    {
      cwd: path.join(repoRoot(), "backend"),
      env: childEnv(),
      windowsHide: true
    }
  );
  attachProcessLogging("backend", backendProcess);
}

function childEnv(): NodeJS.ProcessEnv {
  const resourcesPath = app.isPackaged ? process.resourcesPath : path.join(repoRoot(), "desktop", "resources");
  const dataRoot = app.isPackaged ? appDataRoot() : repoRoot();
  const hdcDir = path.join(resourcesPath, "hdc");
  const pathValue = [hdcDir, process.env.PATH ?? ""].filter(Boolean).join(path.delimiter);

  return {
    ...process.env,
    FORCE_COLOR: "0",
    HDC_BIN: path.join(hdcDir, process.platform === "win32" ? "hdc.exe" : "hdc"),
    MNNCLI_BIN: path.join(resourcesPath, "mnn", process.platform === "win32" ? "mnncli.exe" : "mnncli"),
    MOBIINFER_BIN: path.join(resourcesPath, "mobiinfer", process.platform === "win32" ? "mnncli.exe" : "mnncli"),
    PATH: pathValue,
    PC_SERVER_BACKEND_HOST: BACKEND_HOST,
    PC_SERVER_BACKEND_PORT: String(backendPort),
    PC_SERVER_CONFIGS_DIR: path.join(resourcesPath, "configs"),
    PC_SERVER_LOGS_DIR: path.join(dataRoot, "logs"),
    PC_SERVER_MODELS_DIR: path.join(dataRoot, "models"),
    PC_SERVER_RESOURCES: resourcesPath,
    PC_SERVER_ROOT: dataRoot,
    MODELSCOPE_CACHE: path.join(dataRoot, "modelscope-cache"),
    PYTHONIOENCODING: "utf-8",
    PYTHONUTF8: "1"
  };
}

async function startFrontendDevServer(): Promise<void> {
  if (app.isPackaged || process.env.PC_SERVER_SKIP_FRONTEND === "1") {
    return;
  }

  if (await urlCheck(frontendDevUrl)) {
    console.log(`[frontend] Reusing existing Vite server at ${frontendDevUrl}`);
    return;
  }

  const viteBin = frontendViteBin();
  if (!fs.existsSync(viteBin)) {
    console.error(
      `[frontend] Vite is not installed. Run "npm install" in ${path.join(repoRoot(), "frontend")} first.`
    );
    return;
  }

  if (!process.env.PC_SERVER_FRONTEND_URL) {
    const port = await pickFrontendPort(parsePort(frontendDevUrl));
    frontendDevUrl = `http://127.0.0.1:${port}`;
  }

  const frontendPort = String(parsePort(frontendDevUrl));
  frontendProcess = spawn(nodeCommand(), [viteBin, "--host", "127.0.0.1", "--port", frontendPort, "--strictPort"], {
    cwd: path.join(repoRoot(), "frontend"),
    env: childEnv(),
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

function postJson(url: string, timeoutMs = 5000): Promise<boolean> {
  return new Promise((resolve) => {
    const request = http.request(url, { method: "POST" }, (response) => {
      response.resume();
      resolve(response.statusCode !== undefined && response.statusCode >= 200 && response.statusCode < 300);
    });

    request.on("error", () => resolve(false));
    request.setTimeout(timeoutMs, () => {
      request.destroy();
      resolve(false);
    });
    request.end();
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function healthCheck(): Promise<boolean> {
  return urlCheck(`${backendBaseUrl()}/api/health`);
}

async function waitForBackend(timeoutMs = 15000): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await healthCheck()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  throw new Error(`Backend did not become healthy at ${backendBaseUrl()}/api/health`);
}

async function waitForFrontend(timeoutMs = 15000): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await urlCheck(frontendDevUrl)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  throw new Error(`Frontend did not become available at ${frontendDevUrl}`);
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
      additionalArguments: [`--pc-server-backend-base-url=${backendBaseUrl()}`],
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.on("close", (event) => {
    if (isQuitting) {
      return;
    }
    event.preventDefault();
    void quitGracefully();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  if (app.isPackaged) {
    await mainWindow.loadFile(path.join(process.resourcesPath, "frontend", "index.html"));
  } else {
    try {
      await mainWindow.loadURL(frontendDevUrl);
    } catch (error) {
      console.error(`[frontend] failed to load ${frontendDevUrl}`, error);
      await mainWindow.loadURL(
        `data:text/html;charset=utf-8,${encodeURIComponent(`
          <!doctype html>
          <html lang="zh-CN">
            <head>
              <meta charset="UTF-8" />
              <title>Frontend unavailable</title>
              <style>
                body {
                  margin: 0;
                  padding: 32px;
                  background: #eef1f4;
                  color: #18202b;
                  font-family: "Microsoft YaHei", "Noto Sans CJK SC", system-ui, sans-serif;
                }
                main {
                  max-width: 760px;
                  border: 1px solid #d8dee6;
                  border-radius: 8px;
                  background: #fff;
                  padding: 24px;
                }
                code {
                  display: block;
                  margin-top: 10px;
                  padding: 12px;
                  border-radius: 6px;
                  background: #111827;
                  color: #eef2f7;
                  white-space: pre-wrap;
                }
              </style>
            </head>
            <body>
              <main>
                <h1>前端开发服务未启动</h1>
                <p>请在 Windows 环境重新安装前端依赖，然后重新运行桌面端。</p>
                <code>cd E:\\WAIC\\pc_server\\frontend
rd /s /q node_modules
npm install

cd ..\\desktop
npm run dev</code>
              </main>
            </body>
          </html>
        `)}`
      );
    }
  }
}

async function showClosingNotice(): Promise<void> {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.show();
  mainWindow.focus();
  try {
    await mainWindow.webContents.executeJavaScript(`
      document.title = '正在关闭';
      document.body.innerHTML = \`
        <style>
          * { box-sizing: border-box; }
          body {
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            background: #eef2f6;
            color: #17202b;
            font-family: "Microsoft YaHei", "Noto Sans CJK SC", Inter, system-ui, sans-serif;
          }
          main {
            width: min(520px, calc(100vw - 48px));
            padding: 28px;
            border: 1px solid #d8e0e9;
            border-radius: 10px;
            background: #ffffff;
            box-shadow: 0 18px 48px rgba(24, 32, 43, 0.12);
          }
          .status {
            display: flex;
            gap: 16px;
            align-items: flex-start;
          }
          .spinner {
            width: 34px;
            height: 34px;
            flex: 0 0 auto;
            border: 3px solid #dce4ed;
            border-top-color: #2f7d6d;
            border-radius: 50%;
            animation: spin 0.9s linear infinite;
          }
          h1 {
            margin: 0;
            font-size: 22px;
            line-height: 1.25;
            letter-spacing: 0;
          }
          p {
            margin: 8px 0 0;
            color: #607083;
            line-height: 1.6;
            font-size: 14px;
          }
          ul {
            display: grid;
            gap: 9px;
            margin: 22px 0 0;
            padding: 0;
            list-style: none;
          }
          li {
            display: flex;
            align-items: center;
            gap: 10px;
            color: #334255;
            font-size: 14px;
          }
          li::before {
            content: "";
            width: 7px;
            height: 7px;
            border-radius: 50%;
            background: #2f7d6d;
          }
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        </style>
        <main>
          <div class="status">
            <div class="spinner" aria-hidden="true"></div>
            <div>
              <h1>正在关闭本地服务</h1>
              <p>正在安全停止推理服务并清理手机连接通道，完成后窗口会自动退出。</p>
            </div>
          </div>
          <ul>
            <li>停止本机推理进程</li>
            <li>清理 HDC 端口转发</li>
            <li>关闭前端和后端服务</li>
          </ul>
        </main>
      \`;
    `);
  } catch {
    // The window may already be navigating or destroyed; shutdown should continue.
  }
}

async function quitGracefully(): Promise<void> {
  if (isQuitting) {
    return;
  }
  isQuitting = true;
  const startedAt = Date.now();
  await showClosingNotice();
  const shutdownOk = await postJson(`${backendBaseUrl()}/api/shutdown`, 20000);
  if (!shutdownOk) {
    console.warn(`[backend] shutdown endpoint did not complete successfully at ${backendBaseUrl()}/api/shutdown`);
  }
  const visibleForMs = Date.now() - startedAt;
  if (visibleForMs < 1200) {
    await delay(1200 - visibleForMs);
  }
  stopFrontend();
  stopBackend();
  app.quit();
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  await startFrontendDevServer();

  if (app.isPackaged && !SKIP_BACKEND && !process.env.PC_SERVER_BACKEND_PORT && !(await isPortFree(backendPort))) {
    const occupiedPort = backendPort;
    backendPort = await pickBackendPort(backendPort + 1);
    process.env.PC_SERVER_BACKEND_PORT = String(backendPort);
    console.log(`[backend] Port ${occupiedPort} is occupied; starting packaged backend at ${backendBaseUrl()}`);
  }

  if (!app.isPackaged && (await healthCheck())) {
    console.log(`[backend] Reusing existing backend at ${backendBaseUrl()}`);
  } else {
    startBackend();
  }

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
    void quitGracefully();
  }
});

app.on("before-quit", () => {
  if (!isQuitting) {
    void quitGracefully();
    return;
  }
  stopFrontend();
  stopBackend();
});
