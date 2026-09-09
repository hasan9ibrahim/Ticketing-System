// Native OS-level (Windows/macOS/etc.) notification via the browser
// Notification API - fires even when the app's tab isn't the visible/
// focused one, as long as it's still open in the browser. Requires the
// user to have granted permission (request it once on load).

export function requestNotificationPermission() {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission().catch(() => {});
  }
}

// Only meaningful when the tab isn't visible - an in-page toast already
// covers the case where they're looking at the app. Callers should gate on
// document.hidden themselves before calling this.
export function showNativeNotification(title, body) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    new Notification(title, { body, icon: "/favicon.ico" });
  } catch (error) {
    // Ignore - notification is a nice-to-have, never worth failing over
  }
}
