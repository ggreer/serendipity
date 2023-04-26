import React, { VideoHTMLAttributes, useEffect, useRef } from 'react'
import classNames from 'classnames';

import './Videos.css';

import { SettingsContext } from './Settings';

import type {
  ClientMessage,
  RoomInfo,
  ServerMessage,
  ServerMsgInfo,
  ServerSnapshotInfo,
  OfferVideoInfo,
  AcceptVideoInfo,
  IceCandidateInfo,
  StopVideoInfo,
  User,
  UserId,
  UserJoinInfo,
  UserLeaveInfo,
} from './protocol';

import { Socket, socket } from './socket';


type UserWithData = User & {
  snapshot?: string,
  mediaStream?: MediaStream,
};

type VideosProps = {};
type VideoState = "off" | "snapshot" | "on";
type VideosState = {
  id: UserId,
  cameraStream?: MediaStream,
  videoState: VideoState,
  messages: Array<ServerMessage>,
  users: Record<string, UserWithData>,
};

// TODO: check support for media APIs
const video_width = 640;
const video_height = 480;
const snapshot_interval = 60 * 1000;

const config = {
  iceServers: [
    { urls: ["stun:stun.l.google.com:19302"] },
    { urls: ["turns:turn.floobits.com:5349"],
      username: "floobits",
      credential: "stiboolf",
    },
  ],
};

export class Videos extends React.Component<VideosProps, VideosState> {
  canvasSelfRef = React.createRef<HTMLCanvasElement>();
  videoSelfRef = React.createRef<HTMLVideoElement>();
  messageInputRef = React.createRef<HTMLInputElement>();
  // cameraStream?: MediaStream;
  snapshotInterval: any;
  socket: Socket;
  // ws?: WebSocket;
  pcs: Record<UserId, RTCPeerConnection>;

  state: VideosState = {
    id: "",
    cameraStream: undefined,
    videoState: "off",
    messages: [],
    users: {},
  };

  static contextType = SettingsContext;
  context!: React.ContextType<typeof SettingsContext>;

  constructor (props: VideosProps) {
    super(props);
    this.pcs = {};
    this.socket = socket;
    this.socket.setHandler(msg => this.handleMsg(msg));
  }

