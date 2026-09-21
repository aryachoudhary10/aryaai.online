"use client";

import { useEffect } from "react";

export function RegisterSW() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // Registered after load so it never competes with the first paint.
    const on = () => navigator.serviceWorker.register("/sw.js").catch(() => {});
    if (document.readyState === "complete") on();
    else {
      window.addEventListener("load", on);
      return () => window.removeEventListener("load", on);
    }
  }, []);

  return null;
}
