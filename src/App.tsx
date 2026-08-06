import { useState, useEffect, useRef } from 'react';
import type { MediaMetadata, FormatOption } from './types';
import { analyzeMediaUrl, triggerFileDownload, getApiBaseUrl } from './lib/mediaEngine';
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

    // Dust/bokeh particles
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
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [metadata, setMetadata] = useState<MediaMetadata | null>(null);
  const [selectedFormat, setSelectedFormat] = useState<FormatOption | null>(null);
  const [progress, setProgress] = useState(0);

  // PWA & Connectivity state
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    // Detect standalone PWA mode
    const isStandaloneMode = window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    setIsStandalone(isStandaloneMode);

    // Listen for PWA install prompt
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    // Connectivity listeners
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
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  // Stream URL for the preview player
  const previewUrl = metadata
    ? `${getApiBaseUrl()}/stream?url=${encodeURIComponent(metadata.url)}&extension=${selectedFormat?.type === 'video' ? 'mp4' : 'mp3'}&duration=${metadata.duration}`
    : '';

  // ── Analyze ────────────────────────────────────────────────────────────────
  const analyze = async () => {
    const trimmed = url.trim();
    if (!trimmed) { setError('Paste a YouTube URL to continue.'); return; }
    setError('');
    setStage('analyzing');
    setMetadata(null);
    setSelectedFormat(null);
    try {
      const data = await analyzeMediaUrl(trimmed);
      setMetadata(data);
      setSelectedFormat(data.formats[0] ?? null);
      setStage('ready');
    } catch {
      setError('Could not analyze that URL. Check the link and try again.');
      setStage('idle');
    }
  };

  // ── Convert ────────────────────────────────────────────────────────────────
  const convert = () => {
    if (!selectedFormat) return;
    setStage('processing');
    setProgress(0);
    // Simulate progress while yt-dlp pre-warms in background
    const interval = setInterval(() => {
      setProgress(p => {
        if (p >= 92) { clearInterval(interval); return 92; }
        return p + (Math.random() * 8 + 3);
      });
    }, 300);
    setTimeout(() => {
      clearInterval(interval);
      setProgress(100);
      setTimeout(() => setStage('success'), 400);
    }, 3500);
  };

  // ── Download ───────────────────────────────────────────────────────────────
  const download = () => {
    if (!metadata || !selectedFormat) return;
    triggerFileDownload(metadata.title, selectedFormat.extension, metadata.samplePlaybackUrl, metadata.url);
  };

  // ── Reset ──────────────────────────────────────────────────────────────────
  const reset = () => {
    setStage('idle'); setMetadata(null); setSelectedFormat(null);
    setUrl(''); setError(''); setProgress(0);
  };

  const isVideo = selectedFormat?.type === 'video';

  return (
    <>
      {/* Cinema background */}
      <div className="cinema-bg"><CinemaBg /></div>
      <Filmstrip position="top" />
      <Filmstrip position="bottom" />

      <div className="app-shell">
        <main className="main-content">

          {/* Offline Warning Banner */}
          {!isOnline && (
            <div className="offline-banner fade-in">
              📡 Offline Mode — App shell active. Connect to internet to fetch media.
            </div>
          )}

          {/* Top Status / PWA Badge Bar */}
          <div className="pwa-top-bar fade-in">
            {isStandalone ? (
              <span className="pwa-badge" style={{ cursor: 'default' }}>
                ✨ Native Shell Active
              </span>
            ) : deferredPrompt ? (
              <button className="pwa-badge" onClick={handleInstallClick}>
                📱 Install App
              </button>
            ) : (
              <span className="pwa-badge" style={{ cursor: 'default' }}>
                ⚡ PWA Ready
              </span>
            )}
            <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', letterSpacing: '0.08em' }}>
              {isOnline ? '🟢 Connected' : '🔴 Offline'}
            </span>
          </div>

          {/* ── LOGO ── */}
          {(stage === 'idle' || stage === 'analyzing' || stage === 'ready') && (
            <div className="logo fade-in">
              <div className="logo-title">NOVAFETCH</div>
              <div className="logo-sub">Cinema · Media · Downloader</div>
            </div>
          )}

          {/* ── URL INPUT CARD ── */}
          {(stage === 'idle' || stage === 'analyzing' || stage === 'ready') && (
            <div className="glass glass-3d input-card fade-in">
              <label className="input-label">🎬 Paste a YouTube URL</label>
              <div className="url-input-row">
                <input
                  className="url-input"
                  placeholder="https://www.youtube.com/watch?v=..."
                  value={url}
                  onChange={e => { setUrl(e.target.value); setError(''); }}
                  onKeyDown={e => e.key === 'Enter' && analyze()}
                  disabled={stage === 'analyzing'}
                />
                <button
                  className="btn-analyze"
                  onClick={analyze}
                  disabled={stage === 'analyzing'}
                >
                  {stage === 'analyzing' ? <><span className="spinner" />Scanning…</> : 'FETCH'}
                </button>
              </div>
              {error && <div className="error-msg">⚠ {error}</div>}
            </div>
          )}

          {/* ── METADATA CARD ── */}
          {stage === 'analyzing' && (
            <div className="glass meta-card fade-in">
              <div className="meta-thumb-placeholder">🎞</div>
              <div className="meta-info">
                <div className="skeleton" style={{ height: 14, width: '70%', marginBottom: 8 }} />
                <div className="skeleton" style={{ height: 11, width: '40%', marginBottom: 10 }} />
                <div style={{ display: 'flex', gap: 6 }}>
                  <div className="skeleton" style={{ height: 20, width: 60, borderRadius: 99 }} />
                  <div className="skeleton" style={{ height: 20, width: 50, borderRadius: 99 }} />
                </div>
              </div>
            </div>
          )}

          {stage === 'ready' && metadata && (
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

          {/* ── FORMAT SELECTOR ── */}
          {stage === 'ready' && metadata && (
            <div className="glass glass-3d format-grid fade-in">
              <span className="format-grid-label">🎭 Select Format</span>
              <div className="formats">
                {metadata.formats.map(fmt => (
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
              <button className="btn-convert" onClick={convert}>
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

          {/* ── SUCCESS SCREEN ── */}
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
                  <div className="player-name">{metadata.title}</div>
                  <span className="player-badge">{selectedFormat.quality}</span>
                </div>
                {isVideo
                  ? <video src={previewUrl} controls preload="metadata" />
                  : <audio src={previewUrl} controls preload="metadata" />
                }
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
    </>
  );
}

export default App;
