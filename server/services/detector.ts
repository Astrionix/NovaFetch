export type PlatformType = 
  | 'youtube'
  | 'vimeo'
  | 'soundcloud'
  | 'tiktok'
  | 'instagram'
  | 'twitter'
  | 'twitch'
  | 'generic';

export interface PlatformMatch {
  platform: PlatformType;
  displayName: string;
  isAudioOnly: boolean;
  normalizedUrl: string;
}

export function detectPlatform(rawUrl: string): PlatformMatch {
  let trimmed = rawUrl.trim();

  // Auto-expand 11-character YouTube video IDs (e.g. "uw6etHCmu4g")
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    trimmed = `https://www.youtube.com/watch?v=${trimmed}`;
  }

  const lowerUrl = trimmed.toLowerCase();

  if (lowerUrl.includes('youtube.com') || lowerUrl.includes('youtu.be')) {
    return { platform: 'youtube', displayName: 'YouTube', isAudioOnly: false, normalizedUrl: trimmed };
  }
  if (lowerUrl.includes('vimeo.com')) {
    return { platform: 'vimeo', displayName: 'Vimeo', isAudioOnly: false, normalizedUrl: trimmed };
  }
  if (lowerUrl.includes('soundcloud.com')) {
    return { platform: 'soundcloud', displayName: 'SoundCloud', isAudioOnly: true, normalizedUrl: trimmed };
  }
  if (lowerUrl.includes('tiktok.com')) {
    return { platform: 'tiktok', displayName: 'TikTok', isAudioOnly: false, normalizedUrl: trimmed };
  }
  if (lowerUrl.includes('instagram.com')) {
    return { platform: 'instagram', displayName: 'Instagram', isAudioOnly: false, normalizedUrl: trimmed };
  }
  if (lowerUrl.includes('twitter.com') || lowerUrl.includes('x.com')) {
    return { platform: 'twitter', displayName: 'X (Twitter)', isAudioOnly: false, normalizedUrl: trimmed };
  }
  if (lowerUrl.includes('twitch.tv')) {
    return { platform: 'twitch', displayName: 'Twitch', isAudioOnly: false, normalizedUrl: trimmed };
  }

  const isAudio = lowerUrl.includes('.mp3') || lowerUrl.includes('audio');
  return { platform: 'generic', displayName: 'Generic Stream', isAudioOnly: isAudio, normalizedUrl: trimmed };
}
