import React, { createContext, useContext, useEffect, useState, useReducer } from 'react';

import { Permissions } from './Permissions';
import { playTestSound } from './sounds';
import './Settings.css';
import './Form.css';


const defaultSettings = {
  camera: "",
  microphone: "",
  speaker: "",
  autoSnapshot: false,
  timeLapse: false,
  playSounds: true,
  name: "",
  lastRoom: "",
};

try {
  const settings = JSON.parse(localStorage.getItem("settings") ?? "");
  defaultSettings.name = settings.name || "";
  defaultSettings.lastRoom = settings.lastRoom || "";
  defaultSettings.camera = settings.camera;
  defaultSettings.microphone = settings.microphone;
  defaultSettings.speaker = settings.speaker;
  defaultSettings.autoSnapshot = !!settings.autoSnapshot;
  defaultSettings.timeLapse = !!settings.timeLapse;
  defaultSettings.playSounds = !!settings.playSounds;
} catch (e) {
  console.error("Error reading settings:", e);
  console.log("Using default settings.");
}

export type ActionType =
  "setAutoSnapshot" |
  "setCamera" |
  "setMicrophone" |
  "setName" |
  "setPlaySounds" |
  "setRoom" |
  "setSpeaker" |
  "setTimeLapse";
export type Action = { type: ActionType, value: string };

export const SettingsContext = createContext(defaultSettings);
export const SettingsDispatchContext = createContext<React.Dispatch<Action>>((i) => i); // dumb identity function to get around type error


function settingsReducer (settings=defaultSettings, action: Action) {
  console.log(action);
  switch (action.type) {
    case "setName":
      settings = {
        ...settings,
        name: action.value,
      }
    break;
    case "setRoom":
      settings = {
        ...settings,
        lastRoom: action.value,
      }
    break;
    case "setCamera":
      settings = {
        ...settings,
        camera: action.value,
      }
    break;
    case "setMicrophone":
      settings = {
        ...settings,
        microphone: action.value,
      }
    break;
    case "setSpeaker":
      settings = {
        ...settings,
        speaker: action.value,
      }
    break;
    case "setAutoSnapshot":
      settings = {
        ...settings,
        autoSnapshot: action.value === "true" ? true : false,
      }
    break;
    case "setTimeLapse":
      settings = {
        ...settings,
        timeLapse: action.value === "true" ? true : false,
      }
    break;
    case "setPlaySounds":
      settings = {
        ...settings,
        playSounds: action.value === "true" ? true : false,
      }
    break;
    default:
      const exhaustiveCheck: never = action.type;
      throw new Error(`Unhandled case: ${exhaustiveCheck}`);
  }
  localStorage.setItem("settings", JSON.stringify(settings));
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
    if (!devices.length) {
      enumerateDevices();
    }
  }, []); // TODO: update if permissions change
  // Update device list if devices change
  navigator.mediaDevices.ondevicechange = (event) => {
    enumerateDevices();
  };


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
    <button type="button" className="settings" onClick={() => setOpen(!isOpen)}>⚙ Settings</button>
    <dialog open={isOpen}>
      <h2>Settings</h2>
      <form method="dialog">
        <fieldset>
          <legend>User Info</legend>
          <label htmlFor="settings-name">Your name</label>
          <input type="text" name="name" id="settings-name" value={settings.name} onChange={e => dispatch({ type: "setName", value: e.target.value })} />
        </fieldset>

        <fieldset>
          <legend>Options</legend>
          <input type="checkbox" name="auto-snapshot" id="settings-auto-snapshot" checked={settings.autoSnapshot} onChange={e => dispatch({ type: "setAutoSnapshot", value: e.target.checked ? "true" : "false"})} />
          <label htmlFor="settings-auto-snapshot">Automatically enable camera</label>
          <div className="break" />

          <input type="checkbox" name="play-sounds" id="settings-play-sounds" checked={settings.playSounds} onChange={e => dispatch({ type: "setPlaySounds", value: e.target.checked ? "true" : "false"})} />
          <label htmlFor="settings-play-sounds">Play sounds when starting/stopping video chat</label>
        </fieldset>

        <fieldset>
          <legend>Audio/Video</legend>
          <label htmlFor="settings-camera-select">📷 Camera</label>
          <select name="camera" id="settings-camera-select" value={settings.camera} onChange={e => dispatch({ type: "setCamera", value: e.target.value})}>
            { cameras }
          </select>
          <div className="break" />

          <label htmlFor="settings-microphone-select">🎤 Microphone</label>
          <select name="microphone" id="settings-microphone-select" value={settings.microphone} onChange={e => dispatch({ type: "setMicrophone", value: e.target.value})}>
            { microphones }
          </select>
          <div className="break" />

          <label htmlFor="settings-speaker-select">🔉 Speaker</label>
          <select name="speaker" id="settings-speaker-select" value={settings.speaker} onChange={e => dispatch({ type: "setSpeaker", value: e.target.value})}>
            { speakers }
          </select>
          <div className="break" />

          <button type="button" onClick={() => playTestSound()}>Test speakers</button>
        </fieldset>

        <Permissions />

        <button type="button" onClick={() => setOpen(false)}>Close</button>
      </form>
      </dialog>
  </>;
}
