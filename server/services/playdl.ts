/**
 * play-dl based stream URL resolver — pure Node.js, no Python / yt-dlp binary needed.
 * Works on Vercel serverless AND Render free tier.
 *
 * Uses video_info() to get deciphered format data with direct CDN URLs,
 * then picks the best audio/video format and returns its URL for a 302 redirect.
 */

let playdl: typeof import('play-dl') | null = null;

async function getPlayDl() {
  if (playdl) return playdl;
  try {
    playdl = await import('play-dl');
    return playdl;
  } catch {
    return null;
  }
}

/**
 * Resolve a direct streamable CDN URL for a YouTube video using play-dl.
 * Returns null if play-dl is unavailable or the video is not streamable.
 */
export async function getPlayDlStreamUrl(youtubeUrl: string, audioOnly = true): Promise<string | null> {
  const pd = await getPlayDl();
  if (!pd) {
    console.warn('[play-dl] Module not available');
    return null;
  }

  try {
    console.log('[play-dl] Fetching video_info for', youtubeUrl.slice(-20));
    const info = await pd.video_info(youtubeUrl);
    if (!info || !info.format || info.format.length === 0) {
      console.warn('[play-dl] No format data returned');
      return null;
    }

    const formats = info.format;

    if (audioOnly) {
      // Prefer audio-only formats: opus/webm first, then m4a, then any audio
      const audioFormats = formats.filter(
        f => f.url && f.mimeType && f.mimeType.startsWith('audio/')
      );

      if (audioFormats.length === 0) {
        console.warn('[play-dl] No audio-only formats found, trying any format with audio');
        // Fall back to any format that has a URL
        const anyWithUrl = formats.find(f => f.url);
        if (anyWithUrl?.url) {
          console.log('[play-dl] Using fallback format URL:', anyWithUrl.url.slice(0, 80));
          return anyWithUrl.url;
        }
        return null;
      }

      // Sort by bitrate descending — highest quality audio
      audioFormats.sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));
      const best = audioFormats[0];
      if (best.url) {
        console.log('[play-dl] Audio CDN URL resolved (bitrate:', best.bitrate, '):', best.url.slice(0, 80));
        return best.url;
      }
    } else {
      // Video: prefer mp4 with audio, highest resolution
      const videoFormats = formats.filter(
        f => f.url && f.mimeType && f.mimeType.startsWith('video/') && f.height && f.height > 0
      );

      if (videoFormats.length === 0) {
        const anyWithUrl = formats.find(f => f.url);
        if (anyWithUrl?.url) return anyWithUrl.url;
        return null;
      }

      // Sort by height descending
      videoFormats.sort((a, b) => (b.height ?? 0) - (a.height ?? 0));
      const best = videoFormats[0];
      if (best.url) {
        console.log('[play-dl] Video CDN URL resolved (res:', best.height, 'p):', best.url.slice(0, 80));
        return best.url;
      }
    }

    console.warn('[play-dl] Could not extract URL from any format');
    return null;
  } catch (err: any) {
    console.error('[play-dl] Error resolving stream URL:', err?.message || err);
    return null;
  }
}
