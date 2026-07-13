import React from "react";

import { autoConnectHdcTarget, connectHdcTarget, disconnectHdcTarget } from "../api/devices";
import type { BackendId, HdcStatus, RuntimeStatus } from "../api/types";
import {
  getPreferredDetectedHdcTarget,
  nextAutoFilledHdcTarget,
  shouldPollHdcDiscovery
} from "../domain/hdcTarget";
import { defaultRuntimePort } from "../domain/runtime";

const RECENT_HDC_TARGETS_KEY = "pc-server-recent-hdc-targets";
const RECENT_HDC_TARGET_LIMIT = 5;

function readRecentHdcTargets() {
  try {
    const raw = window.localStorage.getItem(RECENT_HDC_TARGETS_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  } catch {
    return [];
  }
}

function writeRecentHdcTarget(target: string) {
  const normalizedTarget = target.trim();
  if (!normalizedTarget) {
    return readRecentHdcTargets();
  }
  const nextTargets = [
    normalizedTarget,
    ...readRecentHdcTargets().filter((item) => item !== normalizedTarget)
  ].slice(0, RECENT_HDC_TARGET_LIMIT);
  window.localStorage.setItem(RECENT_HDC_TARGETS_KEY, JSON.stringify(nextTargets));
  return nextTargets;
}

export function useHdcActions(params: {
  hdc: HdcStatus | null;
  runtimeStatus: RuntimeStatus | null;
  selectedBackend: BackendId;
  setHdc: (status: HdcStatus) => void;
}) {
  const { hdc, runtimeStatus, selectedBackend, setHdc } = params;
  const [recentHdcTargets, setRecentHdcTargets] = React.useState<string[]>(() => readRecentHdcTargets());
  const [hdcTarget, setHdcTargetState] = React.useState(() => readRecentHdcTargets()[0] ?? "");
  const [deviceBusy, setDeviceBusy] = React.useState<"auto" | "connect" | "disconnect" | null>(null);
  const [deviceNotice, setDeviceNotice] = React.useState<string | null>(null);
  const autoDiscoverInFlightRef = React.useRef(false);
  const deviceBusyRef = React.useRef<typeof deviceBusy>(null);
  const hdcTargetUserEditedRef = React.useRef(false);
  const lastAutoHdcTargetRef = React.useRef("");
  const expectedLlmPort = runtimeStatus?.state === "running" && runtimeStatus.port ? runtimeStatus.port : defaultRuntimePort(selectedBackend);
  const autoDiscovering = shouldPollHdcDiscovery({
    available: hdc?.available ?? false,
    devices: hdc?.devices ?? []
  });

  React.useEffect(() => {
    deviceBusyRef.current = deviceBusy;
  }, [deviceBusy]);

  const autoFillHdcTarget = React.useCallback((detectedTarget: string) => {
    if (!detectedTarget) {
      return;
    }
    setHdcTargetState((currentTarget) => {
      const nextTarget = nextAutoFilledHdcTarget({
        currentTarget,
        detectedTarget,
        lastAutoTarget: lastAutoHdcTargetRef.current,
        userEdited: hdcTargetUserEditedRef.current
      });
      lastAutoHdcTargetRef.current = nextTarget.lastAutoTarget;
      return nextTarget.target;
    });
  }, []);

  const setHdcTarget = React.useCallback((target: string) => {
    hdcTargetUserEditedRef.current = true;
    setHdcTargetState(target);
  }, []);

  React.useEffect(() => {
    autoFillHdcTarget(getPreferredDetectedHdcTarget(hdc?.devices ?? []));
  }, [autoFillHdcTarget, hdc?.devices]);

  React.useEffect(() => {
    if (!autoDiscovering) {
      return;
    }

    const intervalId = window.setInterval(() => {
      if (deviceBusyRef.current !== null) {
        return;
      }
      void autoConnectHdc({ silent: true });
    }, 5000);
    return () => window.clearInterval(intervalId);
  }, [autoDiscovering]);

  React.useEffect(() => {
    if (!hdc?.available || !hdc.pc_server_rport_ready || hdc.llm_port === expectedLlmPort) {
      return;
    }
    if (deviceBusyRef.current !== null) {
      return;
    }
    void autoConnectHdc({ silent: true });
  }, [expectedLlmPort, hdc?.available, hdc?.llm_port, hdc?.pc_server_rport_ready]);

  async function connectHdc() {
    if (!hdcTarget.trim()) {
      setDeviceNotice("请输入设备序列号或 host:port。");
      return;
    }
    setDeviceBusy("connect");
    setDeviceNotice(`正在连接 ${hdcTarget.trim()}...`);
    try {
      const nextStatus = await connectHdcTarget(hdcTarget.trim(), expectedLlmPort);
      setHdc(nextStatus);
      setRecentHdcTargets(writeRecentHdcTarget(hdcTarget.trim()));
      setDeviceNotice(nextStatus.message ?? "连接请求已完成。");
    } catch (connectError) {
      setDeviceNotice(connectError instanceof Error ? connectError.message : "连接失败。");
    } finally {
      setDeviceBusy(null);
    }
  }

  async function autoConnectHdc(options: { silent?: boolean } = {}) {
    if (autoDiscoverInFlightRef.current) {
      return;
    }
    autoDiscoverInFlightRef.current = true;
    if (!options.silent) {
      setDeviceBusy("auto");
      setDeviceNotice("正在自动搜索 HarmonyOS 设备，可能需要十几秒...");
    }
    try {
      const nextStatus = await autoConnectHdcTarget(expectedLlmPort, !options.silent);
      setHdc(nextStatus);
      const connectedTarget = getPreferredDetectedHdcTarget(nextStatus.devices);
      if (connectedTarget) {
        autoFillHdcTarget(connectedTarget);
        setRecentHdcTargets(writeRecentHdcTarget(connectedTarget));
      }
      if (!options.silent) {
        if (nextStatus.devices.length > 0) {
          setDeviceNotice(nextStatus.message ?? `已发现 ${nextStatus.devices.length} 台设备。`);
        } else {
          setDeviceNotice(nextStatus.message ?? "未发现可连接设备。");
        }
      }
    } catch (autoConnectError) {
      if (!options.silent) {
        setDeviceNotice(autoConnectError instanceof Error ? autoConnectError.message : "自动搜索失败。");
      }
    } finally {
      autoDiscoverInFlightRef.current = false;
      if (!options.silent) {
        setDeviceBusy(null);
      }
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
    autoDiscovering,
    deviceNotice,
    disconnectHdc,
    hdcLlmPort: String(expectedLlmPort),
    hdcTarget,
    recentHdcTargets,
    setHdcTarget
  };
}
