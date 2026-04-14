import { useMap } from "react-leaflet";
import { useEffect, useRef } from "react";
import { MAP_CONFIG } from "../config/mapConfig";

function isOverMarkerOrPopup(target) {
  if (!target || !target.closest) return false;
  return Boolean(target.closest(".leaflet-marker-icon") || target.closest(".leaflet-popup"));
}

/** Map UI that is not the map surface — ignore so we do not long-press / mis-handle taps. */
function isOverMapChrome(target) {
  if (!target || !target.closest) return false;
  return Boolean(
    target.closest(".leaflet-control") ||
      target.closest(".leaflet-bar") ||
      target.closest(".google-locate-btn") ||
      target.closest(".scan-fab") ||
      target.closest(".map-search-bar-wrap") ||
      target.closest(".map-search-outer") ||
      target.closest(".leaflet-popup")
  );
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
      if (isOverMapChrome(ev.target)) return;
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
        suppressClickUntilRef.current = Date.now() + MAP_CONFIG.LONG_PRESS_SUPPRESS_CLICK_MS;
        onLongPressMap?.(latlng);
      }, MAP_CONFIG.LONG_PRESS_DURATION_MS);
    };

    const onPointerMove = (ev) => {
      if (!timerRef.current) return;
      const dx = ev.clientX - startRef.current.x;
      const dy = ev.clientY - startRef.current.y;
      if (Math.hypot(dx, dy) > MAP_CONFIG.LONG_PRESS_MOVE_PX) clearTimer();
    };

    const onPointerEnd = () => {
      clearTimer();
    };

    const onMapClick = (e) => {
      if (Date.now() < suppressClickUntilRef.current) return;
      const t = e.originalEvent?.target;
      if (isOverMapChrome(t)) return;
      if (isOverMarkerOrPopup(t)) return;
      onTapMap?.(e.latlng, { zoom: map.getZoom() });
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
