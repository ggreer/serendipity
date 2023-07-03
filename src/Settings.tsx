import React, { createContext, useContext, useEffect, useState, useReducer, useRef } from 'react';
import { uniqueNamesGenerator, adjectives, colors, animals } from 'unique-names-generator';

import { Permissions, onPermissionChange } from './Permissions';
import { playTestSound } from './sounds';
import './Settings.css';
import './Form.css';


const defaultSettings = {
  autoAnswer: false,
  autoSnapshot: false,
  camera: "",
  lastRoom: "",
  microphone: "",
  name: "",
  notifications: false,
  playSounds: true,
  speaker: "",
  timeLapse: false,
};

function generateRoomName (): string {
  return uniqueNamesGenerator(
    {
      dictionaries: [adjectives, colors, animals],
      separator: '-',
    });
}

try {
  const settings = JSON.parse(localStorage.getItem("settings") ?? "");
  defaultSettings.autoAnswer = !!settings.autoAnswer;
  defaultSettings.autoSnapshot = !!settings.autoSnapshot;
  defaultSettings.camera = settings.camera;
  defaultSettings.lastRoom = settings.lastRoom || generateRoomName();
  defaultSettings.microphone = settings.microphone;
  defaultSettings.name = settings.name || "";
  defaultSettings.notifications = !!settings.notifications;
  defaultSettings.playSounds = !!settings.playSounds;
  defaultSettings.speaker = settings.speaker;
  defaultSettings.timeLapse = !!settings.timeLapse;
} catch (e) {
  console.error("Error reading settings:", e);
  console.log("Using default settings.");
}

export type ActionType =
  "setBool" |
  "setString";
export type SettingName =
  "autoAnswer" |
  "autoSnapshot" |
  "camera" |
  "lastRoom" |
  "microphone" |
  "name" |
  "notifications" |
  "playSounds" |
  "speaker" |
  "timeLapse";
export type Action = { type: ActionType, name: SettingName, value: string|boolean };

export const SettingsContext = createContext(defaultSettings);
export const SettingsDispatchContext = createContext<React.Dispatch<Action>>((i) => i); // dumb identity function to get around type error


async function testNotification () {
  const notificationPermission = await navigator.permissions.query({ name: "notifications" });
  if (notificationPermission.state !== "granted") {
    Notification.requestPermission();
  }

  const notification = new Notification("Test");
  setTimeout(() => {
    notification.close();
  }, 5000);
}


function settingsReducer (settings=defaultSettings, action: Action) {
  console.log(action);
  switch (action.type) {
    case "setString":
      settings = {
        ...settings,
        [action.name]: action.value,
      }
    break;
    case "setBool":
      settings = {
        ...settings,
        [action.name]: !!action.value,
      }
    break;
    default:
      const exhaustiveCheck: never = action.type;
      throw new Error(`Unhandled case: ${exhaustiveCheck}`);
  }
  localStorage.setItem("settings", JSON.stringify(settings));
  if (action.type === "setBool" && action.name === "notifications" && action.value === true) {
    Notification.requestPermission();
  }
  return settings;
}

export const SettingsProvider = ({ children }: { children: React.ReactNode }) => {
  const [settings, dispatch] = useReducer(
     settingsReducer,
     defaultSettings
   );

  return <SettingsContext.Provider value={settings}>
    <SettingsDispatchContext.Provider value={dispatch}>
      { children }
    </SettingsDispatchContext.Provider>
  </SettingsContext.Provider>;
}


export const MicTest = () => {
  const settings = useContext(SettingsContext);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    async function analyzeAudio () {
      const audioContext = new AudioContext();
      // TODO: close old stream and get new one if user changes mic setting
      const micPermission = await navigator.permissions.query({ name: "microphone" as PermissionName });
      if (micPermission.state !== "granted") {
        onPermissionChange(analyzeAudio);
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: settings.microphone,
          },
        });
      const source = audioContext.createMediaStreamSource(stream);
      const analyzer = new AnalyserNode(audioContext, { fftSize: 64, smoothingTimeConstant: 0.7 });
      source.connect(analyzer);
      const data = new Uint8Array(analyzer.frequencyBinCount);
      const canvasWidth = analyzer.frequencyBinCount * 2;
      const canvasHeight = 20;

      function drawAudio () {
        const canvas = canvasRef?.current;
        if (!canvas) {
          requestAnimationFrame(drawAudio);
          return;
        }

        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        const context = canvas.getContext("2d") as CanvasRenderingContext2D;

        analyzer.getByteFrequencyData(data);
        context.clearRect(0, 0, canvasWidth, canvasHeight);
        context.fillStyle = "rgb(255, 255, 255)";
        context.fillRect(0, 0, canvasWidth, canvasHeight);

        const barWidth = canvasWidth / data.length;
        let x = 0;

        for (let i = 0; i < data.length; i++) {
          const barHeight = data[i] / 255 * canvasHeight;

          context.fillStyle = `rgb(50, 200, 50)`;
          context.fillRect(x, canvasHeight - barHeight, barWidth, barHeight);

          x += barWidth;
        }

        requestAnimationFrame(drawAudio);
      }
      requestAnimationFrame(drawAudio);
    }
    analyzeAudio();
  });
  return <div style={{ float: "right" }}>
    <canvas ref={canvasRef} />
  </div>;
};


