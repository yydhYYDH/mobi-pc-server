import {
  getConnectedHdcTargetAction,
  nextAutoFilledHdcTarget,
  shouldPollHdcDiscovery
} from "../src/domain/hdcTarget.js";

type TestDevice = {
  serial: string;
  state: string;
  host: string | null;
  port: number | null;
  connection_type: string;
};

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function connectedDevice(overrides: Partial<TestDevice> = {}): TestDevice {
  return {
    serial: "4QE0225916013634",
    state: "connected",
    host: null,
    port: null,
    connection_type: "usb",
    ...overrides
  };
}

const usbDevice = connectedDevice();

{
  const next = nextAutoFilledHdcTarget({
    currentTarget: "",
    detectedTarget: usbDevice.serial,
    lastAutoTarget: "",
    userEdited: false
  });
  assertEqual(next.target, usbDevice.serial, "empty untouched input is auto-filled from detected USB target");
  assertEqual(next.lastAutoTarget, usbDevice.serial, "auto-filled target is remembered separately");
}

{
  const next = nextAutoFilledHdcTarget({
    currentTarget: "",
    detectedTarget: usbDevice.serial,
    lastAutoTarget: usbDevice.serial,
    userEdited: true
  });
  assertEqual(next.target, "", "user-cleared manual input is not overwritten by HDC polling");
  assertEqual(next.lastAutoTarget, usbDevice.serial, "manual edits keep the previous auto-filled target");
}

{
  const action = getConnectedHdcTargetAction({
    devices: [usbDevice],
    pcServerRportReady: true,
    target: "192.168.1.23:5555"
  });
  assertEqual(action.connected, false, "new wireless IP remains connectable while USB device is connected");
  assertEqual(action.disabled, false, "manual connect button stays enabled for a different target");
  assertEqual(action.label, "连接", "different target shows connect action");
}

{
  const action = getConnectedHdcTargetAction({
    devices: [usbDevice],
    pcServerRportReady: true,
    target: usbDevice.serial
  });
  assertEqual(action.connected, true, "current USB target is recognized as already connected");
  assertEqual(action.disabled, true, "manual connect button is disabled only for the current connected target");
  assertEqual(action.label, "已连接", "current connected target shows connected label");
}

{
  assertEqual(shouldPollHdcDiscovery({ available: true, devices: [] }), true, "discovery polling runs with no connected devices");
  assertEqual(shouldPollHdcDiscovery({ available: true, devices: [usbDevice] }), false, "discovery polling stops once a device is connected");
}

console.log("hdc target behavior tests passed");
