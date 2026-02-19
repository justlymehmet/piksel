import {
  arrayRemove,
  arrayUnion,
  doc,
  getDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "../../../firebase";

export const FRIENDS_META_DEFAULT = {
  incoming: [],
  outgoing: [],
  blocked: [],
  friends: [],
} as const;

export const getFriendsMetaRef = (uid: string) =>
  doc(db, "users", uid, "friends", "meta");

export const ensureFriendsMeta = async (uid: string) => {
  const ref = getFriendsMetaRef(uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    const batch = writeBatch(db);
    batch.set(ref, FRIENDS_META_DEFAULT, { merge: true });
    await batch.commit();
  }
};

export const sendFriendRequestTx = async (fromUid: string, toUid: string) => {
  await ensureFriendsMeta(fromUid);
  await ensureFriendsMeta(toUid);

  const batch = writeBatch(db);
  const fromMetaRef = getFriendsMetaRef(fromUid);
  const toMetaRef = getFriendsMetaRef(toUid);
  batch.update(fromMetaRef, { outgoing: arrayUnion(toUid) });
  batch.update(toMetaRef, { incoming: arrayUnion(fromUid) });
  await batch.commit();
};

export const cancelFriendRequestTx = async (fromUid: string, toUid: string) => {
  await ensureFriendsMeta(fromUid);
  await ensureFriendsMeta(toUid);

  const batch = writeBatch(db);
  const fromMetaRef = getFriendsMetaRef(fromUid);
  const toMetaRef = getFriendsMetaRef(toUid);
  batch.update(fromMetaRef, { outgoing: arrayRemove(toUid) });
  batch.update(toMetaRef, { incoming: arrayRemove(fromUid) });
  await batch.commit();
};

export const rejectFriendRequestTx = async (toUid: string, fromUid: string) => {
  await ensureFriendsMeta(toUid);
  await ensureFriendsMeta(fromUid);

  const batch = writeBatch(db);
  const toMetaRef = getFriendsMetaRef(toUid);
  const fromMetaRef = getFriendsMetaRef(fromUid);
  batch.update(toMetaRef, { incoming: arrayRemove(fromUid) });
  batch.update(fromMetaRef, { outgoing: arrayRemove(toUid) });
  await batch.commit();
};

export const acceptFriendRequestTx = async (toUid: string, fromUid: string) => {
  await ensureFriendsMeta(toUid);
  await ensureFriendsMeta(fromUid);

  const batch = writeBatch(db);
  const toMetaRef = getFriendsMetaRef(toUid);
  const fromMetaRef = getFriendsMetaRef(fromUid);
  batch.update(toMetaRef, {
    incoming: arrayRemove(fromUid),
    friends: arrayUnion(fromUid),
  });
  batch.update(fromMetaRef, {
    outgoing: arrayRemove(toUid),
    friends: arrayUnion(toUid),
  });
  await batch.commit();
};

export const blockUserTx = async (uid: string, otherUid: string) => {
  await ensureFriendsMeta(uid);
  await ensureFriendsMeta(otherUid);

  const batch = writeBatch(db);
  const myMetaRef = getFriendsMetaRef(uid);
  const otherMetaRef = getFriendsMetaRef(otherUid);

  batch.update(myMetaRef, {
    blocked: arrayUnion(otherUid),
    incoming: arrayRemove(otherUid),
    outgoing: arrayRemove(otherUid),
    friends: arrayRemove(otherUid),
  });
  batch.update(otherMetaRef, {
    incoming: arrayRemove(uid),
    outgoing: arrayRemove(uid),
    friends: arrayRemove(uid),
  });

  await batch.commit();
};

export const removeFriendTx = async (uid: string, otherUid: string) => {
  await ensureFriendsMeta(uid);
  await ensureFriendsMeta(otherUid);

  const batch = writeBatch(db);
  const myMetaRef = getFriendsMetaRef(uid);
  const otherMetaRef = getFriendsMetaRef(otherUid);
  batch.update(myMetaRef, { friends: arrayRemove(otherUid) });
  batch.update(otherMetaRef, { friends: arrayRemove(uid) });
  await batch.commit();
};

export const unblockUserTx = async (uid: string, otherUid: string) => {
  await ensureFriendsMeta(uid);

  const batch = writeBatch(db);
  const myMetaRef = getFriendsMetaRef(uid);
  batch.update(myMetaRef, {
    blocked: arrayRemove(otherUid),
  });
  await batch.commit();
};
