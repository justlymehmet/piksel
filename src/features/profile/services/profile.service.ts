import { doc, updateDoc } from "firebase/firestore";
import { db } from "../../../firebase";

export const updateProfileFields = async (
  uid: string,
  payload: Record<string, unknown>,
) => {
  await updateDoc(doc(db, "users", uid), payload);
};

