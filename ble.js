// =====================================================
// Ride Console BLE Module
// Phase 1: connect / disconnect / reconnect / send time
// =====================================================

const BLE = (() => {
  const SERVICE_UUID = "12345678-1234-1234-1234-1234567890ab";
  const CHARACTERISTIC_UUID = "abcd1234-1234-1234-1234-abcdef123456";

  let enabled = false;
  let connected = false;
  let connecting = false;

  let device = null;
  let server = null;
  let characteristic = null;

  let reconnectTimer = null;

  let sendCount = 0;
  let errorCount = 0;
  let lastSentText = "";
  let lastError = "";

  function isEnabled() {
    return enabled;
  }

  function isConnected() {
    return connected;
  }

  function getStatus() {
    if (!enabled) return "OFF";
    if (connecting) return "CONNECTING";
    if (connected) return "CONNECTED";
    return "DISCONNECTED";
  }

  function updateStatusUI() {
    const status = getStatus();

    const el = document.getElementById("bleStatus");
    if (el) {
      el.textContent = status;
    }



  const btn = document.getElementById("bleToggleButton");
  if (btn) {
      btn.classList.remove("off", "connecting", "connected");

    if (!enabled) {
      btn.textContent = "BLE OFF";
      btn.classList.add("off");
    } else if (connecting) {
      btn.textContent = "BLE CONNECTING";
      btn.classList.add("connecting");
    } else if (connected) {
      btn.textContent = "BLE CONNECTED";
      btn.classList.add("connected");
    } else {
      btn.textContent = "BLE DISCONNECTED";
      btn.classList.add("connecting");
    }
 }
    

    const dev = document.getElementById("devBleStatus");
    if (dev) {
      dev.innerHTML =
        `BLE: ${status}<br>` +
        `Send: ${sendCount}<br>` +
        `Error: ${errorCount}<br>` +
        `Last: ${lastSentText}<br>` +
        `Err: ${lastError}`;
    }
  }

  async function toggle() {
    if (enabled) {
      await disable();
    } else {
      await enable();
    }
  }

  async function enable() {
    enabled = true;
    updateStatusUI();
    await connect();
  }

  async function disable() {
    enabled = false;
    clearReconnectTimer();

    await disconnect();

    connected = false;
    connecting = false;
    device = null;
    server = null;
    characteristic = null;

    updateStatusUI();
  }

  async function connect() {
    if (!enabled) return;
    if (connected || connecting) return;

    if (!navigator.bluetooth) {
      lastError = "Web Bluetooth not supported";
      errorCount++;
      updateStatusUI();
      return;
    }

    connecting = true;
    updateStatusUI();

    try {
      device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [SERVICE_UUID] }]
      });

      device.addEventListener("gattserverdisconnected", onDisconnected);

      server = await device.gatt.connect();

      const service = await server.getPrimaryService(SERVICE_UUID);

      characteristic = await service.getCharacteristic(CHARACTERISTIC_UUID);

      connected = true;
      connecting = false;
      lastError = "";

      updateStatusUI();

      await sendTime();

    } catch (err) {
      connected = false;
      connecting = false;
      characteristic = null;
      lastError = err.message || String(err);
      errorCount++;

      updateStatusUI();

      if (enabled) {
        scheduleReconnect();
      }
    }
  }

  async function disconnect() {
    try {
      if (device && device.gatt && device.gatt.connected) {
        device.gatt.disconnect();
      }
    } catch (err) {
      lastError = err.message || String(err);
      errorCount++;
    }

    connected = false;
    connecting = false;
    updateStatusUI();
  }

  function onDisconnected() {
    connected = false;
    characteristic = null;

    updateStatusUI();

    if (enabled) {
      scheduleReconnect();
    }
  }

  function scheduleReconnect() {
    clearReconnectTimer();

    reconnectTimer = setTimeout(async () => {
      if (!enabled) return;
      await reconnect();
    }, 3000);
  }

  function clearReconnectTimer() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  async function reconnect() {
    if (!enabled) return;
    if (!device) {
      await connect();
      return;
    }

    if (connected || connecting) return;

    connecting = true;
    updateStatusUI();

    try {
      server = await device.gatt.connect();

      const service = await server.getPrimaryService(SERVICE_UUID);

      characteristic = await service.getCharacteristic(CHARACTERISTIC_UUID);

      connected = true;
      connecting = false;
      lastError = "";

      updateStatusUI();

      await sendTime();

    } catch (err) {
      connected = false;
      connecting = false;
      characteristic = null;
      lastError = err.message || String(err);
      errorCount++;

      updateStatusUI();
      scheduleReconnect();
    }
  }

  async function sendText(text) {
    if (!enabled) return false;
    if (!connected || !characteristic) return false;

    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(text);

      await characteristic.writeValue(data);

      sendCount++;
      lastSentText = text;
      lastError = "";

      updateStatusUI();
      return true;

    } catch (err) {
      errorCount++;
      lastError = err.message || String(err);

      connected = false;
      characteristic = null;

      updateStatusUI();
      scheduleReconnect();

      return false;
    }
  }

  async function sendTime() {
    const now = new Date();

    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const hh = String(now.getHours()).padStart(2, "0");
    const mi = String(now.getMinutes()).padStart(2, "0");
    const ss = String(now.getSeconds()).padStart(2, "0");

    const text = `TIME|${yyyy}-${mm}-${dd}|${hh}:${mi}:${ss}`;

    return await sendText(text);
  }

  async function sendNavigation(payload) {
    return await sendText(payload);
  }

  return {
    toggle,
    enable,
    disable,
    connect,
    disconnect,
    reconnect,
    sendText,
    sendTime,
    sendNavigation,
    isEnabled,
    isConnected,
    getStatus,
    updateStatusUI
  };
})();
