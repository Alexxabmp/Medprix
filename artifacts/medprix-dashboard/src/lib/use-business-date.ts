import { useCallback, useEffect, useState } from "react";
import { localDateKey } from "./business-date";

/** Shared page state keeps the native input and its filtered data on the same day. */
export function useBusinessDate() {
  const [date, setDate] = useState(() => new Date());
  const [followingToday, setFollowingToday] = useState(true);
  const selectDate = useCallback((selected: Date) => {
    if (!Number.isFinite(selected.getTime())) return;
    setDate(selected);
    setFollowingToday(localDateKey(selected) === localDateKey());
  }, []);

  useEffect(() => {
    const update = () => { if (followingToday) setDate(new Date()); };
    const interval = window.setInterval(update, 30_000);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [followingToday]);
  return { date, selectDate };
}
