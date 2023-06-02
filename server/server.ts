import { createServer } from "http";
import type { IncomingMessage } from "http";
import { parse } from "url";

import { WebSocket, WebSocketServer } from "ws";

import type {
  AcceptVideoInfo,
  ClientMessage,
  ClientMsgInfo,
  ClientSnapshotInfo,
  ClientUserInfo,
  IceCandidateInfo,
  KickInfo,
  MuteInfo,
  OfferVideoInfo,
  ServerMessage,
  ServerSnapshotInfo,
  StopVideoInfo,
  User,
  UserId,
  UserInfo,
  VideoChatGroups,
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
  const { method } = req;
  const { pathname } = parse(req.url ?? "");
  console.log(`Request from ${req.connection.remoteFamily} ${req.connection.remoteAddress}:${req.connection.remotePort} method ${method} path ${pathname}`);
  if (method === "GET" && pathname === "/healthz") {
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
  const { method } = req;
  const { pathname } = parse(req.url ?? "");
  console.log(`Upgrade from ${req.connection.remoteFamily} ${req.connection.remoteAddress}:${req.connection.remotePort} method ${method} path ${pathname}`);
  if (pathname && pathname.startsWith("/ws/")) {
    wss.handleUpgrade(req, socket, head, function done(ws) {
      wss.emit("connection", ws, req);
    });
  } else {
    console.log(`Upgrade failed. Destroying connection from ${req.connection.remoteFamily} ${req.connection.remoteAddress}:${req.connection.remotePort} method ${method} path ${pathname}`);
    socket.destroy();
  }
});
server.listen(parseInt(process.env.PORT || "") || 4000);

class Room {
  conns: Record<string, Connection> = {};
  name: string;
  groups: VideoChatGroups;
  groupCount: number;

  constructor (name: string) {
    this.name = name;
    this.conns = {};
    this.groups = {};
    this.groupCount = 0;
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
    if (!this.conns[conn.id]) {
      return;
    }
    delete this.conns[conn.id];
    this.send({ cmd: "leave", data: { user_id: conn.id, name: conn.name } });
    if (Object.values(this.conns).length === 0) {
      destroyRoom(this);
    }
  }

  async kick (ki: KickInfo) {
    const conn = this.conns[ki.user_id];
    if (!conn) {
      console.error(`kick: user ${ki.user_id} doesn't exist`);
      return;
    }
    conn.send({
      cmd: "kick",
      data: {
        user_id: ki.user_id,
        ban: ki.ban,
      }
    });
    // wait up to a second for stuff to be sent before disconnecting user
    for (let i = 0; i < 10; i++) {
      if (conn.ws.bufferedAmount === 0) {
        break;
      }
      await new Promise<void>((resolve) => setTimeout(() => resolve(), 100));
    }
    conn.destroy();
  }

  offerVideo (ovi: OfferVideoInfo, from: Connection) {
    const to = this.conns[ovi.to];
    if (!to) {
      from.send({
        cmd: "error",
        data: "User does not exist.",
      });
      return;
    }
    if (from.group && to.group) {
      if (from.group === to.group) {
        // they're already in the same group. do nothing. maybe sanity check that they're both in the actual group
      } else {
        // if both are in groups, join groups. that means a new command so that clients are on the same page and all start chats with each other
        console.error("OMG they're both in different groups", from.group, to.group);
        throw new Error("NEED TO FIX THIS");
        // options: make them leave the group. combine groups
      }
    } else if (from.group) {
      // if from is in a group but to isn't, to join's from's group
      this.groups[from.group].push(to.id);
      to.group = from.group;
    } else if (to.group) {
      // if from is not in a group but to is, from join's to's group
      // (in other words if only one is video chatting, join the new person to the existing group)
      this.groups[to.group].push(from.id);
      from.group = to.group;
    } else {
      // if nobody is video chatting, create a group and join both to it
      const groupId = (this.groupCount++).toString();
      this.groups[groupId] = [to.id, from.id];
      to.group = groupId;
      from.group = groupId;
    }
    this.send({
      cmd: "group",
      data: {
        id: from.group,
        users: this.groups[from.group],
      }
    });
    this.send({
      cmd: "offer_video",
      data: {
        from: from.id,
        to: ovi.to,
        pc_description: ovi.pc_description,
      },
    }, from.id);
    console.dir(this.groups);
  }

  acceptVideo (avi: AcceptVideoInfo, from: Connection) {
    const to = this.conns[avi.to];
    if (!to) {
      from.send({
        cmd: "error",
        data: "User does not exist.",
      });
      return;
    }

    this.send({
      cmd: "accept_video",
      data: {
        from: from.id,
        to: avi.to,
        pc_description: avi.pc_description,
      },
    }, from.id);
  }

  stopVideo (svi: StopVideoInfo, from: Connection) {
    const to = this.conns[svi.to];
    if (!to) {
      from.send({
        cmd: "error",
        data: "User does not exist.",
      });
      return;
    }

    this.send({
      cmd: "stop_video",
      data: {
        from: from.id,
        to: svi.to,
      },
    }, from.id);

    if (from.group === null || to.group === null) {
      // TODO: unclear if this is correct
      from.send({
        cmd: "error",
        data: "Can't stop video for users who aren't video chatting.",
      });
      return;
    }

    if (from.group !== to.group) {
      from.send({
        cmd: "error",
        data: "Can't stop video for two users who aren't in the same video chat.",
      });
      return;
    }

    this.groups[from.group] = this.groups[from.group].filter(userId => userId !== from.id && userId !== to.id);
    this.send({
      cmd: "group",
      data: {
        id: from.group,
        users: this.groups[from.group],
      }
    });
    if (this.groups[from.group].length === 0) {
      delete this.groups[from.group];
    }
    to.group = null;
    from.group = null;
  }
}


