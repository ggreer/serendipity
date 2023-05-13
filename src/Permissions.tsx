import React, { createContext, useContext, useEffect, useState, useReducer } from 'react';


type PermissionsType = {
  autoplay: PermissionState,
  camera: PermissionState,
  microphone: PermissionState,
  notifications: PermissionState,
}

export async function getPermissions (): Promise<PermissionsType> {
  // const autoplayPermission = await navigator.permissions.query({ name: "autoplay" as PermissionName });
  const cameraPermission = await navigator.permissions.query({ name: "camera" as PermissionName });
  const micPermission = await navigator.permissions.query({ name: "microphone" as PermissionName });
  const notificationPermission = await navigator.permissions.query({ name: "notifications" });
  return {
    autoplay: "granted", // TODO: figure out if brave exposes autoplay permission
    camera: cameraPermission.state,
    microphone: micPermission.state,
    notifications: notificationPermission.state,
  };
}

const Permission = ({ value }: { value: PermissionState }) => {
  // navigator.permissions.
  if (value === "prompt") {
    return <span>❔</span>;
  }
  if (value === "denied") {
    return <span>❌</span>;
  }
  if (value === "granted") {
    return <span>✅</span>;
  }
  return <span>❔❔</span>;
}

export function Permissions () {
  const [permissions, setPermissions] = useState<PermissionsType>({
    autoplay: "prompt",
    camera: "prompt",
    microphone: "prompt",
    notifications: "prompt",
  });

  useEffect(() => {
    async function getAndSetPermissions () {
      const perms = await getPermissions();
      setPermissions({
        autoplay: perms.autoplay,
        camera: perms.camera,
        microphone: perms.microphone,
        notifications: perms.notifications,
      });
    }
    getAndSetPermissions();
  }, []);


  return <fieldset>
    <legend>Permissions</legend>
    <Permission value={permissions.camera} /> <label>Camera access</label><br />
    <Permission value={permissions.microphone} /> <label>Microphone access</label><br />
    <Permission value={permissions.notifications} /> <label>Notifications</label><br />
    <Permission value={permissions.autoplay} /> <label>Video autoplay</label><br />
  </fieldset>;
}
