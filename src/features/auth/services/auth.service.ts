import {
  createUserWithEmailAndPassword,
  fetchSignInMethodsForEmail,
  signInWithEmailAndPassword,
  signOut,
  type Auth,
} from "firebase/auth";

export const loginWithEmail = async (
  auth: Auth,
  email: string,
  password: string,
) => {
  return await signInWithEmailAndPassword(auth, email, password);
};

export const registerWithEmail = async (
  auth: Auth,
  email: string,
  password: string,
) => {
  return await createUserWithEmailAndPassword(auth, email, password);
};

export const checkEmailInUse = async (auth: Auth, email: string) => {
  const methods = await fetchSignInMethodsForEmail(auth, email);
  return methods.length > 0;
};

export const logout = async (auth: Auth) => {
  await signOut(auth);
};

