import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import type { DmInboxRow } from "../../../types/message";

const DEFAULT_BACKEND_URL = "http://127.0.0.1:3001";

const api = (backendUrl?: string) => backendUrl || DEFAULT_BACKEND_URL;

export const getDmThreadId = (uidA: string, uidB: string) => {
  const [a, b] = [uidA, uidB].sort();
  return `dm_${a}_${b}`;
};

export const fetchDmInbox = async (uid: string, backendUrl?: string) => {
  const res = await tauriFetch(`${api(backendUrl)}/chat/inbox/${uid}?limit=50`, {
    method: "GET",
  });
  if (!res.ok) throw new Error("INBOX_FETCH_FAILED");
  const body = await res.json();
  return (body?.rows || []) as DmInboxRow[];
};

export const fetchDmState = async (uid: string, backendUrl?: string) => {
  const res = await tauriFetch(`${api(backendUrl)}/chat/state/${uid}`, {
    method: "GET",
  });
  if (!res.ok) throw new Error("DM_STATE_FETCH_FAILED");
  const body = await res.json();
  return (body?.activeConversationId || null) as string | null;
};

export const fetchDmStatePayload = async (uid: string, backendUrl?: string) => {
  const res = await tauriFetch(`${api(backendUrl)}/chat/state/${uid}`, {
    method: "GET",
  });
  if (!res.ok) throw new Error("DM_STATE_FETCH_FAILED");
  const body = await res.json();
  return {
    activeConversationId: (body?.activeConversationId || null) as string | null,
    groupMembersCollapsed: !!body?.groupMembersCollapsed,
  };
};

export const saveDmState = async (
  uid: string,
  activeConversationId: string | null,
  opts?: { groupMembersCollapsed?: boolean },
  backendUrl?: string,
) => {
  const res = await tauriFetch(`${api(backendUrl)}/chat/state/${uid}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      activeConversationId,
      groupMembersCollapsed:
        typeof opts?.groupMembersCollapsed === "boolean"
          ? opts.groupMembersCollapsed
          : undefined,
    }),
  });
  if (!res.ok) throw new Error("DM_STATE_SAVE_FAILED");
};

export const fetchDmMessages = async (
  conversationId: string,
  uid: string,
  opts?: { limit?: number; before?: string | null },
  backendUrl?: string,
) => {
  const params = new URLSearchParams({
    uid,
    limit: String(opts?.limit ?? 100),
  });
  if (opts?.before) params.set("before", opts.before);
  const res = await tauriFetch(
    `${api(backendUrl)}/chat/messages/${conversationId}?${params.toString()}`,
    { method: "GET" },
  );
  if (!res.ok) throw new Error("MESSAGES_FETCH_FAILED");
  const body = await res.json();
  return (body?.rows || []) as any[];
};

export const fetchConversationParticipants = async (
  conversationId: string,
  uid: string,
  backendUrl?: string,
) => {
  const params = new URLSearchParams({ uid });
  const res = await tauriFetch(
    `${api(backendUrl)}/chat/participants/${conversationId}?${params.toString()}`,
    { method: "GET" },
  );
  if (!res.ok) throw new Error("PARTICIPANTS_FETCH_FAILED");
  const body = await res.json();
  return (body?.rows || []) as any[];
};

export const openDm = async (
  myUid: string,
  otherUid: string,
  backendUrl?: string,
  opts?: { autoOpenBoth?: boolean },
) => {
  const res = await tauriFetch(`${api(backendUrl)}/chat/dm/open`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ myUid, otherUid, autoOpenBoth: !!opts?.autoOpenBoth }),
  });
  if (!res.ok) throw new Error("DM_OPEN_FAILED");
  return await res.json();
};

export const markDmRead = async (
  conversationId: string,
  uid: string,
  backendUrl?: string,
) => {
  await tauriFetch(`${api(backendUrl)}/chat/read`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conversationId, uid }),
  });
};

export const sendDm = async (
  conversationId: string,
  senderId: string,
  text: string,
  clientNonce: string,
  encryptedPayload?: Record<string, any> | null,
  backendUrl?: string,
) => {
  const res = await tauriFetch(`${api(backendUrl)}/chat/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      conversationId,
      senderId,
      text,
      clientNonce,
      encryptedPayload: encryptedPayload || undefined,
    }),
  });
  if (!res.ok) throw new Error("SEND_FAILED");
  return await res.json();
};

