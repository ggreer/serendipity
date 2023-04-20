import React from 'react';
import classNames from 'classnames';

import './Videos.css';

import { SettingsContext } from './Settings';

import type {
  ClientMessage,
  ServerMessage,
  ServerMsgInfo,
  ServerSnapshotInfo,
  RoomInfo,
  User,
  UserJoinInfo,
  UserLeaveInfo,
} from './protocol';


class Socket {
  ws?: WebSocket;
  url: string;
  wsErrors = 0;
  wsReqId = 0;
  handler?: (a: ClientMessage) => void;

  constructor (url: string) {
    this.url = url;
  }

  connect () {
    console.log("connecting to ", this.url);
    this.ws = new WebSocket(this.url);
    this.ws.onerror = e => this.reconnect(e);
    this.ws.onclose = e => this.reconnect(e);
    this.ws.onmessage = e => this.handleMsg(e);
    this.ws.onopen = e => {
      console.log("connection opened to", this.url);
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
    const onReady = () => {
      this.send(msg);
    }
    if (ws.readyState !== WebSocket.OPEN) {
      if (ws.onopen) {
        console.error("OMG ALREADY ONOPEN");
      }
      ws.onopen = onReady;
      return;
    }
    ws.send(JSON.stringify({ ...msg, req_id: `req_${this.wsReqId++}`, }));
  }

  handleMsg (event: MessageEvent) {
    const msg = JSON.parse(event.data);
    if (!this.handler) {
      return;
    }
    console.log(msg);
    this.handler(msg);
  }

  setHandler (handler: (a: ClientMessage) => void) {
    this.handler = handler;
  }
}

const socket = new Socket("ws://localhost:4000/ws");

type UserWithSnapshot = User & { snapshot?: string };

type VideosProps = {};
type VideosState = {
  cameraStream?: MediaStream,
  snapshotData?: string,
  isVideoChatting: boolean,
  messages: Array<ServerMsgInfo>,
  users: Record<string, UserWithSnapshot>,
};

// TODO: check support for media APIs
const video_width = 640;
const video_height = 480;
const snapshot_interval = 60 * 1000;

export class Videos extends React.Component<VideosProps, VideosState> {
  canvasSelfRef = React.createRef<HTMLCanvasElement>();
  videoSelfRef = React.createRef<HTMLVideoElement>();
  messageInputRef = React.createRef<HTMLInputElement>();
  // cameraStream?: MediaStream;
  snapshotInterval: any;
  socket: Socket;
  // ws?: WebSocket;

  state: VideosState = {
    cameraStream: undefined,
    snapshotData: undefined,
    isVideoChatting: false,
    messages: [],
    users: {},
  };

  static contextType = SettingsContext;
  context!: React.ContextType<typeof SettingsContext>;

  constructor (props: VideosProps) {
    super(props);
    this.socket = socket;
    this.socket.setHandler(msg => this.handleMsg(msg));
  }

  componentDidMount () {
    console.log("mounted");
    this.socket.connect();
  }

  componentWillUnmount () {
    console.log("unmounting");
    this.socket.destroy();
    this.stop();
  }

  handleMsg (msg: ServerMessage) {
    switch (msg.cmd) {
      case "msg":
        const messages = this.state.messages;
        messages.push(msg.data as ServerMsgInfo);
        this.setState({ messages });
      break;
      case "room_info":
        this.setState({
          users: (msg.data as RoomInfo).users,
        });
      break;
      case "join":
        this.setState(prevState => {
          const userJoinInfo = (msg.data as UserJoinInfo);
          return { users: { ...prevState.users, [userJoinInfo.user_id]: userJoinInfo } };
        });
      break;
      case "leave":
        this.setState(prevState => {
          const userLeaveInfo = (msg.data as UserLeaveInfo);
          const users = { ...prevState.users };
          delete users[userLeaveInfo.user_id];
          return { users };
        });
      break;
      case "snapshot":
        const snapshot = (msg.data as ServerSnapshotInfo);
        this.setState({
          users: {
            ...this.state.users,
            [snapshot.user_id]: {
              ...this.state.users[snapshot.user_id],
              snapshot: snapshot.snapshot,
            },
          },
        });
      break;
      case "error":
        console.error(msg.data);
      break;
      default:
        const exhaustiveCheck: never = msg.cmd;
        throw new Error(`Unhandled case: ${exhaustiveCheck}`);
    }
  }

  async start () {
    this.snapshot();
    this.snapshotInterval = setInterval(() => this.snapshot(), snapshot_interval);
  }

  async stop () {
    clearInterval(this.snapshotInterval);
    this.stopCamera();
  }

