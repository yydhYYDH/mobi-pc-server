import { contextBridge } from "electron";

const backendBaseUrlArg = process.argv.find((arg) => arg.startsWith("--pc-server-backend-base-url="));
const backendBaseUrl =
  backendBaseUrlArg?.slice("--pc-server-backend-base-url=".length) ??
  `http://${process.env.PC_SERVER_BACKEND_HOST ?? "127.0.0.1"}:${process.env.PC_SERVER_BACKEND_PORT ?? "18188"}`;

contextBridge.exposeInMainWorld("pcServerDesktop", {
  backendBaseUrl,
  platform: process.platform
});
