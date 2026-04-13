import { useState, useEffect, useCallback, useRef } from "react";
import { haversineMeters } from "../utils/geoDistance";

const WATCH_OPTIONS = {
  enableHighAccuracy: false,
  maximumAge: 8_000,
  timeout: 20_000,
};

/** Min movement (m) or time (ms) before updating React state — reduces re-renders while staying responsive */
const MIN_MOVE_M = 10;
const MIN_INTERVAL_MS = 3_500;

/**
 * Live location via watchPosition + throttled updates for smooth distance UX.
 */
export function useUserLocation() {
  const [coords, setCoords] = useState(null);
  const [status, setStatus] = useState("idle");
  const [errorMessage, setErrorMessage] = useState(null);

  const lastEmittedRef = useRef(null);
  const lastEmitTimeRef = useRef(0);

  const emitPosition = useCallback((lat, lng) => {
    const now = Date.now();
    const prev = lastEmittedRef.current;
    if (prev) {
      const moved = haversineMeters(prev.lat, prev.lng, lat, lng);
      const elapsed = now - lastEmitTimeRef.current;
      if (moved < MIN_MOVE_M && elapsed < MIN_INTERVAL_MS) {
        return;
      }
    }
    lastEmittedRef.current = { lat, lng };
    lastEmitTimeRef.current = now;
    setCoords({ lat, lng });
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) {
      setStatus("unsupported");
      setErrorMessage("Geolocation is not supported on this device.");
      return undefined;
    }

    setStatus("loading");
    setErrorMessage(null);

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        emitPosition(lat, lng);
        setStatus("ready");
        setErrorMessage(null);
      },
      (err) => {
        setCoords(null);
        lastEmittedRef.current = null;
        if (err.code === 1) {
          setStatus("denied");
          setErrorMessage("Location permission denied. Enable it in browser settings to see distances.");
        } else if (err.code === 2) {
          setStatus("unavailable");
          setErrorMessage("Position unavailable. Try again outdoors or enable GPS.");
        } else {
          setStatus("error");
          setErrorMessage(err.message || "Could not read your location.");
        }
      },
      WATCH_OPTIONS
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [emitPosition]);

  const refresh = useCallback(() => {
    if (!navigator.geolocation) {
      setStatus("unsupported");
      setErrorMessage("Geolocation is not supported on this device.");
      setCoords(null);
      return;
    }

    setStatus("loading");
    setErrorMessage(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        lastEmittedRef.current = { lat, lng };
        lastEmitTimeRef.current = Date.now();
        setCoords({ lat, lng });
        setStatus("ready");
        setErrorMessage(null);
      },
      (err) => {
        setCoords(null);
        if (err.code === 1) {
          setStatus("denied");
          setErrorMessage("Location permission denied. Enable it in browser settings to see distances.");
        } else if (err.code === 2) {
          setStatus("unavailable");
          setErrorMessage("Position unavailable. Try again outdoors or enable GPS.");
        } else {
          setStatus("error");
          setErrorMessage(err.message || "Could not read your location.");
        }
      },
      { ...WATCH_OPTIONS, maximumAge: 0 }
    );
  }, []);

  return { coords, status, errorMessage, refresh };
}
