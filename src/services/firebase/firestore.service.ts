import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  type CollectionReference,
  type DocumentData,
  type QueryConstraint,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "../../firebase";

export const userDocRef = (uid: string) => doc(db, "users", uid);
export const usersColRef = () => collection(db, "users");
export const badgesColRef = () => collection(db, "badges");
export const themesColRef = () => collection(db, "themes");
export const settingsDocRef = (id: string) => doc(db, "settings", id);

export const getDocData = async <T = DocumentData>(
  ref: ReturnType<typeof doc>,
): Promise<T | null> => {
  const snap = await getDoc(ref);
  return snap.exists() ? (snap.data() as T) : null;
};

export const getCollectionData = async <T = DocumentData>(
  ref: CollectionReference<DocumentData>,
): Promise<T[]> => {
  const snap = await getDocs(ref);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) })) as T[];
};

export const getQueryData = async <T = DocumentData>(
  ref: CollectionReference<DocumentData>,
  ...constraints: QueryConstraint[]
): Promise<T[]> => {
  const snap = await getDocs(query(ref, ...constraints));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) })) as T[];
};

export const watchDoc = <T = DocumentData>(
  ref: ReturnType<typeof doc>,
  cb: (data: T | null) => void,
): Unsubscribe =>
  onSnapshot(ref, (snap) => {
    cb(snap.exists() ? (snap.data() as T) : null);
  });
