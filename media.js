// TODO: check support for media APIs
const video_width = 640;
const video_height = 480;

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
  if (self_camera_stream) {
    console.log("snapshot: Not snapshotting because video stream is on.");
    return;
  }

  await startCamera();

  video_self.srcObject = self_camera_stream;
  video_self.play();

  // wait for camera to warm up
  console.log("warming up...");
  await new Promise((resolve) => setTimeout(() => resolve(), 2000));
  console.log("warmed up");

  const context = canvas_self.getContext("2d");
  canvas_self.width = video_width;
  canvas_self.height = video_height;
  context.drawImage(video_self, 0, 0, video_width, video_height);
  const data = canvas_self.toDataURL("image/png");
  img_self.setAttribute("src", data);

  stopCamera();
}

snapshot();
snapshot_interval = setInterval(snapshot, 60 * 1000);


async function startCamera (constraints) {
  try {
    self_camera_stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      facingMode: "user", // Prefer selfie cam if on mobile
      ...constraints,
    });
    console.log(self_camera_stream);
  } catch (err) {
    console.error(err);
    // TODO: bubble error up to user and throw
  }
}

function stopCamera () {
  if (!self_camera_stream) {
    return;
  }
  self_camera_stream.getTracks().forEach(track => track.stop());
  // self_camera_stream.stop();
  self_camera_stream = null;
}

async function startVideo () {
  await startCamera({ audio: true });
  video_self.srcObject = self_camera_stream;
  video_self.play();
  // video_self.muted = false;
}

function stopVideo () {
  // video_self.muted = true;
  video_self.pause();
  video_self.srcObject = null;

  stopCamera();
}
