import { useState, useEffect, useRef } from 'react';
import type { MediaMetadata, FormatOption, ClipSettings, Id3Tags, BatchItem } from './types';
import { analyzeMediaUrl, triggerFileDownload, getApiBaseUrl } from './lib/mediaEngine';
import WaveformVisualizer from './components/WaveformVisualizer';
import QRCodeModal from './components/QRCodeModal';
import { saveHistoryItem } from './lib/history';
import './index.css';


// ── CINEMA PARTICLE BACKGROUND ────────────────────────────────────────────────
function CinemaBg() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    let raf: number;
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener('resize', resize);

    const particles = Array.from({ length: 70 }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      r: Math.random() * 2.5 + 0.5,
      speed: Math.random() * 0.25 + 0.05,
      opacity: Math.random() * 0.4 + 0.05,
      gold: Math.random() > 0.6,
    }));

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.gold
          ? `rgba(245,200,66,${p.opacity})`
          : `rgba(200,160,80,${p.opacity * 0.5})`;
        ctx.fill();
        p.y -= p.speed;
        if (p.y < -5) { p.y = canvas.height + 5; p.x = Math.random() * canvas.width; }
      });
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);
  return <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />;
}

// ── FILMSTRIP ─────────────────────────────────────────────────────────────────
function Filmstrip({ position }: { position: 'top' | 'bottom' }) {
  return (
    <div className={`filmstrip ${position}`}>
      {Array.from({ length: Math.ceil(window.innerWidth / 50) + 2 }).map((_, i) => (
        <div key={i} className="filmstrip-hole" />
      ))}
    </div>
  );
}

// ── MAIN APP ──────────────────────────────────────────────────────────────────
type Stage = 'idle' | 'analyzing' | 'ready' | 'processing' | 'success';

