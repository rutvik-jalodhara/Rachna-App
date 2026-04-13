import { useState, useEffect, useCallback, useRef } from "react";

const GEO_OPTIONS = {
  enableHighAccuracy: false,
  maximumAge: 120_000,
  timeout: 12_000,
};

/**
 * One-shot + refreshable browser geolocation for distance-aware UX.
 */
export function useUserLocation() {
  const [coords, setCoords] = useState(null);
  const [status, setStatus] = useState("idle");
  const [errorMessage, setErrorMessage] = useState(null);

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
        setCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
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
      GEO_OPTIONS
    );
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { coords, status, errorMessage, refresh };
}
