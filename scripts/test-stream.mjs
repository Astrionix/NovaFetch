/**
 * Test all audio extraction strategies against a real video ID.
 * Run: node scripts/test-stream.mjs
 */

const VIDEO_ID = 'dQw4w9WgXcQ'; // Rick Astley
const UA_ANDROID = 'com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip';
const UA_BROWSER = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

function pickBestAudio(formats) {
  const audio = formats.filter(f => f.mimeType?.includes('audio') && f.url);
  if (!audio.length) return null;
  audio.sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));
  return audio.find(f => f.mimeType?.includes('mp4')) ?? audio[0];
}

// ── Strategy 1: InnerTube ANDROID with API key ──────────────────────────────
async function testInnerTubeAndroid() {
  console.log('\n[1] InnerTube ANDROID...');
  const body = {
    videoId: VIDEO_ID,
    context: {
      client: {
        clientName: 'ANDROID',
        clientVersion: '19.09.37',
        androidSdkVersion: 30,
        hl: 'en',
        gl: 'US',
        utcOffsetMinutes: 0,
      },
    },
  };
  const res = await fetch('https://www.youtube.com/youtubei/v1/player?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': UA_ANDROID,
      'X-YouTube-Client-Name': '3',
      'X-YouTube-Client-Version': '19.09.37',
      'Origin': 'https://www.youtube.com',
    },
    body: JSON.stringify(body),
  });
  console.log('  HTTP status:', res.status);
  const data = await res.json();
  console.log('  Playability:', data.playabilityStatus?.status, '|', data.playabilityStatus?.reason ?? '');
  const all = [...(data.streamingData?.adaptiveFormats ?? []), ...(data.streamingData?.formats ?? [])];
  console.log('  Total formats:', all.length, '| Audio formats:', all.filter(f => f.mimeType?.includes('audio')).length);
  const audio = all.filter(f => f.mimeType?.includes('audio'));
  audio.slice(0, 3).forEach(f => console.log('   -', f.mimeType, 'bitrate:', f.bitrate, 'hasUrl:', !!f.url, 'hasCipher:', !!f.signatureCipher));
  const best = pickBestAudio(all);
  console.log('  Best URL:', best?.url ? best.url.slice(0, 80) + '...' : 'NONE');
  return best?.url ?? null;
}

// ── Strategy 2: InnerTube ANDROID without API key ───────────────────────────
async function testInnerTubeAndroidNoKey() {
  console.log('\n[2] InnerTube ANDROID (no API key)...');
  const body = {
    videoId: VIDEO_ID,
    context: {
      client: {
        clientName: 'ANDROID',
        clientVersion: '19.09.37',
        androidSdkVersion: 30,
        hl: 'en', gl: 'US',
      },
    },
  };
  const res = await fetch('https://www.youtube.com/youtubei/v1/player', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': UA_ANDROID },
    body: JSON.stringify(body),
  });
  console.log('  HTTP status:', res.status);
  const data = await res.json();
  console.log('  Playability:', data.playabilityStatus?.status, '|', data.error?.message ?? '');
  const all = [...(data.streamingData?.adaptiveFormats ?? []), ...(data.streamingData?.formats ?? [])];
  const best = pickBestAudio(all);
  console.log('  Best URL:', best?.url ? best.url.slice(0, 80) + '...' : 'NONE');
  return best?.url ?? null;
}

// ── Strategy 3: InnerTube IOS ─────────────────────────────────────────────
async function testInnerTubeIOS() {
  console.log('\n[3] InnerTube IOS...');
  const body = {
    videoId: VIDEO_ID,
    context: {
      client: {
        clientName: 'IOS',
        clientVersion: '19.09.3',
        deviceModel: 'iPhone16,2',
        hl: 'en', gl: 'US',
        osVersion: '17.5.1',
        userAgent: 'com.google.ios.youtube/19.09.3 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X)',
      },
    },
  };
  const res = await fetch('https://www.youtube.com/youtubei/v1/player', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'com.google.ios.youtube/19.09.3 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X)',
      'X-YouTube-Client-Name': '5',
      'X-YouTube-Client-Version': '19.09.3',
    },
    body: JSON.stringify(body),
  });
  console.log('  HTTP status:', res.status);
  const data = await res.json();
  console.log('  Playability:', data.playabilityStatus?.status, '|', data.error?.message ?? '');
  const all = [...(data.streamingData?.adaptiveFormats ?? []), ...(data.streamingData?.formats ?? [])];
  const best = pickBestAudio(all);
  console.log('  Best URL:', best?.url ? best.url.slice(0, 80) + '...' : 'NONE');
  return best?.url ?? null;
}

