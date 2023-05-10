import React, { VideoHTMLAttributes, useEffect, useRef } from 'react'
import classNames from 'classnames';

import './Videos.css';

import { SettingsContext } from './Settings';
import { getPermissions } from './Permissions';
import { playStartVideo, playStopVideo } from './sounds';

import type {
  AcceptVideoInfo,
  ErrorInfo,
  GroupInfo,
  IceCandidateInfo,
  OfferVideoInfo,
  RoomInfo,
  ServerMessage,
  ServerMsgInfo,
  ServerSnapshotInfo,
  ServerUserInfo,
  StopVideoInfo,
  User,
  UserId,
  UserInfo,
  UserJoinInfo,
  UserLeaveInfo,
  VideoChatGroups,
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
  groups: VideoChatGroups,
};

// TODO: check support for media APIs
const video_width = 640;
const video_height = 480;
const snapshot_interval = 30 * 1000;

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
    groups: {},
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

    const maybeStartSnapshots = async () => {
      const { camera, microphone } = await getPermissions();
      if (camera === "granted" && microphone === "granted") {
        this.startSnapshots();
      }
    }
    if (this.context.autoSnapshot) {
      maybeStartSnapshots();
    }
  }

  componentWillUnmount () {
    console.log("unmounting");
    this.socket.destroy();
    this.stopSnapshots();
  }

  componentDidUpdate (prevProps: VideosProps, prevState: VideosState) {
    if (prevState.videoState === this.state.videoState) {
      return;
    }
    if (this.state.videoState === "on") {
      setTimeout(() => this.snapshot(), 500); // delay snapshot because video element might be solid white for a bit
      clearInterval(this.snapshotInterval);
      this.snapshotInterval = setInterval(() => this.snapshot(), 1000); // send snapshots more often when video chatting
    } else if (this.state.videoState === "snapshot") {
      clearInterval(this.snapshotInterval);
      this.snapshotInterval = setInterval(() => this.snapshot(), snapshot_interval);
    }
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
          groups: roomInfo.groups,
        });
        this.socket.send({
          cmd: "user_info",
          data: {
            name: this.context.name,
          }
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
        const stopVideoInfo = (msg.data as StopVideoInfo);
        const user = this.state.users[stopVideoInfo.from];
        this.stopVideo(user);
      break;
      case "msg":
      break;
      case "join":
        const userJoinInfo = (msg.data as UserJoinInfo);
        this.setState(prevState => {
          return {
            users: { ...prevState.users, [userJoinInfo.user_id]: { ...userJoinInfo } },
          };
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
        this.setState(prevState => {
          return {
            users: {
              ...prevState.users,
              [snapshot.user_id]: {
                ...prevState.users[snapshot.user_id],
                snapshot: snapshot.snapshot,
              },
            },
          };
        });
      break;
      case "group":
        const groupInfo = (msg.data as GroupInfo);
        this.setState(prevState => {
          return {
            groups: {
              ...prevState.groups,
              [groupInfo.id]: groupInfo.users,
            },
          };
        });
      break;
      case "user_info":
        const ui = (msg.data as ServerUserInfo);
        this.setState(prevState => {
          return {
            users: {
              ...prevState.users,
              [ui.user_id]: {
                ...prevState.users[ui.user_id],
                name: ui.name,
              },
            },
          }
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
    this.setState(prevState => {
      if (prevState.videoState === "off") {
        return {
          videoState: "snapshot",
        }
      }
      return {
        videoState: prevState.videoState,
      }
    });
    this.snapshot();
    clearInterval(this.snapshotInterval);
    this.snapshotInterval = setInterval(() => this.snapshot(), snapshot_interval);
  }

  async stopSnapshots () {
    clearInterval(this.snapshotInterval);
    this.stopCamera();
  }

  async snapshot () {
    if (!this.videoSelfRef.current || !this.canvasSelfRef.current) {
      console.error("No refs for video or canvas", this.videoSelfRef.current, this.canvasSelfRef.current);
      return;
    }

    const { cameraStream: oldCameraStream, videoState } = this.state;
    const cameraStream = await this.startCamera();
    if (cameraStream !== oldCameraStream) {
      // Most cameras take a second or two to "warm up" (get correct exposure)
      console.log("warming up...");
      await new Promise<void>((resolve) => setTimeout(() => resolve(), 1500));
      console.log("warmed up");
    }

    const context = this.canvasSelfRef.current.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
    const canvas = this.canvasSelfRef.current;
    canvas.width = video_width/2;
    canvas.height = video_height/2;
    context.drawImage(this.videoSelfRef.current, 0, 0, canvas.width, canvas.height);
    // Send color if video chatting, grayscale if not
    if (videoState === "on") {
      console.log("color");
    } else {
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
    }
    const dataUrl = this.canvasSelfRef.current.toDataURL("image/webp", 0.8);
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

  async startCamera (): Promise<MediaStream> {
    let { cameraStream } = this.state;
    let isCameraWorking = true;
    if (cameraStream) {
      for (const track of cameraStream.getTracks()) {
        console.log(track);
        if (track.readyState === "ended") {
          isCameraWorking = false;
        }
      }
    }
    if (cameraStream && isCameraWorking) {
      return cameraStream;
    }
    cameraStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user", // Prefer selfie cam if on mobile
          deviceId: this.context.camera,
        },
        audio: true,
      });
    this.setState({
      cameraStream,
    })
    if (this.videoSelfRef.current) {
      this.videoSelfRef.current.srcObject = cameraStream;
      try {
        await this.videoSelfRef.current.play();
      } catch (e) {
        console.error("Error playing self video:", e);
      }
    } else {
      console.error("No video ref");
    }
    return cameraStream;
  }

  stopCamera () {
    const { cameraStream } = this.state;
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
    }
    if (this.videoSelfRef.current) {
      this.videoSelfRef.current.pause();
      this.videoSelfRef.current.srcObject = null;
    }
    this.setState(prevState => {
      return {
        cameraStream: undefined,
        videoState: "off",
        users: {
          ...prevState.users,
          [prevState.id]: {
            ...prevState.users[prevState.id],
            snapshot: "",
            mediaStream: undefined,
          },
        },
      }
    });

    // TODO: stop video chats that we're in

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
        return;
      }
      if (pc.iceConnectionState === "disconnected") {
        this.destroyPeerConnection(userId);
        return;
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
        // only play the sound once
        if (track.kind === "audio" && this.context.playSounds) {
          playStartVideo();
        }
        this.setState(prevState => {
          const u = prevState.users[userId];
          return {
            users: { ...prevState.users, [userId]: {...u, mediaStream: streams[0] } },
          };
        });
      };
    };
  }

  destroyPeerConnection (userId: UserId) {
    const pc = this.pcs[userId];
    const user = this.state.users[userId];
    console.log(`Destroying peer connection for ${userId}`);
    if (!user) {
      console.error(`No user found for id ${userId}`);
      return;
    }
    if (user.mediaStream) {
      if (this.context.playSounds) {
        playStopVideo();
      }
      for (const track of user.mediaStream.getTracks()) {
        track.stop();
      }
    }
    this.setState(prevState => {
      const u = prevState.users[userId];
      return {
        users: { ...prevState.users, [userId]: {...u, mediaStream: undefined } },
      };
    });

    if (!pc) {
      console.error(`Peer connection for ${userId} doesn't exist.`);
      return;
      // throw new Error(`Peer connection for ${userId} doesn't exist.`);
    }

    pc.ontrack = null;
    pc.onicecandidate = null;
    pc.oniceconnectionstatechange = null;
    pc.onsignalingstatechange = null;
    pc.onicegatheringstatechange = null;
    pc.onnegotiationneeded = null;

    pc.close();
    delete this.pcs[userId];

    if (Object.values(this.pcs).length === 0) {
      console.log("No more video chats. Turning back to snapshot mode.");
      this.setState(prevState => {
        const me = prevState.users[prevState.id];
        return {
          videoState: "snapshot",
          users: { ...prevState.users, [prevState.id]: {...me, mediaStream: undefined } },
        };
      }, () => this.snapshot());
    }
  }

  async startVideo (user?: User) {
    if (!user) {
      for (const [id, user] of Object.entries(this.state.users)) {
        if (id === this.state.id) {
          // Don't try to start video chat with self
          continue;
        }
        await this.startVideo(user);
      }
      return;
    }

    if (user.user_id === this.state.id) {
      console.warn("not starting video chat with self");
      return;
    }

    if (this.state.users[user.user_id].mediaStream) {
      console.error("already video chatting with", user);
      return;
    }

    const cameraStream = await this.startCamera();
    this.playSelfVideo();

    let groupId: string|undefined;
    for (const [gid, group] of Object.entries(this.state.groups)) {
      if (group.includes(user.user_id)) {
        groupId = gid;
      }
    }

    const users = [user];
    if (groupId) {
      for (const uid of this.state.groups[groupId]) {
        if (uid === user.user_id) {
          continue;
        }
        users.push(this.state.users[uid]);
      }
    }

    for (const user of users) {
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
  }

  playSelfVideo () {
    const { cameraStream, videoState } = this.state;
    if (!cameraStream) {
      console.error("No camera stream");
      return;
    }
    if (videoState === "on") {
      return;
    }
    this.setState(prevState => {
      const me = prevState.users[prevState.id];
      return {
        cameraStream,
        videoState: "on",
        users: { ...prevState.users, [prevState.id]: {...me, mediaStream: cameraStream } },
      };
    });
  }

  async toggleVideo (user: UserWithData) {
    if (user.mediaStream) {
      this.socket.send({
        cmd: "stop_video",
        data: {
          from: this.state.id, // server ignores this
          to: user.user_id,
        },
      });
      await this.stopVideo(user);
    } else {
      await this.startVideo(user);
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

    const cameraStream = await this.startCamera();
    this.playSelfVideo();

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

  stopVideo (user?: UserWithData) {
    if (!user) {
      for (const [id, user] of Object.entries(this.state.users)) {
        if (id === this.state.id) {
          // Don't try to start video chat with self
          continue;
        }
        this.stopVideo(user);
      }
      return;
    }

    this.destroyPeerConnection(user.user_id);
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
    const me = users[id];

    let userContent = <>Connecting...</>;
    if (id && me) {
      userContent = <>
        { <UserTile user={me} isSelf={true} onClick={() => this.snapshot()} /> }
        { Object.values(users).map((u, i) => u.user_id === id ? <span key={u.user_id}></span> : <UserTile key={u.user_id} user={u} isSelf={u.user_id === id} onClick={() => this.toggleVideo(u)} />) }
      </>;
    }

    return <div className="videos">
      { cameraStream
        ? <>
          <button type="button" onClick={() => this.stopSnapshots()} disabled={!cameraStream}>Turn off camera</button>
          <button type="button" onClick={() => this.snapshot()} disabled={!cameraStream}>Retake snapshot</button>
        </>
        : <button type="button" onClick={() => this.startSnapshots()} disabled={!!cameraStream}>Turn on camera</button>
      }
      { videoState === "on"
        ? <button type="button" onClick={() => this.stopVideo()}>Stop all video chat</button>
        : <button type="button" onClick={() => this.startVideo()}>Start video chat with everyone</button>
      }
      <canvas id="canvas_self" ref={this.canvasSelfRef} />
      <video id="video_self" ref={this.videoSelfRef} playsInline width="300" muted />
      <br />
      { userContent }
      <Messages messages={messages} />
      <form id="chat-box" onSubmit={e => this.sendMessage(e)}>
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
  return <div className={classNames("user_tile", { self: isSelf })} onClick={onClick}>
    <Video
      className="user_video"
      srcObject={user.mediaStream}
      playsInline
      muted={isSelf}
      style={{ display: showVideo ? undefined : "none" }}
      title="Click to stop video chat."
    />
    <img
      className={classNames("user_image", {"placeholder": !user.snapshot})}
      alt={user.name}
      src={user.snapshot || `${process.env.PUBLIC_URL}/portrait_placeholder.svg`}
      style={{ display: showVideo ? "none" : undefined }}
      title="Click to start video chat."
    />
    { user.name } { isSelf ? "(You)" : "" }
  </div>;
};

const Messages = ({ messages }: { messages: Array<ServerMessage>, }) => {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  return <div id="chat">
    { messages.map((m, i) => {
      const { cmd, data } = m;
      switch (cmd) {
        case "join":
          return <code key={i}>{ (data as UserJoinInfo).name } joined<br /></code>;
        case "leave":
          return <code key={i}>{ (data as UserLeaveInfo).name } left<br /></code>;
        case "error":
          return <code key={i}>ERROR: { (data as ErrorInfo) }<br /></code>;
        case "msg":
          return <code key={i}>{ (data as ServerMsgInfo).user.name }: { (data as ServerMsgInfo).msg }<br /></code>;
        case "offer_video":
          return <code key={i}>{ (data as OfferVideoInfo).from } offered video chat to { (data as OfferVideoInfo).to || "everyone" }<br /></code>;
        case "accept_video":
          return <code key={i}>{ (data as AcceptVideoInfo).from } accepted video chat from { (data as AcceptVideoInfo).to }<br /></code>;
        case "stop_video":
          return <code key={i}>{ (data as StopVideoInfo).from } stopped video chat with { (data as StopVideoInfo).to }<br /></code>;
        case "room_info":
          return <span key={i}></span>;
        case "snapshot":
          return <span key={i}></span>;
        case "ice_candidate":
          return <span key={i}></span>;
        case "group":
          return <span key={i}></span>;
        case "user_info":
          return <span key={i}></span>;
        default:
          const exhaustiveCheck: never = cmd;
          throw new Error(`Unhandled case: ${exhaustiveCheck}`);
      }
    }) }
    <div ref={bottomRef} />
  </div>;
};
