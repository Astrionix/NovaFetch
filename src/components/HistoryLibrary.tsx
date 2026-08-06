import { useState, useEffect } from 'react';
import type { ConversionHistoryItem } from '../types';
import { getHistory } from '../lib/history';

interface HistoryLibraryProps {
  onSelectTrack: (url: string) => void;
  onClose: () => void;
}

const STORAGE_KEY = 'novafetch_history_v1';


export function HistoryLibrary({ onSelectTrack, onClose }: HistoryLibraryProps) {
  const [items, setItems] = useState<ConversionHistoryItem[]>([]);
  const [search, setSearch] = useState('');
  const [filterFormat, setFilterFormat] = useState<'all' | 'audio' | 'video'>('all');

  useEffect(() => {
    setItems(getHistory());
  }, []);

  const clearHistory = () => {
    localStorage.removeItem(STORAGE_KEY);
    setItems([]);
  };

  const exportM3u = () => {
    if (items.length === 0) return;
    let m3u = '#EXTM3U\n';
    items.forEach(item => {
      m3u += `#EXTINF:-1,${item.author} - ${item.mediaTitle}\n${item.downloadUrl || item.url || ''}\n`;
    });
    const blob = new Blob([m3u], { type: 'audio/x-mpegurl' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'NovaFetch_Playlist.m3u';
    a.click();
    URL.revokeObjectURL(url);
  };

  const filtered = items.filter(item => {
    const matchSearch = item.mediaTitle.toLowerCase().includes(search.toLowerCase()) ||
                        item.author.toLowerCase().includes(search.toLowerCase());
    const isAudio = item.extension === 'mp3' || item.extension === 'wav' || item.extension === 'm4a';
    const matchFilter = filterFormat === 'all' || (filterFormat === 'audio' ? isAudio : !isAudio);
    return matchSearch && matchFilter;
  });

  return (
    <div className="modal-backdrop fade-in" onClick={onClose}>
      <div className="glass glass-3d history-card" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>✕</button>

        <div className="history-header">
          <h3 className="modal-title">📚 Conversion Library</h3>
          <div className="history-controls">
            <button className="btn-ghost btn-sm" onClick={exportM3u} disabled={items.length === 0}>
              🎵 Export M3U
            </button>
            <button className="btn-ghost btn-sm" onClick={clearHistory} disabled={items.length === 0}>
              🗑 Clear
            </button>
          </div>
        </div>

        <div className="history-search-row">
          <input
            className="history-search-input"
            placeholder="Search saved tracks…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <div className="filter-pills">
            <button
              className={`filter-pill ${filterFormat === 'all' ? 'active' : ''}`}
              onClick={() => setFilterFormat('all')}
            >
              All
            </button>
            <button
              className={`filter-pill ${filterFormat === 'audio' ? 'active' : ''}`}
              onClick={() => setFilterFormat('audio')}
            >
              🎵 Audio
            </button>
            <button
              className={`filter-pill ${filterFormat === 'video' ? 'active' : ''}`}
              onClick={() => setFilterFormat('video')}
            >
              🎬 Video
            </button>
          </div>
        </div>

        <div className="history-list">
          {filtered.length === 0 ? (
            <div className="empty-history">
              {items.length === 0 ? 'No downloads saved yet. Convert tracks to build your library!' : 'No matching tracks found.'}
            </div>
          ) : (
            filtered.map(item => (
              <div key={item.id} className="history-item-row">
                <img src={item.thumbnail} alt="" className="history-item-thumb" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                <div className="history-item-info">
                  <div className="history-item-title">{item.mediaTitle}</div>
                  <div className="history-item-sub">
                    {item.author} · {item.quality} ({item.extension.toUpperCase()})
                  </div>
                </div>
                <button
                  className="btn-analyze btn-sm"
                  onClick={() => {
                    if (item.url) onSelectTrack(item.url);
                    onClose();
                  }}
                >
                  ⚡ Fetch Again
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default HistoryLibrary;
