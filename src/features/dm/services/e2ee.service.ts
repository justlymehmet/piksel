import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

const DEFAULT_BACKEND_URL = "http://127.0.0.1:3001";
const IDENTITY_STORAGE_PREFIX = "piksel:e2ee:rsa:";

const api = (backendUrl?: string) => backendUrl || DEFAULT_BACKEND_URL;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

type StoredIdentity = {
  publicKeyJwk: JsonWebKey;
  privateKeyJwk: JsonWebKey;
};

export type E2eeEncryptedPayload = {
  v: number;
  alg: "AES-GCM-256+RSA-OAEP-256";
  charset: "utf-8";
  ivB64: string;
  ciphertextB64: string;
  recipients: Record<string, { wrappedKeyB64: string }>;
};

const toBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

const fromBase64 = (value: string) => {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
};

const getStorageKey = (uid: string) => `${IDENTITY_STORAGE_PREFIX}${uid}`;

const getStoredIdentity = (uid: string): StoredIdentity | null => {
  const raw = localStorage.getItem(getStorageKey(uid));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed?.publicKeyJwk || !parsed?.privateKeyJwk) return null;
    return {
      publicKeyJwk: parsed.publicKeyJwk as JsonWebKey,
      privateKeyJwk: parsed.privateKeyJwk as JsonWebKey,
    };
  } catch {
    return null;
  }
};

const setStoredIdentity = (uid: string, identity: StoredIdentity) => {
  localStorage.setItem(getStorageKey(uid), JSON.stringify(identity));
};

const importPublicRsa = async (jwk: JsonWebKey) =>
  await crypto.subtle.importKey(
    "jwk",
    jwk,
    {
      name: "RSA-OAEP",
      hash: "SHA-256",
    },
    false,
    ["encrypt"],
  );

const importPrivateRsa = async (jwk: JsonWebKey) =>
  await crypto.subtle.importKey(
    "jwk",
    jwk,
    {
      name: "RSA-OAEP",
      hash: "SHA-256",
    },
    false,
    ["decrypt"],
  );

const generateIdentity = async (): Promise<StoredIdentity> => {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"],
  );
  const publicKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const privateKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
  return {
    publicKeyJwk,
    privateKeyJwk,
  };
};

export const ensureE2eeIdentity = async (uid: string) => {
  if (!uid) throw new Error("E2EE_UID_REQUIRED");
  if (!crypto?.subtle) throw new Error("WEBCRYPTO_UNAVAILABLE");
  const existing = getStoredIdentity(uid);
  if (existing) return existing;
  const created = await generateIdentity();
  setStoredIdentity(uid, created);
  return created;
};

export const registerE2eePublicKey = async (
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

export const ensureAndRegisterE2eeIdentity = async (
  uid: string,
  backendUrl?: string,
) => {
  const identity = await ensureE2eeIdentity(uid);
  await registerE2eePublicKey(uid, identity.publicKeyJwk, backendUrl);
  return identity;
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

export const encryptE2eeTextForRecipients = async (
  text: string,
  recipientKeys: Array<{ uid: string; publicKeyJwk: JsonWebKey }>,
): Promise<E2eeEncryptedPayload> => {
  if (!recipientKeys.length) throw new Error("E2EE_RECIPIENT_KEYS_REQUIRED");

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aesKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );

  const encryptedMessage = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    encoder.encode(text),
  );
  const rawAesKey = await crypto.subtle.exportKey("raw", aesKey);

  const recipients: Record<string, { wrappedKeyB64: string }> = {};
  for (const recipient of recipientKeys) {
    const pubKey = await importPublicRsa(recipient.publicKeyJwk);
    const wrapped = await crypto.subtle.encrypt(
      { name: "RSA-OAEP" },
      pubKey,
      rawAesKey,
    );
    recipients[recipient.uid] = {
      wrappedKeyB64: toBase64(new Uint8Array(wrapped)),
    };
  }

  return {
    v: 1,
    alg: "AES-GCM-256+RSA-OAEP-256",
    charset: "utf-8",
    ivB64: toBase64(iv),
    ciphertextB64: toBase64(new Uint8Array(encryptedMessage)),
    recipients,
  };
};

export const decryptE2eeTextForUser = async (
  uid: string,
  payload: E2eeEncryptedPayload,
) => {
  const identity = await ensureE2eeIdentity(uid);
  const entry = payload?.recipients?.[uid];
  if (!entry?.wrappedKeyB64) throw new Error("E2EE_USER_KEY_NOT_FOUND");

  const privateKey = await importPrivateRsa(identity.privateKeyJwk);
  const rawAesKey = await crypto.subtle.decrypt(
    { name: "RSA-OAEP" },
    privateKey,
    fromBase64(entry.wrappedKeyB64),
  );
  const aesKey = await crypto.subtle.importKey(
    "raw",
    rawAesKey,
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(payload.ivB64) },
    aesKey,
    fromBase64(payload.ciphertextB64),
  );
  return decoder.decode(decrypted);
};
