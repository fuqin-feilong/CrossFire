export class Net {
  constructor({ onOpen, onMessage, onClose, onReplaced }) {
    this.onOpen = onOpen;
    this.onMessage = onMessage;
    this.onClose = onClose;
    this.onReplaced = onReplaced;
    this.ws = null;
    this.manual = false;
    this.retry = 0;
    this.timer = null;
  }

  connect() {
    if (this.ws && (this.ws.readyState === 0 || this.ws.readyState === 1)) return;
    clearTimeout(this.timer);
    this.manual = false;

    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${location.host}/ws`);
    this.ws = ws;

    ws.onopen = () => {
      this.retry = 0;
      this.onOpen?.();
    };

    ws.onmessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      this.onMessage?.(msg);
    };

    ws.onclose = (event) => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (event.code === 4001) {
        this.onReplaced?.();
        return;
      }
      this.onClose?.(event);
      if (!this.manual) this.scheduleReconnect();
    };

    ws.onerror = () => {
      // onclose handles retry.
    };
  }

  scheduleReconnect() {
    this.retry += 1;
    const delay = Math.min(5000, 600 * this.retry);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.connect(), delay);
  }

  send(message) {
    if (!this.ws || this.ws.readyState !== 1) return false;
    this.ws.send(JSON.stringify(message));
    return true;
  }

  close() {
    this.manual = true;
    clearTimeout(this.timer);
    this.ws?.close();
    this.ws = null;
  }
}
