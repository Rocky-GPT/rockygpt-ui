export function parseSemesterEventDate(dateStr: string, semesterName: string): Date {
  const year = semesterName.match(/\d{4}/)?.[0] ?? String(new Date().getFullYear());
  const parts = dateStr.trim().split(' ');
  const month = (parts[0]?.replace(/[^a-zA-Z]/g, '') || '').slice(0, 3);
  const day = parts[1]?.replace(/[^0-9]/g, '') || '1';
  const parsed = new Date(`${month} ${day}, ${year}`);
  return Number.isNaN(parsed.getTime()) ? new Date(9999, 0, 1) : parsed;
}
