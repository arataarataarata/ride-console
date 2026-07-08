// =====================================================
// Ride Console BLE Module
// connect / disconnect / reconnect / queued write
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

  let writeQueue = [];
  let writeBusy = false;

  // ==============================
  // Status
  // ==============================
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

    const statusEl = document.getElementById("bleStatus");
    if (statusEl) {
      statusEl.textContent = status;
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

    const devEl = document.getElementById("devBleStatus");
    if (devEl) {
      devEl.innerHTML =
        `BLE: ${status}<br>` +
        `Send: ${sendCount}<br>` +
        `Error: ${errorCount}<br>` +
        `Last: ${lastSentText}<br>` +
        `Err: ${lastError}`;
    }
  }

  // ==============================
  // Enable / Disable
  // ==============================
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
    clearWriteQueue();

    await disconnect();

    device = null;
    server = null;
    characteristic = null;

    updateStatusUI();
  }

  // ==============================
  // Connection
  // ==============================
  async function connect() {
    if (!enabled) return;
    if (connected || connecting) return;

    if (!navigator.bluetooth) {
      setError("Web Bluetooth not supported");
      return;
    }

    connecting = true;
    updateStatusUI();

    try {
      device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [SERVICE_UUID] }]
      });

      device.addEventListener("gattserverdisconnected", handleDisconnected);

      await connectToDevice();

    } catch (err) {
      handleConnectionError(err);
    }
  }

  async function reconnect() {
    if (!enabled) return;
    if (connected || connecting) return;

    if (!device) {
      await connect();
      return;
    }

    connecting = true;
    updateStatusUI();

    try {
      await connectToDevice();
    } catch (err) {
      handleConnectionError(err);
    }
  }

  async function connectToDevice() {
    server = await device.gatt.connect();

    const service = await server.getPrimaryService(SERVICE_UUID);
    characteristic = await service.getCharacteristic(CHARACTERISTIC_UUID);

    connected = true;
    connecting = false;
    lastError = "";

    updateStatusUI();

    await sendTime();
  }

  async function disconnect() {
    try {
      if (device?.gatt?.connected) {
        device.gatt.disconnect();
      }
    } catch (err) {
      setError(err.message || String(err));
    }

    connected = false;
    connecting = false;
    characteristic = null;

    updateStatusUI();
  }

  function handleDisconnected() {
    connected = false;
    connecting = false;
    characteristic = null;

    updateStatusUI();

    if (enabled) {
      scheduleReconnect();
    }
  }

  function handleConnectionError(err) {
    connected = false;
    connecting = false;
    characteristic = null;

    setError(err.message || String(err));

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

  // ==============================
  // Send
  // ==============================
  function sendText(text) {
    if (!enabled) return false;
    if (!connected || !characteristic) return false;
    if (!text) return false;

    writeQueue.push(text);
    processWriteQueue();

    return true;
  }

  async function sendNavigation(payload) {
    return sendText(payload);
  }

  async function sendTime() {
    const now = new Date();

    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const hh = String(now.getHours()).padStart(2, "0");
    const mi = String(now.getMinutes()).padStart(2, "0");
    const ss = String(now.getSeconds()).padStart(2, "0");

    return sendText(`TIME|${yyyy}-${mm}-${dd}|${hh}:${mi}:${ss}`);
  }

  async function processWriteQueue() {
    if (writeBusy) return;
    if (!enabled) return;
    if (!connected || !characteristic) return;

    const text = writeQueue.shift();
    if (!text) return;

    writeBusy = true;

    try {
      console.log("BLE write:", text);

      const encoder = new TextEncoder();
      const data = encoder.encode(text);

      await characteristic.writeValue(data);

      sendCount++;
      lastSentText = text;
      lastError = "";

      updateStatusUI();

    } catch (err) {
      console.warn("BLE write ERROR:", err);

      connected = false;
      characteristic = null;

      setError(err.message || String(err));
      scheduleReconnect();

    } finally {
      writeBusy = false;

      setTimeout(() => {
        processWriteQueue();
      }, 80);
    }
  }

  function clearWriteQueue() {
    writeQueue = [];
    writeBusy = false;
  }

  function setError(message) {
    lastError = message;
    errorCount++;
    updateStatusUI();
  }

  // ==============================
  // Public API
  // ==============================
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

window.BLE = BLE;
