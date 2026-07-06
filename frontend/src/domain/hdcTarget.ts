export type HdcTargetDevice = {
  serial: string;
  state: string;
  host: string | null;
  port: number | null;
  connection_type: string;
};

export function normalizeHdcTarget(value: string) {
  return value.trim().replace(/：/g, ":");
}

export function getHdcDeviceTarget(device: HdcTargetDevice) {
  if (device.host && device.port) {
    return `${device.host}:${device.port}`;
  }
  return device.serial;
}

export function getPreferredDetectedHdcTarget(devices: HdcTargetDevice[]) {
  const connectedDevice = devices.find((device) => device.state === "connected");
  const targetDevice = connectedDevice ?? devices[0];
  return targetDevice ? getHdcDeviceTarget(targetDevice) : "";
}

export function hdcTargetMatchesDevice(target: string, device: HdcTargetDevice) {
  const normalizedTarget = normalizeHdcTarget(target);
  if (!normalizedTarget) {
    return false;
  }
  if (normalizedTarget === normalizeHdcTarget(device.serial)) {
    return true;
  }
  return Boolean(device.host && device.port && normalizedTarget === `${device.host}:${device.port}`);
}

export function hasConnectedHdcDevice(devices: HdcTargetDevice[]) {
  return devices.some((device) => device.state === "connected");
}

export function shouldPollHdcDiscovery(params: {
  available: boolean;
  devices: HdcTargetDevice[];
}) {
  return params.available && !hasConnectedHdcDevice(params.devices);
}

export function nextAutoFilledHdcTarget(params: {
  currentTarget: string;
  detectedTarget: string;
  lastAutoTarget: string;
  userEdited: boolean;
}) {
  const detectedTarget = normalizeHdcTarget(params.detectedTarget);
  if (!detectedTarget) {
    return {
      target: params.currentTarget,
      lastAutoTarget: params.lastAutoTarget
    };
  }

  const currentTarget = normalizeHdcTarget(params.currentTarget);
  const lastAutoTarget = normalizeHdcTarget(params.lastAutoTarget);
  const isManualTarget = currentTarget.length > 0 && currentTarget !== lastAutoTarget;
  const wasUserClearedOrChanged = params.userEdited && currentTarget !== lastAutoTarget;

  if (isManualTarget || wasUserClearedOrChanged) {
    return {
      target: params.currentTarget,
      lastAutoTarget: params.lastAutoTarget
    };
  }

  return {
    target: detectedTarget,
    lastAutoTarget: detectedTarget
  };
}

export function getConnectedHdcTargetAction(params: {
  devices: HdcTargetDevice[];
  pcServerRportReady: boolean;
  target: string;
}) {
  const target = normalizeHdcTarget(params.target);
  const connected = Boolean(
    target &&
    params.pcServerRportReady &&
    params.devices.some((device) => device.state === "connected" && hdcTargetMatchesDevice(target, device))
  );

  return {
    connected,
    disabled: !target || connected,
    label: connected ? "已连接" : "连接"
  };
}
