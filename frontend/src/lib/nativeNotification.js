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
//
// onClick (optional) runs when the user clicks the notification itself -
// without it, clicking does nothing but dismiss the popup, which is why
// e.g. a chat notification previously never took you to the conversation
// it was about. We always bring the tab to the foreground first since
// that's what "clicking a notification" means regardless of what else
// the caller wants to happen.
export function showNativeNotification(title, body, onClick) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    const notification = new Notification(title, { body, icon: "/favicon.ico" });
    notification.onclick = () => {
      window.focus();
      notification.close();
      onClick?.();
    };
  } catch (error) {
    // Ignore - notification is a nice-to-have, never worth failing over
  }
}
