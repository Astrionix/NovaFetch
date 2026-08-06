import type { ConversionHistoryItem } from '../types';

const STORAGE_KEY = 'novafetch_history_v1';

export function getHistory(): ConversionHistoryItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveHistoryItem(item: Omit<ConversionHistoryItem, 'id' | 'timestamp'>) {
  try {
    const existing = getHistory();
    const newItem: ConversionHistoryItem = {
      ...item,
      id: 'hist-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      timestamp: Date.now(),
    };
    const updated = [newItem, ...existing.filter(i => i.mediaTitle !== item.mediaTitle)].slice(0, 50);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // quota exceeded or blocked
  }
}
