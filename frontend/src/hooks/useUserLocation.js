import { useState, useEffect, useCallback, useRef } from "react";
import { haversineMeters } from "../utils/geoDistance";
import { MAP_CONFIG } from "../config/mapConfig";

function watchOptions(overrides = {}) {
  return {
    enableHighAccuracy: MAP_CONFIG.USER_LOCATION_ENABLE_HIGH_ACCURACY,
    maximumAge: MAP_CONFIG.USER_LOCATION_MAXIMUM_AGE_MS,
    timeout: MAP_CONFIG.USER_LOCATION_TIMEOUT_MS,
    ...overrides,
  };
}

/**
 * Live location via watchPosition + throttled updates for smooth distance UX.
 */
export function useUserLocation() {
  const [coords, setCoords] = useState(null);
  const [status, setStatus] = useState("idle");
  const [errorMessage, setErrorMessage] = useState(null);
  /** Timestamp (ms) of last coords update — used to decide if a locate refresh is needed */
  const [lastFixAt, setLastFixAt] = useState(null);

  const lastEmittedRef = useRef(null);
  const lastEmitTimeRef = useRef(0);

  const emitPosition = useCallback((lat, lng, accuracyM = 0) => {
    const now = Date.now();
    const prev = lastEmittedRef.current;
    if (prev) {
      const moved = haversineMeters(prev.lat, prev.lng, lat, lng);
      const elapsed = now - lastEmitTimeRef.current;
      const accuracyDerivedThreshold = Number.isFinite(accuracyM) && accuracyM > 0
        ? Math.min(
            MAP_CONFIG.USER_LOCATION_ACCURACY_JITTER_CAP_M,
            accuracyM * MAP_CONFIG.USER_LOCATION_ACCURACY_JITTER_FACTOR
          )
        : 0;
      const minMoveThreshold = Math.max(MAP_CONFIG.USER_LOCATION_MIN_MOVE_M, accuracyDerivedThreshold);
      if (moved < minMoveThreshold && elapsed < MAP_CONFIG.USER_LOCATION_MIN_INTERVAL_MS) {
        return;
      }
    }
    lastEmittedRef.current = { lat, lng };
    lastEmitTimeRef.current = now;
    setCoords({ lat, lng });
    setLastFixAt(Date.now());
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
        const accuracy = pos.coords.accuracy;
        emitPosition(lat, lng, accuracy);
        setStatus("ready");
        setErrorMessage(null);
      },
      (err) => {
        setCoords(null);
        setLastFixAt(null);
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
      watchOptions()
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
        setLastFixAt(Date.now());
        setStatus("ready");
        setErrorMessage(null);
      },
      (err) => {
        setCoords(null);
        setLastFixAt(null);
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
      watchOptions({ maximumAge: 0 })
    );
  }, []);

  return { coords, status, errorMessage, refresh, lastFixAt };
}
