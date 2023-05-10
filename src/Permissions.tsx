import React, { createContext, useContext, useEffect, useState, useReducer } from 'react';


type PermissionsType = {
  camera: PermissionState,
  microphone: PermissionState,
  autoplay: PermissionState,
}

export async function getPermissions (): Promise<PermissionsType> {
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

export function Permissions () {
  const [permissions, setPermissions] = useState<PermissionsType>({
    camera: "prompt",
    microphone: "prompt",
    autoplay: "prompt",
  });

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


  return <fieldset>
    <legend>Permissions</legend>
    <Permission value={permissions.camera} /> <label>Camera access</label><br />
    <Permission value={permissions.microphone} /> <label>Microphone access</label><br />
    <Permission value={permissions.autoplay} /> <label>Video autoplay</label><br />
  </fieldset>;
}
