import { createServer } from "http";
import type { IncomingMessage } from "http";
import { parse } from "url";

import { WebSocket, WebSocketServer } from "ws";

import type {
  ClientMessage,
  ClientMsgInfo,
  ClientSnapshotInfo,
  ServerMessage,
  ServerSnapshotInfo,
  OfferVideoInfo,
  AcceptVideoInfo,
  IceCandidateInfo,
  StopVideoInfo,
  User,
  UserId,
} from "../src/protocol";


let ids = 0;

const wss = new WebSocketServer({
  noServer: true,
  perMessageDeflate: {
    zlibDeflateOptions: {
      // See zlib defaults.
      chunkSize: 1024,
      memLevel: 7,
      level: 3
    },
    zlibInflateOptions: {
      chunkSize: 10 * 1024
    },
    // Other options settable:
    clientNoContextTakeover: true, // Defaults to negotiated value.
    serverNoContextTakeover: true, // Defaults to negotiated value.
    serverMaxWindowBits: 10, // Defaults to negotiated value.
    // Below options specified as default values.
    concurrencyLimit: 10, // Limits zlib concurrency for perf.
    threshold: 1024 // Size (in bytes) below which messages
    // should not be compressed if context takeover is disabled.
  },
});

const server = createServer((req, res) => {
  const { pathname } = parse(req.url ?? "");
  if (pathname === "/healthz") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "OK" }));
    return;
  }
  res.writeHead(400, { "Content-Type": "text/plain" });
  res.end("bad request");
});
server.on("listening", () => {
  console.log("listening", server.address());
});
server.on("upgrade", (req, socket, head) => {
  const { pathname } = parse(req.url ?? "");
  if (pathname === "/ws") {
    wss.handleUpgrade(req, socket, head, function done(ws) {
      wss.emit("connection", ws, req);
    });
  } else {
    socket.destroy();
  }
});
server.listen(parseInt(process.env.PORT || "") || 4000);


class Room {
  conns: Record<string, Connection> = {};

  constructor () {
    this.conns = {};
  }

  send (msg: Omit<ServerMessage, "res_id">, from?: UserId) {
    for (const [id, conn] of Object.entries(this.conns)) {
      if (id === from) {
        continue;
      }
      conn.send(msg);
    }
  }

  add (conn: Connection) {
    this.send({ cmd: "join", data: { user_id: conn.id, name: conn.name } });
    this.conns[conn.id] = conn;
  }

  remove (conn: Connection) {
    delete this.conns[conn.id];
    this.send({ cmd: "leave", data: { user_id: conn.id, name: conn.name } });
  }
}

const room = new Room();


class Connection {
  isAlive: boolean;
  ws: WebSocket;
  req: IncomingMessage;
  id: string;
  heartbeatInterval: NodeJS.Timer;
  name: string;
  snapshot: string;

  constructor (ws: WebSocket, req: IncomingMessage) {
    this.ws = ws;
    this.req = req;
    this.id = `userid_${ids++}`;
    this.isAlive = true;
    console.log(`Connection from ${this.toString()}`);

    ws.on("close", (code, reason) => {
      console.log(`Connection from ${this.toString()} closed. Code: ${code}. Reason: ${reason.toString()}`);
      this.destroy();
    });
    ws.on("error", err => {
      console.error(`${this.toString()} error: ${err}}`);
    });

    ws.on("pong", w => {
      this.isAlive = true;
      console.log(`pong ${this.toString()}`);
    });

    this.heartbeatInterval = setInterval(() => {
      if (this.isAlive === false) {
        console.warn(`${this.toString()} No pong after 30s. Terminating.`);
        this.destroy();
        return;
      }

      this.isAlive = false;
      ws.ping();
    }, 30000);

    ws.on("message", (data, isBinary) => {
      // console.log(data, isBinary);
      try {
        const msg = JSON.parse(data.toString()) as ClientMessage;
        this.handleMessage(msg);
      } catch (e) {
        console.error(e);
        this.destroy();
      }
    });

    // TODO: set username based on auth
    this.name = this.id;
    this.snapshot = "";

    // TODO: route room and auth based on req path
    room.add(this);
    const roomInfo: Record<string, User & ServerSnapshotInfo> = {};
    for (const [conn_id, conn] of Object.entries(room.conns)) {
      roomInfo[conn_id] = {
        name: conn.name,
        user_id: conn.id,
        snapshot: conn.snapshot,
      }
    }
    this.send({
      cmd: "room_info",
      data: {
        users: roomInfo,
        you: this.id,
      },
    });
  }

  toString () {
    const req = this.req;
    return `id ${this.id} ${req.connection.remoteFamily} ${req.connection.remoteAddress}:${req.connection.remotePort}`;
  }

  send (msg: ServerMessage) {
    console.debug(this.toString(), "send", JSON.stringify(msg, null, 2));
    this.ws.send(JSON.stringify(msg));
  }

  respond (req_id: string, msg: Omit<ServerMessage, "res_id">) {
    this.send({...msg, res_id: req_id});
  }

  handleMessage (msg: ClientMessage) {
    console.debug(this.toString(), "recv", JSON.stringify(msg, null, 2));
    if (!msg.req_id) {
      this.send({ cmd: "error", data: "Unknown command. No req_id." });
      return;
    }
    switch (msg.cmd) {
      case "error":
        console.error(`Error from ${this.toString()}`);
        break;
      case "msg":
        room.send({
          cmd: "msg",
          data: {
            user: { user_id: this.id, name: this.name },
            msg: (msg.data as ClientMsgInfo),
          },
        });
        break;
      case "snapshot":
        const snapshot = (msg.data as ClientSnapshotInfo);
        room.send({
          cmd: "snapshot",
          data: {
            user_id: this.id,
            snapshot,
          },
        }, this.id);
        this.snapshot = snapshot;
        break;
      case "offer_video":
        const ovi = (msg.data as OfferVideoInfo);
        room.send({
          cmd: "offer_video",
          data: {
            from: this.id,
            to: ovi.to,
            pc_description: ovi.pc_description,
          },
        }, this.id);
        break;
      case "accept_video":
        const avi = (msg.data as AcceptVideoInfo);
        room.send({
          cmd: "accept_video",
          data: {
            from: this.id,
            to: avi.to,
            pc_description: avi.pc_description,
          },
        }, this.id);
        break;
      case "ice_candidate":
        const ici = (msg.data as IceCandidateInfo);
        room.send({
          cmd: "ice_candidate",
          data: {
            from: this.id,
            to: ici.to,
            candidate: ici.candidate,
          },
        }, this.id);
        break;
      case "stop_video":
        const stopVideoInfo = (msg.data as StopVideoInfo);
        room.send({
          cmd: "stop_video",
          data: {
            from: this.id,
            to: stopVideoInfo.to,
          },
        }, this.id);
        break;
      default:
        this.respond(msg.req_id, { cmd: "error", data: "Unknown command" });
        const exhaustiveCheck: never = msg.cmd;
        // throw new Error(`Unhandled case: ${exhaustiveCheck}`);
    }
  }

  destroy () {
    room.remove(this);
    this.ws.terminate();
    clearInterval(this.heartbeatInterval);
  }
}

// TODO: auth. have multiple "rooms"

wss.on("connection", (ws, req) => {
  const conn = new Connection(ws, req);
});
