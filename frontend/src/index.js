import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";
import { ThemeProvider } from "@/contexts/ThemeContext";
// Imported for its side effect: starts listening for the browser's install
// prompt right away, before any page component mounts.
import "@/hooks/useInstallPrompt";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>,
);

// Register the service worker (public/service-worker.js) so the site can be
// installed as an app ("Install app" / "Add to Home screen"). Production
// only - in development it would just get in the way of hot reloading.
if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch((err) => {
      console.error("Service worker registration failed:", err);
    });
  });
}
