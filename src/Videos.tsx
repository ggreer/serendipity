import React from 'react';
import classNames from 'classnames';

import './Videos.css';

import { SettingsContext } from './Settings';

import type {
  ClientMessage,
  RoomInfo,
  ServerMessage,
  ServerMsgInfo,
  ServerSnapshotInfo,
  StartVideoInfo,
  StopVideoInfo,
  User,
  UserId,
  UserJoinInfo,
  UserLeaveInfo,
} from './protocol';

import { Socket, socket } from './socket';


type UserWithSnapshot = User & { snapshot?: string };

type VideosProps = {};
type VideosState = {
  cameraStream?: MediaStream,
  snapshotData?: string,
  isVideoChatting: boolean,
  messages: Array<ServerMessage>,
  users: Record<string, UserWithSnapshot>,
};

// TODO: check support for media APIs
const video_width = 640;
const video_height = 480;
const snapshot_interval = 60 * 1000;

const config = {
  // iceServers: [{ urls: "stun:stun.mystunserver.tld" }],
};


export class Videos extends React.Component<VideosProps, VideosState> {
  canvasSelfRef = React.createRef<HTMLCanvasElement>();
  videoSelfRef = React.createRef<HTMLVideoElement>();
  messageInputRef = React.createRef<HTMLInputElement>();
  // cameraStream?: MediaStream;
  snapshotInterval: any;
  socket: Socket;
  // ws?: WebSocket;
  id: UserId;

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
    this.id = "";
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
    this.stopSnapshots();
  }

  handleMsg (msg: ServerMessage) {
    const messages = this.state.messages;
    messages.push(msg);
    this.setState({ messages });

    switch (msg.cmd) {
      case "room_info":
        const room_info = msg.data as RoomInfo;
        this.id = room_info.you;
        this.setState({
          users: room_info.users,
        });
      break;
      case "start_video":
      break;
      case "stop_video":
      break;
      case "msg":
      break;
      case "join":
        const userJoinInfo = (msg.data as UserJoinInfo);
        this.setState({
          users: { ...this.state.users, [userJoinInfo.user_id]: userJoinInfo },
        });
      break;
      case "leave":
        this.setState(prevState => {
          const userLeaveInfo = (msg.data as UserLeaveInfo);
          const users = { ...prevState.users };
          delete users[userLeaveInfo.user_id];
          return { messages, users };
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

  async startSnapshots () {
    this.snapshot();
    this.snapshotInterval = setInterval(() => this.snapshot(), snapshot_interval);
  }

  async stopSnapshots () {
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
    if (this.state.cameraStream) {
      return this.state.cameraStream;
    }
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
      console.error("No video ref");
      return;
    }

    // TODO: fix this logic to work with multiple users
    if (this.state.isVideoChatting) {
      console.error("already video chatting");
      return;
    }
    const cameraStream = await this.startCamera({ audio: true });
    this.videoSelfRef.current.srcObject = cameraStream;
    this.videoSelfRef.current.play();
    this.setState({
      isVideoChatting: true,
    });

    const pc = new RTCPeerConnection(config);
    for (const track of cameraStream.getTracks()) {
      pc.addTrack(track, cameraStream);
    }
    this.socket.send({
      cmd: "start_video",
      data: {
        from: this.id,
        to: user?.user_id ?? "",
        pc_description: JSON.stringify(pc.localDescription),
      }
    });
  }

  stopVideo (user?: User) {
    if (!this.videoSelfRef.current) {
      return;
    }
    // this.videoSelfRef.current.muted = true;
    this.videoSelfRef.current.pause();
    this.videoSelfRef.current.srcObject = null;
    this.setState({
      isVideoChatting: false,
    });

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
        ? <button type="button" onClick={() => this.stopSnapshots()} disabled={!cameraStream}>Turn off camera</button>
        : <button type="button" onClick={() => this.startSnapshots()} disabled={!!cameraStream}>Turn on camera</button>
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

      <Messages messages={messages} />
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
  </div>;
};

const Messages = ({ messages }: { messages: Array<ServerMessage>, }) => {
  return <div id="chat">
    { messages.map((m, i) => {
      const { cmd, data } = m;
      switch (cmd) {
        case "join":
          return <code key={i}>{ (data as UserJoinInfo).name } joined<br /></code>;
          break;
        case "leave":
          return <code key={i}>{ (data as UserLeaveInfo).name } left<br /></code>;
          break;
        case "msg":
          return <code key={i}>{ (data as ServerMsgInfo).user.name }: { (data as ServerMsgInfo).msg }<br /></code>;
          break;
        case "start_video":
          return <code key={i}>{ (data as StartVideoInfo).from } started video chat with { (data as StartVideoInfo).to }<br /></code>;
          break;
        case "stop_video":
          return <code key={i}>{ (data as StopVideoInfo).from } stopped video chat with { (data as StopVideoInfo).to }<br /></code>;
          break;
      }
    }) }
  </div>;
};
