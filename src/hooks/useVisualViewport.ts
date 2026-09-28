import { useEffect, useState } from 'react';

export interface VisualViewportBox {
  /** Visible height in CSS px (shrinks when the on-screen keyboard is up). */
  height: number;
  /** How far the visible area is scrolled down from the layout viewport. */
  offsetTop: number;
}

function read(): VisualViewportBox | null {
  const vv = window.visualViewport;
  if (!vv) return null;
  return { height: Math.round(vv.height), offsetTop: Math.round(vv.offsetTop) };
}

/**
 * Tracks the *visual* viewport — what's actually on screen. On phones this
 * shrinks when the software keyboard opens, while `100vh`/`100dvh` and
 * `position: fixed; inset: 0` keep the full-screen size and the keyboard just
 * covers the bottom of the page. Returns null where unsupported (desktop
 * Electron/older browsers), in which case callers should keep their default
 * full-screen sizing.
 */
export function useVisualViewport(): VisualViewportBox | null {
  const [box, setBox] = useState<VisualViewportBox | null>(read);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setBox(read());
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    window.addEventListener('orientationchange', update);
    update();
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  return box;
}
