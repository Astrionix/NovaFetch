export function formatSeconds(totalSeconds: number): string {
  if (!totalSeconds || isNaN(totalSeconds) || totalSeconds <= 0) return '00:00';
  
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  const pad = (num: number) => num.toString().padStart(2, '0');

  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
}

export function sanitizeFilename(title: string): string {
  return title.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'NovaFetch_Media';
}
