export type UserId = string;
export type GroupId = string;
export interface User {
  user_id: UserId;
  name: string;
}
export interface UserInfo {
  snapshot: string;
  group: GroupId|null;
}

const commonCommands = [
  "error",
  "msg",
  "snapshot",
  "accept_video",
  "offer_video",
  "ice_candidate",
  "stop_video",
  "user_info",
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
  "group",
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

export type VideoChatGroups = Record<GroupId, Array<UserId>>;

export interface UserJoinInfo extends User { }
export interface UserLeaveInfo extends User { }
export interface ClientUserInfo {
  name: string;
};
export interface ServerUserInfo {
  name: string;
  user_id: UserId;
};

export interface RoomInfo {
  name: string;
  you: UserId
  users: Record<UserId, User & UserInfo>;
  groups: VideoChatGroups;
}
export interface ServerMsgInfo {
  user: User;
  msg: string;
}

export interface OfferVideoInfo {
  from: UserId;
  to: UserId;
  pc_description: string;
}
export interface AcceptVideoInfo {
  from: UserId;
  to: UserId;
  pc_description: string;
}
export interface IceCandidateInfo {
  from: UserId;
  to: UserId;
  candidate: string;
}
export interface StopVideoInfo {
  from: UserId;
  to: UserId;
}

export interface GroupInfo {
  id: GroupId;
  users: Array<UserId>;
}

export interface ClientMessage {
  req_id: string;
  cmd: ClientCommand;
  data: ErrorInfo | OfferVideoInfo | AcceptVideoInfo | IceCandidateInfo | StopVideoInfo | ClientMsgInfo | ClientSnapshotInfo | ClientUserInfo;
}

export interface ServerMessage {
  res_id?: string;
  cmd: ServerCommand;
  data: ErrorInfo | OfferVideoInfo | AcceptVideoInfo | IceCandidateInfo | StopVideoInfo | RoomInfo | ServerMsgInfo | ServerSnapshotInfo | UserJoinInfo | UserLeaveInfo | GroupInfo | ServerUserInfo;
}
