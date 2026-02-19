import { doc, setDoc, updateDoc } from "firebase/firestore";
import { db } from "../../../firebase";

export const setAppearanceSetting = async (payload: Record<string, unknown>) => {
  await setDoc(doc(db, "settings", "appearance"), payload, { merge: true });
};

export const updateUserTheme = async (uid: string, themeId: string) => {
  await updateDoc(doc(db, "users", uid), { themeId });
};

