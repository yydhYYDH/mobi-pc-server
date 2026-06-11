import React from "react";

import { autoConnectHdcTarget, connectHdcTarget, disconnectHdcTarget } from "../api/devices";
import type { HdcStatus } from "../api/types";
import { normalizePort } from "../domain/runtime";

export function useHdcActions(params: {
  hdc: HdcStatus | null;
  load: () => Promise<void>;
  setHdc: (status: HdcStatus) => void;
}) {
  const { hdc, load, setHdc } = params;
  const [hdcTarget, setHdcTarget] = React.useState("");
  const [hdcLlmPort, setHdcLlmPort] = React.useState(
    () => window.localStorage.getItem("pc-server-hdc-llm-port") ?? "8088"
  );
  const [deviceBusy, setDeviceBusy] = React.useState<"auto" | "connect" | "disconnect" | null>(null);
  const [deviceNotice, setDeviceNotice] = React.useState<string | null>(null);
  const autoHdcStartedRef = React.useRef(false);

  React.useEffect(() => {
    window.localStorage.setItem("pc-server-hdc-llm-port", hdcLlmPort);
  }, [hdcLlmPort]);

  React.useEffect(() => {
    if (autoHdcStartedRef.current || hdc === null || deviceBusy !== null) {
      return;
    }
    autoHdcStartedRef.current = true;
    void autoConnectHdc();
  }, [deviceBusy, hdc]);

  async function connectHdc() {
    if (!hdcTarget.trim()) {
      setDeviceNotice("请输入设备序列号或 host:port。");
      return;
    }
    const llmPort = normalizePort(hdcLlmPort);
    setDeviceBusy("connect");
    setDeviceNotice(`正在连接 ${hdcTarget.trim()}...`);
    try {
      const nextStatus = await connectHdcTarget(hdcTarget.trim(), llmPort);
      setHdc(nextStatus);
      setDeviceNotice(nextStatus.message ?? "连接请求已完成。");
      await load();
    } catch (connectError) {
      setDeviceNotice(connectError instanceof Error ? connectError.message : "连接失败。");
    } finally {
      setDeviceBusy(null);
    }
  }

  async function autoConnectHdc() {
    const llmPort = normalizePort(hdcLlmPort);
    setDeviceBusy("auto");
    setDeviceNotice("正在自动搜索 HarmonyOS 设备，可能需要十几秒...");
    try {
      const nextStatus = await autoConnectHdcTarget(llmPort);
      setHdc(nextStatus);
      if (nextStatus.devices.length > 0) {
        setDeviceNotice(nextStatus.message ?? `已发现 ${nextStatus.devices.length} 台设备。`);
      } else {
        setDeviceNotice(nextStatus.message ?? "未发现可连接设备。");
      }
      await load();
    } catch (autoConnectError) {
      setDeviceNotice(autoConnectError instanceof Error ? autoConnectError.message : "自动搜索失败。");
    } finally {
      setDeviceBusy(null);
    }
  }

  async function disconnectHdc() {
    if (!hdcTarget.trim()) {
      setDeviceNotice("请输入要断开的设备序列号或 host:port。");
      return;
    }
    setDeviceBusy("disconnect");
    setDeviceNotice(`正在断开 ${hdcTarget.trim()}...`);
    try {
      const nextStatus = await disconnectHdcTarget(hdcTarget.trim());
      setHdc(nextStatus);
      setDeviceNotice(nextStatus.message ?? "断开请求已完成。");
      await load();
    } catch (disconnectError) {
      setDeviceNotice(disconnectError instanceof Error ? disconnectError.message : "断开失败。");
    } finally {
      setDeviceBusy(null);
    }
  }

  return {
    autoConnectHdc,
    connectHdc,
    deviceBusy,
    deviceNotice,
    disconnectHdc,
    hdcLlmPort,
    hdcTarget,
    setHdcLlmPort,
    setHdcTarget
  };
}
