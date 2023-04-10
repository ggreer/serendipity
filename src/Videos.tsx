import React from 'react';
import classNames from 'classnames';

import { SettingsContext } from './Settings';

type VideosProps = {};
type VideosState = {
  cameraStream?: MediaStream,
  snapshotData?: string,
  isVideoChatting: boolean,
};

// TODO: check support for media APIs
const video_width = 640;
const video_height = 480;
const snapshot_interval = 60 * 1000;

export class Videos extends React.Component<VideosProps, VideosState> {
  canvasSelfRef = React.createRef<HTMLCanvasElement>();
  videoSelfRef = React.createRef<HTMLVideoElement>();
  // cameraStream?: MediaStream;
  snapshotInterval: any;

  state: VideosState = {
    cameraStream: undefined,
    snapshotData: undefined,
    isVideoChatting: false,
  };

  static contextType = SettingsContext;
  context!: React.ContextType<typeof SettingsContext>;

  constructor (props: VideosProps) {
    super(props);
    // this.cameraStream = undefined;
  }

  componentDidMount () {
    // connect to server and get list of other users
  }

  componentWillUnmount () {
    this.stop();
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

    const context = this.canvasSelfRef.current.getContext("2d") as CanvasRenderingContext2D;
    this.canvasSelfRef.current.width = video_width;
    this.canvasSelfRef.current.height = video_height;
    context.drawImage(this.videoSelfRef.current, 0, 0, video_width, video_height);
    const data = this.canvasSelfRef.current.toDataURL("image/png");
    this.setState({
      snapshotData: data,
    })
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
    })
  }

  async startVideo () {
    if (!this.videoSelfRef.current) {
      return;
    }
    this.videoSelfRef.current.srcObject = await this.startCamera({ audio: true });;
    this.videoSelfRef.current.play();
    // this.videoSelfRef.current.muted = false;
  }

  stopVideo () {
    if (!this.videoSelfRef.current) {
      return;
    }
    // this.videoSelfRef.current.muted = true;
    this.videoSelfRef.current.pause();
    this.videoSelfRef.current.srcObject = null;

    this.stopCamera();
  }

  render () {
    const { cameraStream, snapshotData, isVideoChatting } = this.state;

    return <div className="Videos">
      <button type="button" onClick={() => this.start()} disabled={!!cameraStream}>Turn on camera</button>
      <button type="button" onClick={() => this.stop()} disabled={!cameraStream}>Turn off camera</button>
      <canvas id="canvas_self" ref={this.canvasSelfRef} />
      <img id="img_self" src={snapshotData} style={{ display: snapshotData ? "visible" : "none" }} />
      <video id="video_self" ref={this.videoSelfRef} style={{ display: isVideoChatting ? "visible" : "none" }} width="300" muted />
      <button type="button" onClick={() => this.startVideo()}>Start</button>
      <button type="button" onClick={() => this.stopVideo()}>Stop</button>
    </div>;
  }
}