// ── Strategy 4: Piped API ─────────────────────────────────────────────────
async function testPiped() {
  const apis = [
    'https://pipedapi.kavin.rocks',
    'https://piped-api.garudalinux.org',
    'https://api.piped.projectsegfau.lt',
    'https://pipedapi.adminforge.de',
  ];
  console.log('\n[4] Piped APIs...');
  for (const api of apis) {
    try {
      const res = await fetch(`${api}/streams/${VIDEO_ID}`, {
        headers: { 'User-Agent': UA_BROWSER },
        signal: AbortSignal.timeout(6000),
      });
      console.log(`  ${api}: HTTP ${res.status}`);
      if (!res.ok) continue;
      const data = await res.json();
      const streams = data.audioStreams ?? [];
      streams.sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));
      const mp4 = streams.find(s => s.mimeType?.includes('mp4'));
      const best = mp4 ?? streams[0];
      if (best?.url) {
        console.log('  ✓ Got audio from', api, '| URL:', best.url.slice(0, 80) + '...');
        return best.url;
      }
    } catch (e) {
      console.log(`  ${api}: ERROR - ${e.message}`);
    }
  }
  return null;
}

// ── Strategy 5: Page scrape ytInitialPlayerResponse ─────────────────────────
async function testPageScrape() {
  console.log('\n[5] Page scrape...');
  const res = await fetch(`https://www.youtube.com/watch?v=${VIDEO_ID}`, {
    headers: { 'User-Agent': UA_BROWSER, 'Accept-Language': 'en-US,en;q=0.9', 'Cookie': 'CONSENT=YES+1' },
  });
  const html = await res.text();
  console.log('  Page fetched, length:', html.length);

  // Try multiple regex patterns
  const patterns = [
    /ytInitialPlayerResponse\s*=\s*(\{.+?\});\s*(?:var |const |let |if |<\/script)/s,
    /ytInitialPlayerResponse\s*=\s*(\{[\s\S]*?\});/,
  ];

  for (const pat of patterns) {
    const m = html.match(pat);
    if (m) {
      try {
        const player = JSON.parse(m[1]);
        const all = [...(player.streamingData?.adaptiveFormats ?? []), ...(player.streamingData?.formats ?? [])];
        console.log('  Found', all.length, 'formats, audio:', all.filter(f => f.mimeType?.includes('audio')).length);
        all.filter(f => f.mimeType?.includes('audio')).slice(0, 3).forEach(f =>
          console.log('   -', f.mimeType, 'hasUrl:', !!f.url, 'hasCipher:', !!f.signatureCipher));
        const best = pickBestAudio(all);
        console.log('  Best URL:', best?.url ? best.url.slice(0, 80) + '...' : 'NONE (all ciphered?)');
        return best?.url ?? null;
      } catch (e) {
        console.log('  Parse error:', e.message);
      }
    }
  }
  console.log('  ytInitialPlayerResponse NOT FOUND in page');
  return null;
}

// ── Run all ─────────────────────────────────────────────────────────────────
(async () => {
  console.log(`\n=== Testing audio extraction for videoId: ${VIDEO_ID} ===`);
  const results = {};
  results.android = await testInnerTubeAndroid().catch(e => { console.error(e.message); return null; });
  results.androidNoKey = await testInnerTubeAndroidNoKey().catch(e => { console.error(e.message); return null; });
  results.ios = await testInnerTubeIOS().catch(e => { console.error(e.message); return null; });
  results.piped = await testPiped().catch(e => { console.error(e.message); return null; });
  results.scrape = await testPageScrape().catch(e => { console.error(e.message); return null; });

  console.log('\n=== SUMMARY ===');
  for (const [k, v] of Object.entries(results)) {
    console.log(`  ${k}: ${v ? '✓ URL found' : '✗ FAILED'}`);
  }
})();