export const Settings = () => {
  const settings = useContext(SettingsContext);
  const dispatch = useContext(SettingsDispatchContext);
  const [isOpen, setOpen] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);

  async function enumerateDevices () {
    const deviceList = await navigator.mediaDevices?.enumerateDevices();
    console.log("Devices", deviceList);
    if (deviceList) {
      setDevices(deviceList);
    }
  }
  useEffect(() => {
    // Update device list if devices change
    navigator.mediaDevices.ondevicechange = event => enumerateDevices();
    // Update device list if permissions change
    onPermissionChange(enumerateDevices);
    if (!devices.length) {
      enumerateDevices();
    }
  });


  let cameras: JSX.Element[] = [];
  let microphones: JSX.Element[] = [];
  let speakers: JSX.Element[] = [];

  devices.forEach(device => {
    switch (device.kind) {
      case "audioinput":
        microphones.push(<option key={device.deviceId} value={device.deviceId}>{device.label}</option>);
        break;
      case "videoinput":
        cameras.push(<option key={device.deviceId} value={device.deviceId}>{device.label}</option>);
        break;
      case "audiooutput":
        speakers.push(<option key={device.deviceId} value={device.deviceId}>{device.label}</option>);
        break;
      default:
        console.log("unknown device kind", device.kind);
    }
  });

  return <>
    <button type="button" className="settings" onClick={() => setOpen(!isOpen)}>⚙️ Settings</button>
    <dialog open={isOpen}>
      <h2>Settings</h2>
      <form method="dialog">
        <fieldset>
          <legend>User Info</legend>
          <label htmlFor="settings-name">Your name</label>
          <input type="text" name="name" id="settings-name" value={settings.name} onChange={e => dispatch({ type: "setString", name: "name", value: e.target.value })} />
        </fieldset>

        <fieldset>
          <legend>Options</legend>
          <input type="checkbox" name="auto-snapshot" id="settings-auto-snapshot" checked={settings.autoSnapshot} onChange={e => dispatch({ type: "setBool", name: "autoSnapshot", value: e.target.checked })} />
          <label htmlFor="settings-auto-snapshot">Automatically enable camera</label>
          <div className="break" />

          <input type="checkbox" name="auto-answer" id="settings-auto-answer" checked={settings.autoAnswer} onChange={e => dispatch({ type: "setBool", name: "autoAnswer", value: e.target.checked })} />
          <label htmlFor="settings-auto-answer">Automatically answer incoming video chats</label>
          <div className="break" />

          <input type="checkbox" name="play-sounds" id="settings-play-sounds" checked={settings.playSounds} onChange={e => dispatch({ type: "setBool", name: "playSounds", value: e.target.checked})} />
          <label htmlFor="settings-play-sounds">Play sounds when starting/stopping video chat</label>
          <div className="break" />

          <input type="checkbox" name="notifications" id="settings-notifications" checked={settings.notifications} onChange={e => dispatch({ type: "setBool", name: "notifications", value: e.target.checked })} />
          <label htmlFor="settings-notifications">Notify when users join, leave, or start video chatting</label>
        </fieldset>

        <fieldset>
          <legend>Audio/Video</legend>
          <label htmlFor="settings-camera-select">📷 Camera</label>
          <select name="camera" id="settings-camera-select" value={settings.camera} onChange={e => dispatch({ type: "setString", name: "camera", value: e.target.value})}>
            { cameras }
          </select>
          <div className="break" />

          <label htmlFor="settings-microphone-select">🎤 Microphone&nbsp;{ isOpen && <MicTest /> }</label>
          <select name="microphone" id="settings-microphone-select" value={settings.microphone} onChange={e => dispatch({ type: "setString", name: "microphone", value: e.target.value})}>
            { microphones }
          </select>
          <div className="break" />

          <label htmlFor="settings-speaker-select">🔉 Speaker</label>
          <select name="speaker" id="settings-speaker-select" value={settings.speaker} onChange={e => dispatch({ type: "setString", name: "speaker", value: e.target.value})}>
            { speakers }
          </select>
          <div className="break" />

          <button type="button" onClick={() => playTestSound()}>Test speakers</button>
          <button type="button" onClick={() => testNotification()}>Test notifications</button>
        </fieldset>

        <Permissions />

        <button type="button" onClick={() => setOpen(false)}>Close</button>
      </form>
      </dialog>
  </>;
}
