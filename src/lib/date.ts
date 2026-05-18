const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function getTodayJst(): string {
  const now = new Date(Date.now() + JST_OFFSET_MS);
  return now.toISOString().slice(0, 10);
}

export function getJstDateNDaysAgo(daysAgo: number): string {
  const now = new Date(Date.now() + JST_OFFSET_MS - daysAgo * 24 * 60 * 60 * 1000);
  return now.toISOString().slice(0, 10);
}
