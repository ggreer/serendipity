import React from 'react';
import classNames from 'classnames';

type VideosProps = {};
type VideosState = {
  cameraStream?: MediaStream,
  snapshotData?: string,
  isVideoChatting: boolean,
};

// TODO: check support for media APIs
const video_width = 640;
const video_height = 480;
const snapshot_interval = 10 * 1000;

export class Videos extends React.Component<VideosProps, VideosState> {
  canvasSelfRef = React.createRef<HTMLCanvasElement>();
  videoSelfRef = React.createRef<HTMLVideoElement>();
  cameraStream?: MediaStream;
  snapshotInterval: any;

  state = {
    cameraStream: undefined,
    snapshotData: undefined,
    isVideoChatting: false,
  };

  constructor (props: VideosProps) {
    super(props);
    this.cameraStream = undefined;
  }

  componentDidMount () {
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

    let cameraStream = this.cameraStream;
    if (!cameraStream) {
      cameraStream = await this.startCamera();
      console.log("snapshot: Not snapshotting because video stream is on.");

      this.videoSelfRef.current.srcObject = cameraStream;
      this.videoSelfRef.current?.play();

      // Cameras take a second or two to "warm up" (get correct exposure)
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
    // this..setAttribute("src", data);

    // this.stopCamera();
    // setTimeout(() => this.snapshot(), snapshot_interval);
  }

  async startCamera (constraints?: MediaStreamConstraints): Promise<MediaStream> {
    const cameraStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        // facingMode: "user", // Prefer selfie cam if on mobile
        ...constraints,
      });
    this.cameraStream = cameraStream;
    console.log(this.cameraStream);
    return cameraStream;
  }

  stopCamera () {
    if (!this.cameraStream) {
      return;
    }
    this.cameraStream.getTracks().forEach(track => track.stop());
    this.cameraStream = undefined;
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
    return <div className="Videos">
      <button type="button" onClick={() => this.start()}>Start</button>
      <button type="button" onClick={() => this.stop()}>Turn off camera</button>
      <canvas id="canvas_self" ref={this.canvasSelfRef} />
      <img id="img_self" src={this.state.snapshotData} style={{ display: this.state.snapshotData ? "visible" : "none" }} />
      <video id="video_self" ref={this.videoSelfRef} style={{ display: this.state.isVideoChatting ? "visible" : "none" }} width="300" muted />
      <button type="button" onClick={() => this.startVideo()}>Start</button>
      <button type="button" onClick={() => this.stopVideo()}>Stop</button>
    </div>;
  }
}

/*

let self_camera_stream = null;
const video_self = document.getElementById("video_self");
const img_self = document.getElementById("img_self");
const canvas_self = document.getElementById("canvas_self")

canvas_self.setAttribute("width", video_width);
canvas_self.setAttribute("height", video_height);
img_self.setAttribute("width", video_width);
img_self.setAttribute("height", video_height);

let snapshot_interval = null;

async function snapshot () {

}

snapshot();
snapshot_interval = setInterval(snapshot, 60 * 1000);


async function startCamera (constraints) {

}


*/
