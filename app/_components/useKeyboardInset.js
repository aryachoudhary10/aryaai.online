"use client";

import { useEffect } from "react";

// The on-screen keyboard on iOS Safari does not resize the layout viewport, so
// a position:fixed bar ends up hidden behind it. visualViewport reports the
// real visible area; the difference is how far the bar has to lift.
//
// Android Chrome usually resizes the viewport instead, in which case the
// computed inset is ~0 and this is a no-op. Both paths are correct.

export function useKeyboardInset() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const root = document.documentElement;
    let frame = 0;

    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
        // Below ~80px it's browser chrome collapsing, not a keyboard.
        root.style.setProperty("--kb", inset > 80 ? `${Math.round(inset)}px` : "0px");
      });
    };

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      cancelAnimationFrame(frame);
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      root.style.removeProperty("--kb");
    };
  }, []);
}