const rooms: Record<string, Room> = {};

// TODO: auth
function getOrCreateRoom (ws: WebSocket, req: IncomingMessage): Room {
  const { pathname } = parse(req.url ?? "");
  if (!pathname) {
    throw new Error("No room name specified.");
  }
  let room = rooms[pathname];
  if (!room) {
    console.log(`New room '${pathname}'`);
    room = new Room(pathname);
    rooms[pathname] = room;
  }
  return room;
}

function destroyRoom (room: Room) {
  console.log(`Room ${room.name} empty. Destroying.`);
  delete rooms[room.name];
}


class Connection {
  isAlive: boolean;
  ws: WebSocket;
  req: IncomingMessage;
  id: string;
  heartbeatInterval: NodeJS.Timer;
  name: string;
  snapshot: string;
  room: Room;
  group: string|null;
  destroyed: boolean;
  muted: boolean;

  constructor (ws: WebSocket, req: IncomingMessage) {
    this.ws = ws;
    this.req = req;
    this.id = `userid_${ids++}`;
    this.isAlive = true;
    this.group = null;
    this.destroyed = false;
    this.muted = false;
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

    let r: Room|undefined;
    try {
      r = getOrCreateRoom(ws, req);
    } catch (e) {
      this.send({
        cmd: "error",
        data: (e as Error).toString(),
      });
      this.room = new Room(""); // create a dummy room object so typescript isn't angry
      this.destroy();
      return;
    }
    this.room = r;
    this.room.add(this);
    const roomInfo: Record<string, User & UserInfo> = {};
    for (const [conn_id, conn] of Object.entries(this.room.conns)) {
      roomInfo[conn_id] = {
        name: conn.name,
        user_id: conn.id,
        snapshot: conn.snapshot,
        group: conn.group,
        muted: conn.muted,
      }
    }
    this.send({
      cmd: "room_info",
      data: {
        name: this.room.name,
        users: roomInfo,
        you: this.id,
        groups: this.room.groups,
      },
    });
  }

  toString () {
    const req = this.req;
    return `id ${this.id} ${req.connection.remoteFamily} ${req.connection.remoteAddress}:${req.connection.remotePort}`;
  }

  send (msg: ServerMessage) {
    if (msg.cmd !== "snapshot") {
      console.debug(this.toString(), "send", JSON.stringify(msg, null, 2));
    }
    this.ws.send(JSON.stringify(msg));
  }

  respond (req_id: string, msg: Omit<ServerMessage, "res_id">) {
    this.send({...msg, res_id: req_id});
  }

  handleMessage (msg: ClientMessage) {
    if (msg.cmd !== "snapshot") {
      console.debug(this.toString(), "recv", JSON.stringify(msg, null, 2));
    }
    if (!msg.req_id) {
      this.send({ cmd: "error", data: "Unknown command. No req_id." });
      return;
    }
    switch (msg.cmd) {
      case "error":
        console.error(`Error from ${this.toString()}`);
        break;
      case "msg":
        this.room.send({
          cmd: "msg",
          data: {
            user: { user_id: this.id, name: this.name },
            msg: (msg.data as ClientMsgInfo),
          },
        });
        break;
      case "snapshot":
        const snapshot = (msg.data as ClientSnapshotInfo);
        this.room.send({
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
        this.room.offerVideo(ovi, this);
        break;
      case "accept_video":
        const avi = (msg.data as AcceptVideoInfo);
        this.room.acceptVideo(avi, this);
        break;
      case "ice_candidate":
        const ici = (msg.data as IceCandidateInfo);
        this.room.send({
          cmd: "ice_candidate",
          data: {
            from: this.id,
            to: ici.to,
            candidate: ici.candidate,
          },
        }, this.id);
        break;
      case "stop_video":
        const svi = (msg.data as StopVideoInfo);
        this.room.stopVideo(svi, this);
        break;
      case "user_info":
        const ui = (msg.data as ClientUserInfo);
        this.name = ui.name;
        this.room.send({
          cmd: "user_info",
          data: {
            user_id: this.id,
            name: this.name,
          }
        });
        break;
      case "kick":
        const ki = (msg.data as KickInfo);
        this.room.kick(ki);
        break;
      case "mute":
        const mi = (msg.data as MuteInfo);
        const conn = this.room.conns[mi.user_id];
        if (!conn) {
          this.send({ cmd: "error", data: `mute: user ${mi.user_id} doesn't exist` })
          return;
        }
        conn.muted = mi.mute;
        this.room.send({
          cmd: "mute",
          data: {
            user_id: mi.user_id,
            mute: mi.mute,
          },
        });
        break;
      default:
        this.respond(msg.req_id, { cmd: "error", data: "Unknown command" });
        const exhaustiveCheck: never = msg.cmd;
        throw new Error(`Unhandled case: ${exhaustiveCheck}`);
    }
  }

  destroy () {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.room.remove(this);
    this.ws.terminate();
    clearInterval(this.heartbeatInterval);
  }
}

// TODO: auth. have multiple "rooms"

wss.on("connection", (ws, req) => {
  const conn = new Connection(ws, req);
});