export function App() {
  const [stage, setStage] = useState<Stage>('idle');
  const [mode, setMode] = useState<'single' | 'batch'>('single');
  const [url, setUrl] = useState('');
  const [batchText, setBatchText] = useState('');
  const [batchQueue, setBatchQueue] = useState<BatchItem[]>([]);
  const [error, setError] = useState('');
  const [metadata, setMetadata] = useState<MediaMetadata | null>(null);
  const [selectedFormat, setSelectedFormat] = useState<FormatOption | null>(null);
  const [progress, setProgress] = useState(0);
  const [audioError, setAudioError] = useState(false);

  // Format category filter & Modals
  const [formatTab, setFormatTab] = useState<'all' | 'audio' | 'video'>('all');
  const [showQR, setShowQR] = useState(false);
  const [showStudio, setShowStudio] = useState(false);



  const filteredFormats = metadata?.formats.filter(fmt => {
    if (formatTab === 'audio') return fmt.type === 'audio';
    if (formatTab === 'video') return fmt.type === 'video';
    return true;
  }) ?? [];



  // Studio Tools (Clipper & ID3)
  const [clipSettings, setClipSettings] = useState<ClipSettings>({ enabled: false, startTime: 0, endTime: 180 });
  const [id3Tags, setId3Tags] = useState<Id3Tags>({ title: '', artist: '', album: 'NovaFetch Downloads' });

  // Player controls
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const mediaRef = useRef<HTMLAudioElement | HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // PWA & Connectivity state
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const isStandaloneMode = window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    setIsStandalone(isStandaloneMode);

    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setDeferredPrompt(null);
  };

  const previewUrl = metadata
    ? `${getApiBaseUrl()}/stream?url=${encodeURIComponent(metadata.url)}&extension=${selectedFormat?.type === 'video' ? 'mp4' : 'mp3'}&duration=${metadata.duration}${clipSettings.enabled ? `&start=${clipSettings.startTime}&end=${clipSettings.endTime}` : ''}`
    : '';

  // ── Single Analyze ──────────────────────────────────────────────────────────
  const analyze = async () => {
    const trimmed = url.trim();
    if (!trimmed) { setError('Paste a YouTube URL to continue.'); return; }
    setError('');
    setStage('analyzing');
    setMetadata(null);
    setSelectedFormat(null);
    setAudioError(false);
    try {
      const data = await analyzeMediaUrl(trimmed);
      setMetadata(data);
      setSelectedFormat(data.formats[0] ?? null);
      setId3Tags({ title: data.title, artist: data.author, album: 'NovaFetch Studio' });
      setClipSettings({ enabled: false, startTime: 0, endTime: data.duration });
      setStage('ready');
    } catch {
      setError('Could not analyze that URL. Check the link and try again.');
      setStage('idle');
    }
  };

  // ── Batch Analyze ───────────────────────────────────────────────────────────
  const analyzeBatch = async () => {
    const lines = batchText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) { setError('Enter at least one media URL for batch downloading.'); return; }
    setError('');
    const queue: BatchItem[] = lines.map((l, i) => ({ id: `item-${i}-${Date.now()}`, url: l, stage: 'pending' }));
    setBatchQueue(queue);
    setStage('analyzing');

    for (let i = 0; i < queue.length; i++) {
      setBatchQueue(q => q.map((item, idx) => idx === i ? { ...item, stage: 'analyzing' } : item));
      try {
        const meta = await analyzeMediaUrl(queue[i].url);
        setBatchQueue(q => q.map((item, idx) => idx === i ? { ...item, stage: 'ready', metadata: meta, selectedFormat: meta.formats[0] } : item));
      } catch {
        setBatchQueue(q => q.map((item, idx) => idx === i ? { ...item, stage: 'error', error: 'Analysis failed' } : item));
      }
    }
    setStage('ready');
  };

  // ── Single Convert ─────────────────────────────────────────────────────────
  const convert = () => {
    if (!selectedFormat || !metadata) return;
    setStage('processing');
    setProgress(0);

    // SSE connection attempt for real-time progress stream
    try {
      const sse = new EventSource(`${getApiBaseUrl()}/progress`);
      sse.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.progress) setProgress(data.progress);
        if (data.status === 'done') {
          sse.close();
          finishConversion();
        }
      };
      sse.onerror = () => {
        sse.close();
        fallbackProgress();
      };
    } catch {
      fallbackProgress();
    }
  };

  const fallbackProgress = () => {
    const interval = setInterval(() => {
      setProgress(p => {
        if (p >= 92) { clearInterval(interval); return 92; }
        return p + (Math.random() * 8 + 3);
      });
    }, 300);
    setTimeout(() => {
      clearInterval(interval);
      setProgress(100);
      setTimeout(finishConversion, 400);
    }, 3200);
  };

  const finishConversion = () => {
    if (metadata && selectedFormat) {
      saveHistoryItem({
        mediaTitle: id3Tags.title || metadata.title,
        author: id3Tags.artist || metadata.author,
        thumbnail: metadata.thumbnail,
        format: selectedFormat.label,
        quality: selectedFormat.quality,
        extension: selectedFormat.extension,
        fileSizeMB: selectedFormat.estimatedSizeMB,
        downloadUrl: previewUrl,
        duration: metadata.formattedDuration,
        url: metadata.url
      });
    }
    setStage('success');
  };

  // ── Download ───────────────────────────────────────────────────────────────
  const download = () => {
    if (!metadata || !selectedFormat) return;
    const finalTitle = id3Tags.title || metadata.title;
    triggerFileDownload(finalTitle, selectedFormat.extension, metadata.samplePlaybackUrl, metadata.url);
  };

  const reset = () => {
    setStage('idle'); setMetadata(null); setSelectedFormat(null);
    setUrl(''); setError(''); setProgress(0); setAudioError(false);
  };

  const isVideo = selectedFormat?.type === 'video';

  return (
    <>
      <div className="cinema-bg"><CinemaBg /></div>
      <Filmstrip position="top" />
      <Filmstrip position="bottom" />

      <div className="app-shell">
        <main className="main-content">

          {!isOnline && (
            <div className="offline-banner fade-in">
              📡 Offline Mode — App shell active. Connect to internet to fetch media.
            </div>
          )}

          {/* Top Status & Controls Bar */}
          <div className="pwa-top-bar fade-in">
            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
              {isStandalone ? (
                <span className="pwa-badge" style={{ cursor: 'default' }}>✨ Native Shell</span>
              ) : deferredPrompt ? (
                <button className="pwa-badge" onClick={handleInstallClick}>📱 Install App</button>
              ) : (
                <span className="pwa-badge" style={{ cursor: 'default' }}>⚡ PWA Ready</span>
              )}
            </div>

            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', letterSpacing: '0.08em' }}>
                {isOnline ? '🟢 Connected' : '🔴 Offline'}
              </span>
            </div>
          </div>

          {/* ── LOGO ── */}
          {(stage === 'idle' || stage === 'analyzing' || stage === 'ready') && (
            <div className="logo fade-in">
              <div className="logo-title">NOVAFETCH</div>
              <div className="logo-sub">Multi-Platform Cinema Downloader & Studio</div>
            </div>
          )}

          {/* ── URL / BATCH INPUT CARD ── */}
          {(stage === 'idle' || stage === 'analyzing' || stage === 'ready') && (
            <div className="glass glass-3d input-card fade-in">
              <div className="filter-pills" style={{ marginBottom: '0.75rem' }}>
                <button className={`filter-pill ${mode === 'single' ? 'active' : ''}`} onClick={() => setMode('single')}>
                  🎬 Single Track
                </button>
                <button className={`filter-pill ${mode === 'batch' ? 'active' : ''}`} onClick={() => setMode('batch')}>
                  📑 Batch / Playlist Queue
                </button>
              </div>

              {mode === 'single' ? (
                <>
                  <label className="input-label">🎬 Paste YouTube, TikTok, SoundCloud or Reels URL</label>
                  <div className="url-input-row">
                    <input
                      className="url-input"
                      placeholder="https://www.youtube.com/watch?v=..."
                      value={url}
                      onChange={e => { setUrl(e.target.value); setError(''); }}
                      onKeyDown={e => e.key === 'Enter' && analyze()}
                      disabled={stage === 'analyzing'}
                    />
                    <button className="btn-analyze" onClick={analyze} disabled={stage === 'analyzing'}>
                      {stage === 'analyzing' ? <><span className="spinner" />Scanning…</> : 'FETCH'}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <label className="input-label">📑 Enter multiple URLs (one per line)</label>
                  <textarea
                    className="batch-input-area"
                    placeholder="https://www.youtube.com/watch?v=...&#10;https://soundcloud.com/...&#10;https://www.tiktok.com/@..."
                    value={batchText}
                    onChange={e => { setBatchText(e.target.value); setError(''); }}
                  />
                  <button className="btn-analyze" style={{ marginTop: '0.5rem', width: '100%' }} onClick={analyzeBatch} disabled={stage === 'analyzing'}>
                    {stage === 'analyzing' ? 'Scanning Batch…' : '⚡ FETCH BATCH QUEUE'}
                  </button>
                </>
              )}

              {error && <div className="error-msg">⚠ {error}</div>}
            </div>
          )}

          {/* ── BATCH QUEUE LIST ── */}
          {mode === 'batch' && batchQueue.length > 0 && (
            <div className="glass glass-3d format-grid fade-in" style={{ marginTop: '1rem' }}>
              <span className="format-grid-label">📋 Batch Download Queue ({batchQueue.length})</span>
              <div className="batch-list">
                {batchQueue.map(item => (
                  <div key={item.id} className="batch-item-card">
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                      <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {item.metadata?.title || item.url}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }}>
                        Status: {item.stage.toUpperCase()} {item.metadata ? `· ${item.metadata.formattedDuration}` : ''}
                      </div>
                    </div>
                    {item.metadata && (
                      <button className="btn-download btn-sm" onClick={() => triggerFileDownload(item.metadata!.title, 'mp3', item.metadata!.samplePlaybackUrl, item.metadata!.url)}>
                        ⬇ MP3
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── METADATA CARD ── */}
          {stage === 'analyzing' && mode === 'single' && (
            <div className="glass meta-card fade-in">
              <div className="meta-thumb-placeholder">🎞</div>
              <div className="meta-info">
                <div className="skeleton" style={{ height: 14, width: '70%', marginBottom: 8 }} />
                <div className="skeleton" style={{ height: 11, width: '40%', marginBottom: 10 }} />
              </div>
            </div>
          )}

          {stage === 'ready' && metadata && mode === 'single' && (
            <div className="glass meta-card fade-in">
              <img className="meta-thumb" src={metadata.thumbnail} alt={metadata.title} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              <div className="meta-info">
                <div className="meta-title">{metadata.title}</div>
                <div className="meta-author">{metadata.author} · {metadata.formattedDuration}</div>
                <div className="meta-tags">
                  {metadata.tags?.slice(0, 3).map(t => <span key={t} className="meta-tag">{t}</span>)}
                </div>
              </div>
            </div>
          )}

          {/* ── FORMAT SELECTOR & MEDIA STUDIO ── */}
          {stage === 'ready' && metadata && mode === 'single' && (
            <div className="glass glass-3d format-grid fade-in">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span className="format-grid-label">🎭 Select Quality & Format</span>
                <div className="filter-pills">
                  <button className={`filter-pill ${formatTab === 'all' ? 'active' : ''}`} onClick={() => setFormatTab('all')}>
                    All
                  </button>
                  <button className={`filter-pill ${formatTab === 'audio' ? 'active' : ''}`} onClick={() => setFormatTab('audio')}>
                    🎵 Audio
                  </button>
                  <button className={`filter-pill ${formatTab === 'video' ? 'active' : ''}`} onClick={() => setFormatTab('video')}>
                    🎬 Video
                  </button>
                </div>
              </div>

              <div className="formats">
                {filteredFormats.map(fmt => (
                  <button
                    key={fmt.id}
                    className={`format-btn${selectedFormat?.id === fmt.id ? ' selected' : ''}`}
                    onClick={() => setSelectedFormat(fmt)}
                  >
                    <div className="format-btn-label">
                      {fmt.type === 'audio' ? '🎵' : '🎬'} {fmt.quality}
                      {fmt.badge && <span className="format-btn-badge">{fmt.badge}</span>}
                    </div>
                    <div className="format-btn-size">~{fmt.estimatedSizeMB} MB · {fmt.extension.toUpperCase()}</div>
                  </button>
                ))}
              </div>

              {/* Optional Collapsible Studio Tools */}
              <div style={{ marginTop: '0.75rem', textAlign: 'center' }}>
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  style={{ width: '100%', fontSize: '0.75rem', opacity: 0.8 }}
                  onClick={() => setShowStudio(s => !s)}
                >
                  {showStudio ? '▲ Hide Advanced Tools' : '⚙ Advanced Studio Tools (Trimmer & Tags)'}
                </button>
              </div>

              {showStudio && (
                <div className="studio-box fade-in">
                  <div className="studio-title">
                    <span>✂ Timestamp Clipper</span>
                    <label style={{ fontSize: '0.7rem', display: 'flex', gap: '4px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={clipSettings.enabled}
                        onChange={e => setClipSettings(c => ({ ...c, enabled: e.target.checked }))}
                      />
                      Enable Clip
                    </label>
                  </div>
                  {clipSettings.enabled && (
                    <div className="studio-row">
                      <label style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>Start (sec):</label>
                      <input
                        type="number"
                        className="studio-input"
                        value={clipSettings.startTime}
                        onChange={e => setClipSettings(c => ({ ...c, startTime: parseInt(e.target.value, 10) || 0 }))}
                      />
                      <label style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>End (sec):</label>
                      <input
                        type="number"
                        className="studio-input"
                        value={clipSettings.endTime}
                        onChange={e => setClipSettings(c => ({ ...c, endTime: parseInt(e.target.value, 10) || metadata.duration }))}
                      />
                    </div>
                  )}

                  <div className="studio-title" style={{ marginTop: '0.5rem' }}>🏷 ID3 Tag Metadata Editor</div>
                  <div className="studio-row">
                    <input
                      className="studio-input"
                      placeholder="Track Title"
                      value={id3Tags.title}
                      onChange={e => setId3Tags(t => ({ ...t, title: e.target.value }))}
                    />
                    <input
                      className="studio-input"
                      placeholder="Artist Name"
                      value={id3Tags.artist}
                      onChange={e => setId3Tags(t => ({ ...t, artist: e.target.value }))}
                    />
                    <input
                      className="studio-input"
                      placeholder="Album Name"
                      value={id3Tags.album}
                      onChange={e => setId3Tags(t => ({ ...t, album: e.target.value }))}
                    />
                  </div>
                </div>
              )}

              <button className="btn-convert" style={{ marginTop: '1rem' }} onClick={convert}>
                🎬 START CONVERSION
              </button>
            </div>
          )}

          {/* ── PROGRESS SCREEN ── */}
          {stage === 'processing' && (
            <div className="glass glass-3d progress-card fade-in">
              <div className="progress-icon">🎞</div>
              <div className="progress-title">Processing Film Reel…</div>
              <div className="progress-sub">
                Converting to {selectedFormat?.label} — Hold tight, director!
              </div>
              <div className="progress-bar-wrap">
                <div className="progress-bar" style={{ width: `${Math.min(progress, 100)}%` }} />
              </div>
              <div className="progress-pct">{Math.min(Math.round(progress), 100)}%</div>
            </div>
          )}

          {/* ── SUCCESS SCREEN & AUDIO WAVEFORM PLAYER ── */}
          {stage === 'success' && metadata && selectedFormat && (
            <div className="glass glass-3d success-card fade-in">
              <div className="success-header">
                <div className="success-check">✓</div>
                <div>
                  <div className="success-title">Print Ready!</div>
                  <div className="success-sub">Your media has been processed into {selectedFormat.extension.toUpperCase()} format</div>
                </div>
              </div>

              <div className="player-wrap">
                <div className="player-meta">
                  <img className="player-thumb" src={metadata.thumbnail} alt="" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  <div className="player-name">{id3Tags.title || metadata.title}</div>
                  <span className="player-badge">{selectedFormat.quality}</span>
                </div>

                {!isVideo && <WaveformVisualizer isPlaying={isPlaying} />}

                {audioError && metadata.url ? (
                  <iframe
                    src={`https://www.youtube-nocookie.com/embed/${metadata.url.includes('v=') ? metadata.url.split('v=')[1].split('&')[0] : metadata.url.split('/').pop()}?autoplay=1&enablejsapi=1`}
                    title="NovaFetch Stream Player"
                    style={{ width: '100%', height: isVideo ? '260px' : '160px', borderRadius: '12px', border: 'none', marginTop: '12px' }}
                    allow="autoplay; encrypted-media"
                  />
                ) : isVideo ? (
                  <video
                    ref={el => { mediaRef.current = el; }}
                    src={previewUrl}
                    controls
                    preload="metadata"
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    onError={() => setAudioError(true)}
                  />
                ) : (
                  <audio
                    ref={el => { mediaRef.current = el; }}
                    src={previewUrl}
                    controls
                    preload="metadata"
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    onError={() => setAudioError(true)}
                  />
                )}

                <div className="player-controls-row">
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>Speed:</span>
                  <select
                    className="speed-select"
                    value={playbackSpeed}
                    onChange={e => {
                      const spd = parseFloat(e.target.value);
                      setPlaybackSpeed(spd);
                      if (mediaRef.current) mediaRef.current.playbackRate = spd;
                    }}
                  >
                    <option value={0.5}>0.5x</option>
                    <option value={0.75}>0.75x</option>
                    <option value={1.0}>1.0x (Normal)</option>
                    <option value={1.25}>1.25x</option>
                    <option value={1.5}>1.5x</option>
                    <option value={2.0}>2.0x</option>
                  </select>
                  <button className="btn-ghost btn-sm" onClick={() => setShowQR(true)}>
                    📱 Share QR
                  </button>
                </div>
              </div>

              <div className="action-row">
                <button className="btn-download" onClick={download}>
                  ⬇ DOWNLOAD {selectedFormat.extension.toUpperCase()}
                </button>
                <button className="btn-ghost" onClick={() => navigator.clipboard.writeText(metadata.url)}>
                  🔗 Copy URL
                </button>
                <button className="btn-ghost" onClick={reset}>
                  ↩ New
                </button>
              </div>
            </div>
          )}

        </main>
      </div>

      {/* Modals */}
      {showQR && metadata && (
        <QRCodeModal
          url={previewUrl || metadata.url}
          title={id3Tags.title || metadata.title}
          onClose={() => setShowQR(false)}
        />
      )}
    </>
  );
}

export default App;
