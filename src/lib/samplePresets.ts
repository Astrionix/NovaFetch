import type { MediaMetadata } from '../types';

export interface SamplePreset {
  id: string;
  name: string;
  category: '4K Video' | 'Lo-Fi Audio' | 'Nature HDR' | 'Sci-Fi Trailer';
  url: string;
  badge: string;
  iconName: string;
  data: MediaMetadata;
}

export const SAMPLE_PRESETS: SamplePreset[] = [
  {
    id: 'cyberpunk-4k',
    name: 'Neo-Tokyo 2099 (4K Ultra HD)',
    category: '4K Video',
    url: 'https://youtube.com/watch?v=cyberpunk-2099-4k-hdr',
    badge: '4K 60FPS HDR',
    iconName: 'Sparkles',
    data: {
      id: 'cyberpunk-4k',
      url: 'https://youtube.com/watch?v=cyberpunk-2099-4k-hdr',
      title: 'NEO TOKYO 2099 — Futuristic Cyberpunk Cityscape in 4K HDR 60fps',
      author: 'Aetheria Digital Studios',
      avatar: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&auto=format&fit=crop&q=80',
      duration: 385,
      formattedDuration: '06:25',
      thumbnail: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=1200&auto=format&fit=crop&q=80',
      views: '2.4M views',
      uploadDate: '2 days ago',
      description: 'Experience futuristic rainy highways, glowing neon skyscrapers, and quantum speeder traffic rendered in real-time Unreal Engine 5.4 60FPS raytraced graphics.',
      tags: ['Cyberpunk', '4K HDR', 'Sci-Fi', 'Unreal Engine 5', 'Raytracing'],
      samplePlaybackUrl: 'https://media.w3.org/2010/05/sintel/trailer.mp4',
      formats: [
        { id: 'v-2160p', label: '4K Ultra HD', type: 'video', quality: '2160p', resolution: '3840x2160', extension: 'mp4', estimatedSizeMB: 482.5, fps: 60, bitrate: '45 Mbps', codec: 'AV1 / HEVC', badge: 'PRO QUALITY', isPopular: true },
        { id: 'v-1440p', label: '1440p QHD', type: 'video', quality: '1440p', resolution: '2560x1440', extension: 'mp4', estimatedSizeMB: 235.0, fps: 60, bitrate: '22 Mbps', codec: 'H.264 / VP9' },
        { id: 'v-1080p', label: '1080p Full HD', type: 'video', quality: '1080p', resolution: '1920x1080', extension: 'mp4', estimatedSizeMB: 112.4, fps: 60, bitrate: '12 Mbps', codec: 'H.264' },
        { id: 'v-720p', label: '720p HD', type: 'video', quality: '720p', resolution: '1280x720', extension: 'mp4', estimatedSizeMB: 54.2, fps: 30, bitrate: '5 Mbps', codec: 'H.264' },
        { id: 'a-320k', label: 'Audio MP3 (320kbps)', type: 'audio', quality: '320kbps', extension: 'mp3', estimatedSizeMB: 14.8, bitrate: '320 kbps', codec: 'MP3 LAME', badge: 'LOSSLESS AUDIO', isPopular: true },
        { id: 'a-wav', label: 'Audio WAV (Master)', type: 'audio', quality: '24-bit 48kHz', extension: 'wav', estimatedSizeMB: 68.4, bitrate: '2304 kbps', codec: 'PCM 24-bit' },
        { id: 'a-flac', label: 'Audio FLAC', type: 'audio', quality: 'Lossless', extension: 'flac', estimatedSizeMB: 42.1, bitrate: '1411 kbps', codec: 'FLAC Audio' }
      ]
    }
  },
  {
    id: 'lofi-synthwave',
    name: 'Midnight Synthwave Stream',
    category: 'Lo-Fi Audio',
    url: 'https://soundcloud.com/synthwave-master/cosmic-midnight-chill-mix',
    badge: 'HQ AUDIO 320k',
    iconName: 'Headphones',
    data: {
      id: 'lofi-synthwave',
      url: 'https://soundcloud.com/synthwave-master/cosmic-midnight-chill-mix',
      title: 'COSMIC MIDNIGHT — Chill Synthwave & Retrowave Beats to Relax/Code To',
      author: 'Kavinsky & Neon Horizon',
      avatar: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=150&auto=format&fit=crop&q=80',
      duration: 1420,
      formattedDuration: '23:40',
      thumbnail: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1200&auto=format&fit=crop&q=80',
      views: '890K streams',
      uploadDate: '1 week ago',
      description: 'Lush analog synthesizer pads, deep basslines, and retro drum machines recorded on vintage cassette decks.',
      tags: ['Synthwave', 'Lo-Fi', 'Retrowave', 'Chillout', 'Coding Music'],
      samplePlaybackUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
      formats: [
        { id: 'a-320k', label: 'MP3 Ultra (320 kbps)', type: 'audio', quality: '320kbps', extension: 'mp3', estimatedSizeMB: 54.2, bitrate: '320 kbps', codec: 'MP3 LAME', badge: 'HIGH RES', isPopular: true },
        { id: 'a-flac', label: 'FLAC Lossless', type: 'audio', quality: '24-bit 96kHz', extension: 'flac', estimatedSizeMB: 184.0, bitrate: '1411 kbps', codec: 'FLAC Audio' },
        { id: 'a-wav', label: 'WAV Studio Master', type: 'audio', quality: '24-bit', extension: 'wav', estimatedSizeMB: 280.5, bitrate: '2304 kbps', codec: 'Uncompressed PCM' },
        { id: 'a-m4a', label: 'AAC / M4A Audio', type: 'audio', quality: '256kbps', extension: 'm4a', estimatedSizeMB: 42.0, bitrate: '256 kbps', codec: 'AAC-LC' },
        { id: 'v-1080p', label: 'Visualizer Video 1080p', type: 'video', quality: '1080p', resolution: '1920x1080', extension: 'mp4', estimatedSizeMB: 310.0, fps: 60, bitrate: '10 Mbps', codec: 'H.264' }
      ]
    }
  },
  {
    id: 'nature-aurora-4k',
    name: 'Norwegian Aurora Borealis 4K',
    category: 'Nature HDR',
    url: 'https://vimeo.com/norway-aurora-borealis-4k-timelapse',
    badge: '60 FPS ATMOS',
    iconName: 'Compass',
    data: {
      id: 'nature-aurora-4k',
      url: 'https://vimeo.com/norway-aurora-borealis-4k-timelapse',
      title: 'CELESTIAL LIGHTS — Aurora Borealis over Tromsø Fjords (4K Ultra HDR)',
      author: 'Nordic Expeditions',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
      duration: 510,
      formattedDuration: '08:30',
      thumbnail: 'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?w=1200&auto=format&fit=crop&q=80',
      views: '5.1M views',
      uploadDate: '3 weeks ago',
      description: 'Dynamic green and purple dancing aurora curtains filmed over sub-zero glacial waters with spatial ambient audio.',
      tags: ['Aurora', 'Nature', '4K HDR', 'Timelapse', 'Norway'],
      samplePlaybackUrl: 'https://media.w3.org/2010/05/bunny/trailer.mp4',
      formats: [
        { id: 'v-2160p', label: '4K Ultra HD (HDR10)', type: 'video', quality: '2160p', resolution: '3840x2160', extension: 'mp4', estimatedSizeMB: 610.0, fps: 60, bitrate: '50 Mbps', codec: 'HEVC / H.265', badge: 'HDR10', isPopular: true },
        { id: 'v-1080p', label: '1080p Full HD', type: 'video', quality: '1080p', resolution: '1920x1080', extension: 'mp4', estimatedSizeMB: 145.0, fps: 60, bitrate: '14 Mbps', codec: 'H.264' },
        { id: 'a-flac', label: 'Ambient Spatial Audio (FLAC)', type: 'audio', quality: '96kHz/24bit', extension: 'flac', estimatedSizeMB: 88.5, bitrate: '1411 kbps', codec: 'Dolby Atmos Pass' }
      ]
    }
  }
];
