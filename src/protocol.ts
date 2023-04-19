export interface User {
  user_id: string;
  name: string;
}

const commonCommands = [
  "error",
  "msg",
  "snapshot",
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
  user_id: string;
  snapshot: string;
}

export interface UserJoinInfo extends User { }
export interface UserLeaveInfo extends User { }
export interface RoomInfo {
  users: Record<string, User & ServerSnapshotInfo>;
}
export interface ServerMsgInfo {
  user: User;
  msg: string;
}


export interface ClientMessage {
  req_id: string;
  cmd: ClientCommand;
  data: ClientMsgInfo | ClientSnapshotInfo | ErrorInfo;
}

export interface ServerMessage {
  res_id?: string;
  cmd: ServerCommand;
  data: ErrorInfo | RoomInfo | ServerMsgInfo | ServerSnapshotInfo | UserJoinInfo | UserLeaveInfo;
}
