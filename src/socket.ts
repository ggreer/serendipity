// handy wrapper for websocket reconnect/json stuff
import type { ClientMessage, ServerMessage } from './protocol';

export class Socket {
  ws?: WebSocket;
  url: string;
  wsErrors = 0;
  wsReqId = 0;
  handler?: (a: ServerMessage) => void;
  onOpenMsgs: Array<Omit<ClientMessage, "req_id">> = [];
  reconnectTimeout?: NodeJS.Timeout;

  constructor (url: string) {
    this.url = url;
  }

  connect () {
    console.debug("connecting to", this.url);
    this.onOpenMsgs = [];
    this.ws = new WebSocket(this.url);
    this.ws.onerror = e => this.reconnect(e);
    this.ws.onclose = e => this.reconnect(e);
    this.ws.onmessage = e => this.handleMsg(e);
    this.ws.onopen = e => {
      console.debug("connection opened to", this.url);
      for (const m of this.onOpenMsgs) {
        this.send(m);
      }
      this.onOpenMsgs = [];
    };
  }

  reconnect (e: Event|CloseEvent) {
    this.wsErrors++;
    this.wsReqId = 0;
    const wait = Math.min(Math.pow(1.5, this.wsErrors) * 1000, 10000);
    console.error("Websocket error", e);
    console.error(`Reconnecting in ${wait}ms`);
    this.destroy();

    clearTimeout(this.reconnectTimeout);
    this.reconnectTimeout = setTimeout(() => {
      if (this.ws?.readyState === WebSocket.CONNECTING) {
        console.debug("websocket connecting. not trying to connect");
        return;
      }

      this.connect();
    }, wait);
  }

  destroy () {
    const { ws } = this;
    clearTimeout(this.reconnectTimeout);
    this.reconnectTimeout = undefined;
    if (!ws) {
      throw new Error("Can't destroy before connecting!");
    }
    ws.onerror = null;
    ws.onclose = null;
    ws.onmessage = null;
    ws.onopen = () => {
      console.debug("old websocket finally open. closing");
      ws.close();
    };
    console.debug(`socket destroy: websocket is in state ${ws.readyState}`, ws.readyState);
    if ([WebSocket.CONNECTING, WebSocket.CLOSING, WebSocket.CLOSED].includes(ws.readyState)) {
      console.debug("socket destroy: doing nothing because websocket is in state", ws.readyState);
      return;
    }
    ws.close();
    console.debug("socket destroy: websocket closed. websocket is in state", ws.readyState);
  }

  send (msg: Omit<ClientMessage, "req_id">) {
    const { ws } = this;
    if (!ws) {
      throw new Error("Can't send before connecting!");
    }
    if (ws.readyState !== WebSocket.OPEN) {
      this.onOpenMsgs.push(msg);
      console.debug(ws.readyState, "queued", msg);
      return;
    }
    console.debug("sending", msg);
    ws.send(JSON.stringify({ ...msg, req_id: `req_${this.wsReqId++}`, }));
  }

  handleMsg (event: MessageEvent) {
    const msg = JSON.parse(event.data);
    if (!this.handler) {
      console.debug("No handler for", msg);
      return;
    }
    console.debug("got", msg);
    try {
      this.handler(msg);
    } catch (e) {
      console.error("Error handling", msg, e);
    }
  }

  setHandler (handler: (a: ServerMessage) => void) {
    this.handler = handler;
  }
}

const protocol = document.location.protocol === "http:" ? "ws:" : "wss:";
let url = `${protocol}//${document.location.host}/ws${document.location.pathname}`;
if (process.env.NODE_ENV === "development") {
  url = `ws://${document.location.hostname}:4000/ws${document.location.pathname}`;
  // url = `wss://video.greer.fm/ws${document.location.pathname}`;
}

export const socket = new Socket(url);
