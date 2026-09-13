import { useEffect, useState } from "react";

/**
 * Tracks whether the viewport is at or below `breakpoint` (default matches
 * Tailwind's `sm` breakpoint, 640px). Use this when a responsive decision
 * can't be expressed with Tailwind classes alone - e.g. branching inline
 * `style` values (which always win over responsive classes) or swapping
 * pixel-based layout math for a stacked/full-screen mobile layout.
 */
export function useIsMobile(breakpoint = 640) {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth < breakpoint
  );

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const handleChange = () => setIsMobile(mql.matches);
    handleChange();
    mql.addEventListener("change", handleChange);
    return () => mql.removeEventListener("change", handleChange);
  }, [breakpoint]);

  return isMobile;
}

export default useIsMobile;
