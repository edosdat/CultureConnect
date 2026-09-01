'use client';

import { useEffect, useState } from 'react';
import TastesSheet from './TastesSheet';
import {
  CLOSE_TASTES_EVENT,
  OPEN_TASTES_EVENT,
} from './tastesUiEvents';

/**
 * Overlay open state lives here — a host that stays mounted when the
 * avatar menu unmounts. Do not store `tastesOpen` inside AuthButtons.
 */
export default function TastesOverlayHost() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onOpen() {
      setOpen(true);
    }
    function onClose() {
      setOpen(false);
    }
    window.addEventListener(OPEN_TASTES_EVENT, onOpen);
    window.addEventListener(CLOSE_TASTES_EVENT, onClose);
    return () => {
      window.removeEventListener(OPEN_TASTES_EVENT, onOpen);
      window.removeEventListener(CLOSE_TASTES_EVENT, onClose);
    };
  }, []);

  return <TastesSheet open={open} onClose={() => setOpen(false)} />;
}
