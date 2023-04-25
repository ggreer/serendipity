// handy wrapper for websocket reconnect/json stuff
import type { ClientMessage } from './protocol';

export class Socket {
  ws?: WebSocket;
  url: string;
  wsErrors = 0;
  wsReqId = 0;
  handler?: (a: ClientMessage) => void;
  onOpenMsgs: Array<Omit<ClientMessage, "req_id">> = [];

  constructor (url: string) {
    this.url = url;
  }

  connect () {
    console.log("connecting to ", this.url);
    this.onOpenMsgs = [];
    this.ws = new WebSocket(this.url);
    this.ws.onerror = e => this.reconnect(e);
    this.ws.onclose = e => this.reconnect(e);
    this.ws.onmessage = e => this.handleMsg(e);
    this.ws.onopen = e => {
      console.log("connection opened to", this.url);
      for (const m of this.onOpenMsgs) {
        this.send(m);
      }
      this.onOpenMsgs = [];
    };
  }

  async reconnect (e: Event|CloseEvent) {
    this.wsErrors++;
    this.wsReqId = 0;
    const wait = Math.pow(1.5, this.wsErrors) * 1000;
    console.error("Websocket error", e);
    console.error(`Reconnecting in ${wait}ms`);
    await new Promise<void>((resolve) => setTimeout(() => resolve(), wait));
    if (this.ws?.readyState === WebSocket.CONNECTING) {
      return;
    }

    this.connect();
  }

  destroy () {
    const { ws } = this;
    if (!ws) {
      console.debug("no websocket. not destroying");
      return;
    }
    ws.onerror = null;
    ws.onclose = null;
    ws.onmessage = null;
    ws.close();
    if (ws.readyState in [WebSocket.CONNECTING, WebSocket.CLOSING, WebSocket.CLOSED]) {
      console.log("socket destroy: doing nothing because websocket is in state", ws.readyState);
      return;
    }
    // WebSocket.OPEN
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
    console.log("sending", msg);
    ws.send(JSON.stringify({ ...msg, req_id: `req_${this.wsReqId++}`, }));
  }

  handleMsg (event: MessageEvent) {
    const msg = JSON.parse(event.data);
    if (!this.handler) {
      return;
    }
    console.log("got", msg);
    this.handler(msg);
  }

  setHandler (handler: (a: ClientMessage) => void) {
    this.handler = handler;
  }
}

export const socket = new Socket("ws://localhost:4000/ws");