export const updateDm = async (
  messageId: string,
  conversationId: string,
  senderId: string,
  text: string,
  encryptedPayload?: Record<string, any> | null,
  backendUrl?: string,
) => {
  const res = await tauriFetch(`${api(backendUrl)}/chat/messages/${messageId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      conversationId,
      senderId,
      text,
      encryptedPayload: encryptedPayload || undefined,
    }),
  });
  if (!res.ok) throw new Error("EDIT_FAILED");
  return await res.json();
};

export const deleteDm = async (
  messageId: string,
  conversationId: string,
  senderId: string,
  backendUrl?: string,
) => {
  const res = await tauriFetch(`${api(backendUrl)}/chat/messages/${messageId}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conversationId, senderId }),
  });
  if (!res.ok) throw new Error("DELETE_FAILED");
};


export const createGroup = async (
  ownerUid: string,
  name: string,
  memberUids: string[],
  backendUrl?: string,
) => {
  const res = await tauriFetch(`${api(backendUrl)}/chat/group/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ownerUid, name, memberUids }),
  });
  if (!res.ok) throw new Error("GROUP_CREATE_FAILED");
  return await res.json();
};

export const leaveGroup = async (
  conversationId: string,
  uid: string,
  actorName?: string,
  backendUrl?: string,
) => {
  const res = await tauriFetch(`${api(backendUrl)}/chat/group/leave`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conversationId, uid, actorName }),
  });
  if (!res.ok) throw new Error("GROUP_LEAVE_FAILED");
  return await res.json();
};

export const updateGroupSettings = async (
  conversationId: string,
  uid: string,
  payload: {
    name?: string;
    avatarUrl?: string;
    sendPolicy?: "all_members" | "owner_only" | "selected_members";
    allowedSenderUids?: string[];
  },
  backendUrl?: string,
) => {
  const res = await tauriFetch(`${api(backendUrl)}/chat/group/settings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conversationId, uid, ...payload }),
  });
  if (!res.ok) throw new Error("GROUP_SETTINGS_UPDATE_FAILED");
  return await res.json();
};

export const kickGroupMember = async (
  conversationId: string,
  uid: string,
  targetUid: string,
  targetName?: string,
  backendUrl?: string,
) => {
  const res = await tauriFetch(`${api(backendUrl)}/chat/group/kick`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conversationId, uid, targetUid, targetName }),
  });
  if (!res.ok) throw new Error("GROUP_KICK_FAILED");
  return await res.json();
};

export const addGroupMembers = async (
  conversationId: string,
  uid: string,
  memberUids: string[],
  memberNames?: Record<string, string>,
  backendUrl?: string,
) => {
  const res = await tauriFetch(`${api(backendUrl)}/chat/group/add-members`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conversationId, uid, memberUids, memberNames }),
  });
  if (!res.ok) throw new Error("GROUP_ADD_MEMBERS_FAILED");
  return await res.json();
};

export const fetchConversationE2eeKeys = async (
  conversationId: string,
  uid: string,
  backendUrl?: string,
) => {
  const params = new URLSearchParams({ uid });
  const res = await tauriFetch(
    `${api(backendUrl)}/chat/e2ee/conversation-keys/${conversationId}?${params.toString()}`,
    { method: "GET" },
  );
  if (!res.ok) throw new Error("E2EE_KEYS_FETCH_FAILED");
  const body = await res.json();
  return (body?.rows || []) as Array<{
    uid: string;
    publicKeyJwk: JsonWebKey | null;
  }>;
};

export const registerE2eeKey = async (
  uid: string,
  publicKeyJwk: JsonWebKey,
  backendUrl?: string,
) => {
  const res = await tauriFetch(`${api(backendUrl)}/chat/e2ee/keys/${uid}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ publicKeyJwk }),
  });
  if (!res.ok) throw new Error("E2EE_KEY_REGISTER_FAILED");
};
