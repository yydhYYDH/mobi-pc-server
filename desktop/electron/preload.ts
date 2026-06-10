import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("pcServerDesktop", {
  backendBaseUrl: `http://${process.env.PC_SERVER_BACKEND_HOST ?? "127.0.0.1"}:${
    process.env.PC_SERVER_BACKEND_PORT ?? "8000"
  }`,
  platform: process.platform
});
