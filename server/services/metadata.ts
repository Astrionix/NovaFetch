import { detectPlatform } from './detector';
import { getYouTubeMetadata } from '../adapters/youtube';
import { getGenericMetadata } from '../adapters/generic';

export async function analyzeUrlMetadata(url: string) {
  const match = detectPlatform(url);

  if (match.platform === 'youtube') {
    try {
      return await getYouTubeMetadata(url);
    } catch {
      // Fallback to generic adapter if ytdl rate-limited or fails
      return await getGenericMetadata(url, match);
    }
  }

  return await getGenericMetadata(url, match);
}
