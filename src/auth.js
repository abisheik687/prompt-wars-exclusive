import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";

let config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};
export let authConfigured = Object.values(config).every(Boolean);
let auth = authConfigured ? getAuth(getApps().length ? getApp() : initializeApp(config)) : null;
export async function initializeAuth() {
  if (!auth) {
    try {
      const response = await fetch("/api/client-config");
      if (response.ok) config = { ...config, ...(await response.json()) };
    } catch {}
    authConfigured = Object.values(config).every(Boolean);
    if (authConfigured) auth = getAuth(getApps().length ? getApp() : initializeApp(config));
  }
  return authConfigured;
}
export function watchAuth(callback) {
  return auth ? onAuthStateChanged(auth, callback) : () => callback(null);
}
export function signIn() {
  if (!auth) throw new Error("Firebase Authentication is not configured.");
  return signInWithPopup(auth, new GoogleAuthProvider());
}
export function signOutUser() { return auth ? signOut(auth) : Promise.resolve(); }
export async function authHeaders() {
  const user = auth?.currentUser;
  return user ? { authorization: `Bearer ${await user.getIdToken()}` } : {};
}
