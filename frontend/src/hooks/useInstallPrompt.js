import { useEffect, useState, useCallback } from "react";

// Chrome/Edge/Samsung fire `beforeinstallprompt` once, possibly before any
// React component mounts (e.g. while on the login page), so it's captured
// globally as early as possible and stashed here for the hook to pick up.
let deferredPrompt = null;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // we show our own "Install app" button instead
    deferredPrompt = e;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    notify();
  });
}

const isStandalone = () =>
  typeof window !== "undefined" &&
  (window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true);

const isIOS = () =>
  typeof navigator !== "undefined" &&
  (/iphone|ipad|ipod/i.test(navigator.userAgent) ||
    // iPadOS reports itself as a Mac
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

// canInstall: an install prompt is available (Android/desktop Chrome etc.)
// showIOSHint: iPhone/iPad Safari, where installing is a manual Share-menu step
export function useInstallPrompt() {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force((n) => n + 1);
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) return false;
    const prompt = deferredPrompt;
    deferredPrompt = null; // a prompt can only be used once
    notify();
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    return outcome === "accepted";
  }, []);

  const standalone = isStandalone();
  return {
    canInstall: !standalone && !!deferredPrompt,
    showIOSHint: !standalone && isIOS(),
    install,
  };
}