  componentDidMount () {
    console.log("mounted");
    this.socket.connect();
    this.startSnapshots();
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
        const roomInfo = msg.data as RoomInfo;
        this.setState({
          users: roomInfo.users,
          id: roomInfo.you,
        });
      break;
      case "offer_video":
        this.handleOfferVideo(msg.data as OfferVideoInfo);
      break;
      case "accept_video":
        this.handleAcceptVideo(msg.data as AcceptVideoInfo);
      break;
      case "ice_candidate":
        this.handleIceCandidate(msg.data as IceCandidateInfo);
      break;
      case "stop_video":
      break;
      case "msg":
      break;
      case "join":
        const userJoinInfo = (msg.data as UserJoinInfo);
        this.setState({
          users: { ...this.state.users, [userJoinInfo.user_id]: {...userJoinInfo } },
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
    this.setState(prevState => {
      return {
        users: {
          ...prevState.users,
          [prevState.id]: {
            ...prevState.users[prevState.id],
            snapshot: dataUrl,
          },
        },
      }
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
        audio: true,
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
    this.setState(prevState => {
      return {
        cameraStream: undefined,
        users: {
          ...prevState.users,
          [prevState.id]: {
            ...prevState.users[prevState.id],
            snapshot: "",
          },
        },
      }
    });

    // clear latest snapshot for everyone else
    this.socket.send({
      cmd: "snapshot",
      data: "",
    });
  }

  setupPeerConnection (pc: RTCPeerConnection, userId: UserId) {
    //TODO: check if this already exists
    this.pcs[userId] = pc;

    pc.oniceconnectionstatechange = () => {
      console.log("ice connection state change", pc.iceConnectionState);
      if (pc.iceConnectionState === "failed") {
        console.warn("failed. restarting ice");
        pc.restartIce();
        // maybe send to socket?
      }
    };
    pc.onicecandidate = ({ candidate }) => {
      if (!candidate) {
        console.log("no candidate");
        return;
      }
      socket.send({
        cmd: "ice_candidate",
        data: {
          to: userId,
          from: this.state.id,
          candidate: JSON.stringify(candidate),
        },
      });
    };
    pc.ontrack = ({ track, streams }) => {
      console.log("new track", track, "streams:", streams);
      track.onunmute = () => {
        console.log("unmuted track", track);
        const u = this.state.users[userId];
        this.setState({
          users: { ...this.state.users, [userId]: {...u, mediaStream: streams[0] } },
        });
        const videoElem = document.getElementById(`video_${userId}`);
        if (videoElem) {
          (videoElem as HTMLVideoElement).srcObject = streams[0];
        } else {
          console.warn("no video elem", `video_${userId}`);
        }
      };
    };
  }

  async startVideo (user?: User) {
    if (!this.videoSelfRef.current) {
      console.error("No video ref");
      return;
    }

    if (!user) {
      for (const [id, user] of Object.entries(this.state.users)) {
        await this.startVideo(user);
      }
      return;
    }

    if (user.user_id === this.state.id) {
      console.warn("not starting video chat with self");
      return;
    }

    // TODO: fix this logic to work with multiple users
    if (this.state.videoState === "on") {
      console.error("already video chatting");
      return;
    }
    const cameraStream = await this.startCamera({ audio: true });
    this.videoSelfRef.current.srcObject = cameraStream;
    this.videoSelfRef.current.play();
    this.setState({
      cameraStream,
      videoState: "on",
    });

    const pc = new RTCPeerConnection(config);
    for (const track of cameraStream.getTracks()) {
      pc.addTrack(track, cameraStream);
    }

    this.setupPeerConnection(pc, user.user_id);
    pc.onnegotiationneeded = async () => {
      await pc.setLocalDescription();
      this.socket.send({
        cmd: "offer_video",
        data: {
          from: this.state.id, // server ignores this
          to: user?.user_id ?? "",
          pc_description: JSON.stringify(pc.localDescription),
        }
      });
    }
  }

  async handleOfferVideo (ovi: OfferVideoInfo) {
    // someone wants to video chat with us
    if (ovi.from === this.state.id) {
      console.log("offer video from self. ignoring");
      return;
    }
    if (ovi.to !== this.state.id) {
      console.log("offer video to someone else. ignoring")
      return;
    }

    if (!this.videoSelfRef.current) {
      console.error("No video ref");
      return;
    }

    const cameraStream = await this.startCamera({ audio: true });
    this.videoSelfRef.current.srcObject = cameraStream;
    this.videoSelfRef.current.play();
    this.setState({
      cameraStream,
      videoState: "on",
    });

    const pc = new RTCPeerConnection(config);
    for (const track of cameraStream.getTracks()) {
      pc.addTrack(track, cameraStream);
    }

    this.setupPeerConnection(pc, ovi.from);
    await pc.setRemoteDescription(JSON.parse(ovi.pc_description));
    await pc.setLocalDescription();

    // pc.onnegotiationneeded = async () => {
    this.socket.send({
      cmd: "accept_video",
      data: {
        from: this.state.id,
        to: ovi.from,
        pc_description: JSON.stringify(pc.localDescription),
      },
    });
    // }
  }

  async handleAcceptVideo (avi: AcceptVideoInfo) {
    if (avi.from === this.state.id) {
      console.log("accept video from self. ignoring");
      return;
    }
    if (avi.to !== this.state.id) {
      console.log("accept video to someone else. ignoring")
      return;
    }
    const pc = this.pcs[avi.from];
    const description = JSON.parse(avi.pc_description);
    // if (description.type === "offer") {
    //   return;
    // }
    await pc.setRemoteDescription(description);
  }

  async handleIceCandidate (ici: IceCandidateInfo) {
    if (ici.from === this.state.id) {
      console.log("ice candidate from self. ignoring");
      return;
    }
    if (ici.to !== this.state.id) {
      console.log("ice candidate to someone else. ignoring")
      return;
    }
    const pc = this.pcs[ici.from];

    if (!pc) {
      console.error("no peer connection for", ici.from, this.pcs);
      return;
    }
    const candidate = new RTCIceCandidate(JSON.parse(ici.candidate));
    await pc.addIceCandidate(candidate);
  }

  stopVideo (user?: User) {
    if (!this.videoSelfRef.current) {
      return;
    }
    // this.videoSelfRef.current.muted = true;
    this.videoSelfRef.current.pause();
    this.videoSelfRef.current.srcObject = null;
    this.setState({
      videoState: "off",
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
    const { cameraStream, videoState, messages, users, id } = this.state;

    return <div className="Videos">
      { cameraStream
        ? <button type="button" onClick={() => this.stopSnapshots()} disabled={!cameraStream}>Turn off camera</button>
        : <button type="button" onClick={() => this.startSnapshots()} disabled={!!cameraStream}>Turn on camera</button>
      }
      &nbsp;&nbsp;&nbsp;
      { videoState === "on"
        ? <button type="button" onClick={() => this.stopVideo()}>Stop all video chat</button>
        : <button type="button" onClick={() => this.startVideo()}>Start all video chat</button>
      }
      <canvas id="canvas_self" ref={this.canvasSelfRef} />
      <video id="video_self" ref={this.videoSelfRef} style={{ display: videoState === "on" ? undefined : "none" }} width="300" muted />
      <br />
      <hr />
      <br />

      { Object.values(users).map((u, i) => <UserTile key={u.user_id} user={u} isSelf={u.user_id === id } onClick={() => this.startVideo(u)} />) }
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

type VideoProps = VideoHTMLAttributes<HTMLVideoElement> & {
  srcObject?: MediaStream
}

const Video = ({ srcObject, ...props }: VideoProps) => {
  const refVideo = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    if (!refVideo.current || !srcObject) {
      return;
    }
    refVideo.current.srcObject = srcObject;
    refVideo.current.play();
  }, [srcObject])

  return <video ref={refVideo} {...props} />
};

const UserTile = ({ user, isSelf, onClick }: { user: UserWithData, isSelf: boolean, onClick: () => void }) => {
  const showVideo = user.mediaStream;
  return <div className="user_tile" onClick={onClick}>
    <Video
      id={`video_${user.user_id}`}
      width="300"
      srcObject={user.mediaStream}
      style={{ display: showVideo ? undefined : "none" }}
    />
    <img
      className="user_image"
      src={user.snapshot || `${process.env.PUBLIC_URL}/portrait_placeholder.png`}
      style={{ display: showVideo ? "none" : undefined }}
    />
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
        case "offer_video":
          return <code key={i}>{ (data as OfferVideoInfo).from } offered video chat to { (data as OfferVideoInfo).to || "everyone" }<br /></code>;
          break;
        case "accept_video":
          return <code key={i}>{ (data as AcceptVideoInfo).from } accepted video chat with { (data as AcceptVideoInfo).to }<br /></code>;
          break;
        case "stop_video":
          return <code key={i}>{ (data as StopVideoInfo).from } stopped video chat with { (data as StopVideoInfo).to }<br /></code>;
          break;
      }
    }) }
  </div>;
};
