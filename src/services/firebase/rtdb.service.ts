import {
  onDisconnect,
  onValue,
  push,
  ref,
  remove,
  set,
  type DatabaseReference,
} from "firebase/database";
import { rtdb } from "../../firebase";

export const connectedRef = () => ref(rtdb, ".info/connected");
export const userConnectionsRef = (uid: string) =>
  ref(rtdb, `status/${uid}/connections`);

export const openPresenceConnection = async (uid: string) => {
  const connections = userConnectionsRef(uid);
  const connectionRef = push(connections);
  await onDisconnect(connectionRef).remove();
  await set(connectionRef, true);
  return connectionRef;
};

export const closePresenceConnection = async (
  connectionRef?: DatabaseReference | null,
) => {
  if (!connectionRef) return;
  await remove(connectionRef);
};

export const watchConnected = (cb: (isConnected: boolean) => void) =>
  onValue(connectedRef(), (snap) => cb(!!snap.val()));

export const watchUserConnections = (uid: string, cb: (hasAny: boolean) => void) =>
  onValue(userConnectionsRef(uid), (snap) => cb(!!snap.val()));
