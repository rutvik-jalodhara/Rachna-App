import { useMap } from "react-leaflet";
import { useEffect, useRef } from "react";

/** Smoothly flies the map when `target` changes. */
export default function MapFlyTo({ target, zoom = 15 }) {
  const map = useMap();
  const prevKey = useRef(null);

  useEffect(() => {
    if (!target?.center || !Array.isArray(target.center) || target.center.length !== 2) {
      prevKey.current = null;
      return;
    }
    const [lat, lng] = target.center;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const key = `${lat.toFixed(6)}|${lng.toFixed(6)}|${target.zoom ?? zoom}|${target.key ?? ""}`;
    if (prevKey.current === key) return;
    prevKey.current = key;
    map.flyTo([lat, lng], target.zoom ?? zoom, { duration: 0.75 });
  }, [map, target, zoom]);

  return null;
}
