import type { FirestoreDateInput, Uid } from "./common";

export type ConversationType = "dm" | "group";

export type DmConversationDoc = {
  id?: string;
  type: ConversationType;
  participants: Uid[];
  participantMap: Record<Uid, true>;
  createdAt?: FirestoreDateInput;
  updatedAt?: FirestoreDateInput;
  lastMessage?: string;
  lastMessageAt?: FirestoreDateInput;
  lastSenderId?: Uid;
};

export type DmMessageDoc = {
  id?: string;
  conversationId?: string;
  senderId: Uid;
  text: string;
  createdAt?: FirestoreDateInput;
  updatedAt?: FirestoreDateInput | null;
  editedAt?: FirestoreDateInput | null;
  isEdited?: boolean;
  isPending?: boolean;
  isFailed?: boolean;
};

export type DmInboxRow = {
  id: string;
  type?: ConversationType;
  encryptionMode?: "e2ee_private" | "server_managed" | string;
  otherUid?: Uid | null;
  groupName?: string | null;
  groupAvatarUrl?: string | null;
  groupOwnerId?: Uid | null;
  groupSendPolicy?: "all_members" | "selected_members" | string | null;
  memberCount?: number | null;
  myRole?: "owner" | "member" | string;
  myCanSend?: boolean;
  unreadCount: number;
  lastMessage?: string;
  lastMessageAt?: string | number | null;
};