  async snapshot () {
    if (!this.videoSelfRef.current || !this.canvasSelfRef.current) {
      console.error("WTF", this.videoSelfRef.current, this.canvasSelfRef.current);
      return;
    }

    let { cameraStream } = this.state;
    if (!cameraStream) {
      cameraStream = await this.startCamera();

      this.videoSelfRef.current.srcObject = cameraStream;
      this.videoSelfRef.current?.play();

      // Most cameras take a second or two to "warm up" (get correct exposure)
      console.log("warming up...");
      await new Promise<void>((resolve) => setTimeout(() => resolve(), 2000));
      console.log("warmed up");
    }

    const context = this.canvasSelfRef.current.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
    const canvas = this.canvasSelfRef.current;
    canvas.width = video_width/2;
    canvas.height = video_height/2;
    context.drawImage(this.videoSelfRef.current, 0, 0, canvas.width, canvas.height);
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      // weighted average of RGB values to mimic human color perception. We see greens much better than we see blues or reds.
      const luminosity =
        0.21 * data[i] +
        0.72 * data[i + 1] +
        0.07 * data[i + 2];
      data[i] = luminosity;
      data[i + 1] = luminosity;
      data[i + 2] = luminosity;
    }
    context.putImageData(imageData, 0, 0);
    const dataUrl = this.canvasSelfRef.current.toDataURL("image/jpeg");
    this.setState({
      snapshotData: dataUrl,
    });
    this.socket.send({
      cmd: "snapshot",
      data: dataUrl,
    });
  }

  async startCamera (constraints?: MediaStreamConstraints): Promise<MediaStream> {
    const cameraStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user", // Prefer selfie cam if on mobile
          deviceId: this.context.camera,
        },
        ...constraints,
      });
    this.setState({
      cameraStream,
    })
    return cameraStream;
  }

  stopCamera () {
    const { cameraStream } = this.state;
    if (!cameraStream) {
      return;
    }
    cameraStream.getTracks().forEach(track => track.stop());
    this.setState({
      cameraStream: undefined,
      snapshotData: "",
    });
    // clear latest snapshot for everyone else
    this.socket.send({
      cmd: "snapshot",
      data: "",
    });
  }

  async startVideo (user?: User) {
    if (!this.videoSelfRef.current) {
      return;
    }
    this.videoSelfRef.current.srcObject = await this.startCamera({ audio: true });;
    this.videoSelfRef.current.play();
    // this.videoSelfRef.current.muted = false;
  }

  stopVideo (user?: User) {
    if (!this.videoSelfRef.current) {
      return;
    }
    // this.videoSelfRef.current.muted = true;
    this.videoSelfRef.current.pause();
    this.videoSelfRef.current.srcObject = null;

    this.stopCamera();
  }

  sendMessage (e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!this.messageInputRef.current) {
      return;
    }
    const msg = this.messageInputRef.current.value;
    this.socket.send({
      cmd: "msg",
      data: msg,
    });
    this.messageInputRef.current.value = "";
  }

  render () {
    const { cameraStream, snapshotData, isVideoChatting, messages, users } = this.state;

    return <div className="Videos">
      { cameraStream
        ? <button type="button" onClick={() => this.stop()} disabled={!cameraStream}>Turn off camera</button>
        : <button type="button" onClick={() => this.start()} disabled={!!cameraStream}>Turn on camera</button>
      }
      &nbsp;&nbsp;&nbsp;
      { isVideoChatting
        ? <button type="button" onClick={() => this.stopVideo()}>Stop all video chat</button>
        : <button type="button" onClick={() => this.startVideo()}>Start all video chat</button>
      }
      <br />
      Canvas: <canvas id="canvas_self" ref={this.canvasSelfRef} />
      Image: <img id="img_self" className="user_image" src={snapshotData || `${process.env.PUBLIC_URL}/portrait_placeholder.png`} />


      <video id="video_self" ref={this.videoSelfRef} style={{ display: isVideoChatting ? "visible" : "none" }} width="300" muted />

      <br />
      <hr />
      <br />

      { Object.values(users).map((u, i) => <UserTile key={u.user_id} user={u} isSelf={false} onClick={() => this.startVideo(u)} />) }
      <ul id="user_list">
        { Object.values(users).map((u, i) => <li key={i}>{ u.name }</li>) }
      </ul>

      <div id="chat">
        { messages.map((m, i) => <code key={i}>{ m.user.name }: { m.msg }<br /></code>) }
      </div>
      <form onSubmit={e => this.sendMessage(e)}>
        <input type="text" ref={this.messageInputRef} />
        <button type="submit">Send</button>
      </form>
    </div>;
  }
}

const UserTile = ({ user, isSelf, onClick }: { user: UserWithSnapshot, isSelf: boolean, onClick: () => void }) => {
  return <div className="user_tile" onClick={onClick}>
    <img className="user_image" src={user.snapshot || `${process.env.PUBLIC_URL}/portrait_placeholder.png`} />
    { user.name } { isSelf ? "(You)" : "" }
  </div>
};
