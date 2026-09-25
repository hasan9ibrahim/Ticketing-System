import { useCallback, useEffect, useState } from "react";
import axios from "axios";

// Phone/desktop push notifications (chat messages, request and ticket
// updates) delivered through the service worker, so they arrive even when
// the app is closed. The browser only allows asking for permission from a
// user action (a tap/click), so enable() must be called from one.

const API = `${process.env.REACT_APP_API_URL || "http://localhost:8000"}/api`;
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export const pushSupported = () =>
  typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

// iPhone/iPad only support push for apps added to the Home Screen.
export const pushNeedsInstall = () => typeof window !== "undefined" && isIOS() && !isStandalone() && !pushSupported();

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

async function getRegistration() {
  // The worker is registered on load in production (src/index.js); make sure
  // one exists even if this runs first.
  const existing = await navigator.serviceWorker.getRegistration();
  if (!existing) await navigator.serviceWorker.register("/service-worker.js");
  return navigator.serviceWorker.ready;
}

// Subscribe this device (or reuse its existing subscription) and register it
// with the backend for the logged-in user.
async function subscribeAndRegister() {
  const { data } = await axios.get(`${API}/push/vapid-public-key`, { headers: authHeaders() });
  if (!data?.enabled || !data.public_key) throw new Error("Push notifications are not enabled on the server");
  const registration = await getRegistration();
  const applicationServerKey = urlBase64ToUint8Array(data.public_key);
  let subscription = await registration.pushManager.getSubscription();
  // A subscription made with a different server key can't receive our pushes
  const existingKey = subscription?.options?.applicationServerKey;
  if (subscription && existingKey) {
    const a = new Uint8Array(existingKey);
    const same = a.length === applicationServerKey.length && a.every((v, i) => v === applicationServerKey[i]);
    if (!same) {
      await subscription.unsubscribe();
      subscription = null;
    }
  }
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
  }
  const json = subscription.toJSON();
  await axios.post(`${API}/push/subscribe`, { endpoint: json.endpoint, keys: json.keys }, { headers: authHeaders() });
  return subscription;
}

// Called on logout (while the token is still valid) so a shared device stops
// receiving the previous user's notifications.
export async function unregisterPushForLogout() {
  try {
    if (!pushSupported()) return;
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return;
    await axios.post(`${API}/push/unsubscribe`, { endpoint: subscription.endpoint }, { headers: authHeaders() });
  } catch (e) {
    console.error("Push unsubscribe failed:", e);
  }
}

export function usePushNotifications(userId) {
  const supported = pushSupported();
  const [permission, setPermission] = useState(supported ? Notification.permission : "unsupported");
  const [busy, setBusy] = useState(false);

  // Already allowed on this device: (re)register it for whoever is logged in
  // now - covers a new login, a changed server key, or an expired subscription.
  useEffect(() => {
    if (!supported || !userId || Notification.permission !== "granted") return;
    subscribeAndRegister().catch((e) => console.error("Push registration failed:", e));
  }, [supported, userId]);

  const enable = useCallback(async () => {
    if (!supported) return false;
    setBusy(true);
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== "granted") return false;
      await subscribeAndRegister();
      return true;
    } finally {
      setBusy(false);
    }
  }, [supported]);

  return {
    supported,
    permission, // "default" | "granted" | "denied" | "unsupported"
    needsInstall: pushNeedsInstall(),
    busy,
    enable,
  };
}
