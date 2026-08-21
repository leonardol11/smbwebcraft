const DAY_ALIASES: Record<string, string> = {
  mon: "Monday",
  monday: "Monday",
  tue: "Tuesday",
  tues: "Tuesday",
  tuesday: "Tuesday",
  wed: "Wednesday",
  weds: "Wednesday",
  wednesday: "Wednesday",
  thu: "Thursday",
  thur: "Thursday",
  thurs: "Thursday",
  thursday: "Thursday",
  fri: "Friday",
  friday: "Friday",
  sat: "Saturday",
  saturday: "Saturday",
  sun: "Sunday",
  sunday: "Sunday",
};

export const FALLBACK_HOURS: Record<string, string> = {
  Monday: "Call for hours",
  Tuesday: "Call for hours",
  Wednesday: "Call for hours",
  Thursday: "Call for hours",
  Friday: "Call for hours",
  Saturday: "Call for hours",
  Sunday: "Call for hours",
};

function canonicalDay(raw: string): string {
  const key = raw.trim().toLowerCase().replace(/\.$/, "");
  return DAY_ALIASES[key] ?? raw.trim();
}

/** Normalize Places weekday keys (Mon / Monday) into a stable hours record. */
export function normalizeHours(hours?: Record<string, string> | null): Record<string, string> {
  if (!hours) return { ...FALLBACK_HOURS };
  const next: Record<string, string> = {};
  for (const [rawDay, value] of Object.entries(hours)) {
    const day = canonicalDay(rawDay);
    const hoursText = value.trim();
    if (!day || !hoursText) continue;
    next[day] = hoursText;
  }
  return Object.keys(next).length > 0 ? next : { ...FALLBACK_HOURS };
}
