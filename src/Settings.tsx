import React, { createContext, useContext, useEffect, useState, useReducer } from 'react';

import './Settings.css';

const defaultSettings = {
  camera: "",
  microphone: "",
  speaker: "",
  autoSnapshot: false,
  timeLapse: false,
};

try {
  const settings = JSON.parse(localStorage.getItem("settings") ?? "");
  defaultSettings.camera = settings.camera;
  defaultSettings.microphone = settings.microphone;
  defaultSettings.speaker = settings.speaker;
  defaultSettings.autoSnapshot = settings.autoSnapshot;
  defaultSettings.timeLapse = settings.timeLapse;
} catch (e) {
  console.error("Error reading settings:", e);
  console.log("Using default settings.");
}

export type Action = { type: string, value: string };

export const SettingsContext = createContext(defaultSettings);
export const SettingsDispatchContext = createContext<React.Dispatch<Action>>((i) => i); // dumb identity function to get around type error


function settingsReducer (settings=defaultSettings, action: Action) {
  console.log(action);
  switch (action.type) {
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

type Permissions = {
  camera: PermissionState,
  microphone: PermissionState,
  autoplay: PermissionState,
}

export async function getPermissions (): Promise<Permissions> {
  const cameraPermission = await navigator.permissions.query({ name: "camera" as PermissionName });
  const micPermission = await navigator.permissions.query({ name: "microphone" as PermissionName });
  // const autoplayPermission = await navigator.permissions.query({ name: "autoplay" as PermissionName });
  return {
    camera: cameraPermission.state,
    microphone: micPermission.state,
    autoplay: "granted", // TODO: figure out if brave exposes autoplay permission
  };
}

const Permission = ({ value }: { value: PermissionState }) => {
  if (value === "prompt") {
    return <>❔</>;
  }
  if (value === "denied") {
    return <>❌</>;
  }
  if (value === "granted") {
    return <>✅</>;
  }
  return <>❔❔</>;
}

export const Settings = () => {
  const settings = useContext(SettingsContext);
  const dispatch = useContext(SettingsDispatchContext);
  const [isOpen, setOpen] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [permissions, setPermissions] = useState<Permissions>({
    camera: "prompt",
    microphone: "prompt",
    autoplay: "prompt",
  });

  useEffect(() => {
    async function enumerateDevices () {
      const deviceList = await navigator.mediaDevices?.enumerateDevices();
      console.log("Devices", deviceList);
      if (deviceList) {
        setDevices(deviceList);
      }
    }
    if (!devices.length) {
      enumerateDevices();
    }
  }, [permissions]);

  useEffect(() => {
    async function getAndSetPermissions () {
      const perms = await getPermissions();
      setPermissions({
        camera: perms.camera,
        microphone: perms.microphone,
        autoplay: perms.autoplay,
      });
    }
    getAndSetPermissions();
  }, []);


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
          <legend>Options</legend>
          <input type="checkbox" name="auto-snapshot" id="settings-auto-snapshot" defaultChecked={settings.autoSnapshot} onChange={e => dispatch({ type: "setAutoSnapshot", value: e.target.checked ? "true" : "false"})} />
          <label htmlFor="settings-auto-snapshot">Automatically enable camera</label>
        </fieldset>

        <fieldset>
          <legend>Audio/Video</legend>
          <label htmlFor="settings-camera-select">📷 Camera</label>
          <select name="camera" id="settings-camera-select" defaultValue={settings.camera} onChange={e => dispatch({ type: "setCamera", value: e.target.value})}>
            { cameras }
          </select>
          <div className="break" />

          <label htmlFor="settings-microphone-select">🎤 Microphone</label>
          <select name="microphone" id="settings-microphone-select" defaultValue={settings.microphone} onChange={e => dispatch({ type: "setMicrophone", value: e.target.value})}>
            { microphones }
          </select>
          <div className="break" />

          <label htmlFor="settings-speaker-select">🔉 Speaker</label>
          <select name="speaker" id="settings-speaker-select" defaultValue={settings.speaker} onChange={e => dispatch({ type: "setSpeaker", value: e.target.value})}>
            { speakers }
          </select>
        </fieldset>

        <fieldset>
          <legend>Permissions</legend>
          <Permission value={permissions.camera} /> <label>Camera access</label><br />
          <Permission value={permissions.microphone} /> <label>Microphone access</label><br />
          <Permission value={permissions.autoplay} /> <label>Video autoplay</label><br />
        </fieldset>

        <button type="button" onClick={() => setOpen(false)}>Close</button>
      </form>
      </dialog>
  </>;
}
