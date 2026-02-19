import type { FirestoreDateInput, Uid } from "./common";

export type Presence = "online" | "offline";
export type UserStatus = "online" | "idle" | "dnd" | "offline";
export type UserRole = "user" | "admin" | "owner";

export type BanInfo = {
  type: "permanent" | "temporary";
  reason?: string;
  expiresAtMs?: number;
  bannedAt?: FirestoreDateInput;
  bannedBy?: Uid;
} | null;

export type UserBadgeState = {
  active?: boolean;
  grantedAt?: FirestoreDateInput;
  grantedBy?: Uid;
  updatedAt?: FirestoreDateInput;
  updatedBy?: Uid;
};

export type UserDoc = {
  uid: Uid;
  username: string;
  email?: string;
  displayName?: string;
  bio?: string;
  customStatus?: string;
  profilePic?: string;
  photoURL?: string;
  banner?: string;
  bannerUrl?: string;
  role?: UserRole;
  status?: UserStatus;
  presence?: Presence;
  developerMode?: boolean;
  isFirstLogin?: boolean;
  lastActive?: FirestoreDateInput;
  createdAt?: FirestoreDateInput;
  badges?: Record<string, UserBadgeState>;
  ban?: BanInfo;
  staff?: boolean;
  themeId?: string;
  deviceIds?: string[];
  lastDeviceId?: string;
};

export type FriendsMetaDoc = {
  incoming: Uid[];
  outgoing: Uid[];
  blocked: Uid[];
  friends: Uid[];
};
