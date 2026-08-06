export type ThemeType = 'cinema' | 'neon' | 'cyberpunk' | 'oled';

export interface ClipSettings {
  enabled: boolean;
  startTime: number; // in seconds
  endTime: number;   // in seconds
}

export interface Id3Tags {
  title: string;
  artist: string;
  album: string;
}

export interface BatchItem {
  id: string;
  url: string;
  stage: 'pending' | 'analyzing' | 'ready' | 'processing' | 'done' | 'error';
  metadata?: MediaMetadata;
  selectedFormat?: FormatOption;
  error?: string;
  progress?: number;
}

export type FormatType = 'video' | 'audio';

export interface FormatOption {
  id: string;
  label: string;
  type: FormatType;
  quality: string;
  resolution?: string;
  extension: 'mp4' | 'webm' | 'mp3' | 'm4a' | 'flac' | 'wav';
  estimatedSizeMB: number;
  fps?: number;
  bitrate: string;
  codec: string;
  badge?: string;
  isPopular?: boolean;
}

export interface MediaMetadata {
  id: string;
  url: string;
  title: string;
  author: string;
  avatar: string;
  duration: number; // in seconds
  formattedDuration: string;
  thumbnail: string;
  views: string;
  uploadDate: string;
  description: string;
  formats: FormatOption[];
  tags: string[];
  samplePlaybackUrl?: string;
  playlistTracks?: { title: string; duration: string; url: string }[];
}

export type ProcessingStep = 
  | 'idle'
  | 'analyzing'
  | 'downloading_stream'
  | 'processing_audio'
  | 'transcoding'
  | 'packaging'
  | 'complete'
  | 'error';

export interface ProcessingLog {
  id: string;
  timestamp: string;
  message: string;
  step: ProcessingStep;
  type: 'info' | 'success' | 'warning' | 'error';
}

export interface ConversionHistoryItem {
  id: string;
  mediaTitle: string;
  author: string;
  thumbnail: string;
  format: string;
  quality: string;
  extension: string;
  fileSizeMB: number;
  timestamp: number;
  downloadUrl: string;
  duration: string;
  url?: string;
}

export interface AppSettings {
  glowIntensity: 'low' | 'medium' | 'high';
  autoDownload: boolean;
  defaultFormat: '4k' | '1080p' | 'mp3_320';
  ambientParticles: boolean;
  soundEffects: boolean;
  theme: ThemeType;
}

