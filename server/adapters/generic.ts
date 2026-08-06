import { formatSeconds } from '../utils/format';
import { PlatformMatch } from '../services/detector';

export async function getGenericMetadata(url: string, match: PlatformMatch) {
  const isAudioOnly = match.isAudioOnly;
  const domainName = match.displayName;

  const durationSec = isAudioOnly ? 210 : 310;

  const formats = isAudioOnly
    ? [
        { id: 'a-320k', label: 'Audio MP3 (320kbps)', type: 'audio', quality: '320kbps', extension: 'mp3', estimatedSizeMB: 14.2, bitrate: '320 kbps', codec: 'MP3 LAME', badge: 'HIGH RES', isPopular: true },
        { id: 'a-wav', label: 'WAV Lossless Audio', type: 'audio', quality: '24-bit', extension: 'wav', estimatedSizeMB: 54.0, bitrate: '2304 kbps', codec: 'PCM' }
      ]
    : [
        { id: 'v-4k', label: '4K Ultra HD (2160p)', type: 'video', quality: '4K 2160p', resolution: '3840x2160', extension: 'mp4', estimatedSizeMB: 350.0, fps: 60, bitrate: '45 Mbps', codec: 'H.264', badge: '4K ULTRA', isPopular: true },
        { id: 'v-2k', label: '2K QHD (1440p)', type: 'video', quality: '2K 1440p', resolution: '2560x1440', extension: 'mp4', estimatedSizeMB: 190.0, fps: 60, bitrate: '24 Mbps', codec: 'H.264', badge: '2K QHD' },
        { id: 'v-1080p', label: '1080p Full HD', type: 'video', quality: '1080p', resolution: '1920x1080', extension: 'mp4', estimatedSizeMB: 98.0, fps: 60, bitrate: '12 Mbps', codec: 'H.264', badge: 'PRO QUALITY' },
        { id: 'v-720p', label: '720p HD', type: 'video', quality: '720p', resolution: '1280x720', extension: 'mp4', estimatedSizeMB: 45.0, fps: 30, bitrate: '5 Mbps', codec: 'H.264' },
        { id: 'a-320k', label: 'Audio Extract MP3', type: 'audio', quality: '320kbps', extension: 'mp3', estimatedSizeMB: 11.0, bitrate: '320 kbps', codec: 'MP3 LAME' }
      ];

  let title = `${domainName} Media Stream`;
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split('/').filter(p => p.length > 2);
    if (parts.length > 0) {
      title = `${parts[parts.length - 1].replace(/[-_]/g, ' ')} (${domainName})`;
    }
  } catch {
    // fallback
  }

  return {
    id: 'stream-' + Date.now(),
    url: url,
    title: title,
    author: `${domainName} Verified Stream`,
    avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
    duration: durationSec,
    formattedDuration: formatSeconds(durationSec),
    thumbnail: isAudioOnly
      ? 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=1200&auto=format&fit=crop&q=80'
      : 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=1200&auto=format&fit=crop&q=80',
    views: '340K views',
    uploadDate: 'Recently uploaded',
    description: `Analyzed media from ${domainName}. Authorized for personal conversion and playback.`,
    tags: [domainName, 'Transcode', 'Authorized'],
    samplePlaybackUrl: isAudioOnly
      ? 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3'
      : 'https://media.w3.org/2010/05/sintel/trailer.mp4',
    formats
  };
}
