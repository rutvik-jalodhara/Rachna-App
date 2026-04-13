const STORAGE_KEY = "rachna-map-recent-searches";
const MAX_ITEMS = 5;

function safeParse(raw) {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()) : [];
  } catch {
    return [];
  }
}

export function getRecentSearches() {
  if (typeof localStorage === "undefined") return [];
  return safeParse(localStorage.getItem(STORAGE_KEY));
}

export function pushRecentSearch(text) {
  const t = String(text || "").trim();
  if (!t || t.length > 200) return;
  const prev = getRecentSearches().filter((x) => x.toLowerCase() !== t.toLowerCase());
  prev.unshift(t);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prev.slice(0, MAX_ITEMS)));
  } catch {
    /* quota */
  }
}
