import { useEffect, useRef, useCallback } from "react";

const INACTIVITY_TIMEOUT = 5 * 60 * 1000; // 5 minutes in milliseconds

export default function useInactivityLogout(isAuthenticated, setUser) {
  const timeoutRef = useRef(null);

  const handleLogout = useCallback(() => {
    if (isAuthenticated) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      if (setUser) {
        setUser(null);
      }
      // Use window.location for navigation
      window.location.href = "/login";
    }
  }, [isAuthenticated, setUser]);

  const resetTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    if (isAuthenticated) {
      timeoutRef.current = setTimeout(() => {
        handleLogout();
      }, INACTIVITY_TIMEOUT);
    }
  }, [isAuthenticated, handleLogout]);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    // List of events that indicate user activity
    const activityEvents = [
      "mousedown",
      "mousemove",
      "keydown",
      "scroll",
      "touchstart",
      "click",
    ];

    // Add event listeners to reset the timer
    const handleActivity = () => {
      resetTimer();
    };

    // Add event listeners to document and window
    activityEvents.forEach((event) => {
      document.addEventListener(event, handleActivity);
      window.addEventListener(event, handleActivity);
    });

    // Start the initial timer
    resetTimer();

    // Cleanup
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      activityEvents.forEach((event) => {
        document.removeEventListener(event, handleActivity);
        window.removeEventListener(event, handleActivity);
      });
    };
  }, [isAuthenticated, resetTimer]);
}
