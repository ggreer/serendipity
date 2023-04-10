import React, { createContext, useContext, useEffect, useState, useReducer } from 'react';

const defaultSettings = {
  camera: "",
  microphone: "",
  speaker: "",
};

try {
  const settings = JSON.parse(localStorage.getItem("settings") ?? "");
  defaultSettings.camera = settings.camera;
  defaultSettings.microphone = settings.microphone;
  defaultSettings.speaker = settings.speaker;
} catch (e) {
  console.error(e);
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

  useEffect(() => {
    async function enumerateDevices () {
      const deviceList = await navigator.mediaDevices?.enumerateDevices();
      setDevices(deviceList);
    }
    if (!devices.length) {
      enumerateDevices();
    }
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

  const settingsContent = <>
    <label htmlFor="camera-select">Camera</label>
    <select name="camera" id="camera-select" defaultValue={settings.camera} onChange={e => dispatch({ type: "setCamera", value: e.target.value})}>
      { cameras }
    </select>
    <br />

    <label htmlFor="microphone-select">Microphone</label>
    <select name="microphone" id="microphone-select" defaultValue={settings.microphone} onChange={e => dispatch({ type: "setMicrophone", value: e.target.value})}>
      { microphones }
    </select>
    <br />

    <label htmlFor="speaker-select">Speaker</label>
    <select name="speaker" id="speaker-select" defaultValue={settings.speaker} onChange={e => dispatch({ type: "setSpeaker", value: e.target.value})}>
      { speakers }
    </select>
  </>;

  return <>
    <div className="settings" onClick={() => setOpen(!isOpen)}>⚙ Settings</div>
    { isOpen && settingsContent }
  </>;
}
