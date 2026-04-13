import { useMap } from "react-leaflet";
import { useEffect, useRef } from "react";

const LONG_PRESS_MS = 620;
const MOVE_PX = 14;

function isOverMarkerOrPopup(target) {
  if (!target || !target.closest) return false;
  return Boolean(target.closest(".leaflet-marker-icon") || target.closest(".leaflet-popup"));
}

/**
 * Pointer-based tap vs long-press on the map pane (not on markers).
 * Short tap → onTapMap(latlng). Long press → onLongPressMap(latlng).
 * Suppresses the click that often follows a long press.
 */
export default function MapInteractionLayer({ onTapMap, onLongPressMap }) {
  const map = useMap();
  const timerRef = useRef(null);
  const startRef = useRef({ x: 0, y: 0, latlng: null });
  const suppressClickUntilRef = useRef(0);

  useEffect(() => {
    const el = map.getContainer();

    const clearTimer = () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const onDragStart = () => {
      clearTimer();
    };

    const onPointerDown = (ev) => {
      if (ev.pointerType === "mouse" && ev.button !== 0) return;
      if (isOverMarkerOrPopup(ev.target)) return;

      clearTimer();
      startRef.current = {
        x: ev.clientX,
        y: ev.clientY,
        latlng: map.mouseEventToLatLng(ev),
      };

      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        const { latlng } = startRef.current;
        if (!latlng) return;
        suppressClickUntilRef.current = Date.now() + 450;
        onLongPressMap?.(latlng);
      }, LONG_PRESS_MS);
    };

    const onPointerMove = (ev) => {
      if (!timerRef.current) return;
      const dx = ev.clientX - startRef.current.x;
      const dy = ev.clientY - startRef.current.y;
      if (Math.hypot(dx, dy) > MOVE_PX) clearTimer();
    };

    const onPointerEnd = () => {
      clearTimer();
    };

    const onMapClick = (e) => {
      if (Date.now() < suppressClickUntilRef.current) return;
      if (isOverMarkerOrPopup(e.originalEvent?.target)) return;
      onTapMap?.(e.latlng);
    };

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerEnd);
    el.addEventListener("pointercancel", onPointerEnd);
    map.on("dragstart", onDragStart);
    map.on("click", onMapClick);

    return () => {
      clearTimer();
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerEnd);
      el.removeEventListener("pointercancel", onPointerEnd);
      map.off("dragstart", onDragStart);
      map.off("click", onMapClick);
    };
  }, [map, onTapMap, onLongPressMap]);

  return null;
}
