export type UserId = string;
export interface User {
  user_id: UserId;
  name: string;
}

const commonCommands = [
  "error",
  "msg",
  "snapshot",
  "start_video",
  "stop_video",
] as const;

const clientCommands = [
  "msg",
] as const;

const serverCommands = [
  "error",
  "join",
  "leave",
  "msg",
  "room_info",
] as const;

export type ClientCommand = typeof commonCommands[number] | typeof clientCommands[number];
export type ServerCommand = typeof commonCommands[number] | typeof serverCommands[number];


export type ClientMsgInfo = string;

export type ErrorInfo = string;

export type ClientSnapshotInfo = string; //base64'd snapshot
export interface ServerSnapshotInfo {
  user_id: UserId;
  snapshot: string;
}

export interface UserJoinInfo extends User { }
export interface UserLeaveInfo extends User { }
export interface RoomInfo {
  you: UserId
  users: Record<UserId, User & ServerSnapshotInfo>;
}
export interface ServerMsgInfo {
  user: User;
  msg: string;
}

export interface StartVideoInfo {
  from: UserId;
  to: UserId;
  pc_description: string;
}
export interface StopVideoInfo {
  from: UserId;
  to: UserId;
}


export interface ClientMessage {
  req_id: string;
  cmd: ClientCommand;
  data: ErrorInfo | StartVideoInfo | StopVideoInfo | ClientMsgInfo | ClientSnapshotInfo;
}

export interface ServerMessage {
  res_id?: string;
  cmd: ServerCommand;
  data: ErrorInfo | StartVideoInfo | StopVideoInfo | RoomInfo | ServerMsgInfo | ServerSnapshotInfo | UserJoinInfo | UserLeaveInfo;
}
