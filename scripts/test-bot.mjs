async function testBot() {
  const uas = [
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Twitterbot/1.0',
    'facebookexternalhit/1.1'
  ];
  for (const ua of uas) {
    try {
      const r = await fetch('https://www.youtube.com/watch?v=CHpq1tGoSEI', {
        headers: {
          'User-Agent': ua,
          'Accept-Language': 'en-US,en;q=0.9'
        }
      });
      const html = await r.text();
      const lengthMatch = html.match(/"lengthSeconds":"(\d+)"/);
      const approxMatch = html.match(/"approxDurationMs":"(\d+)"/);
      const ptMatch = html.match(/itemprop="duration" content="PT([^"]+)"/);
      console.log(ua.slice(0, 20), '=> status:', r.status);
      console.log('  lengthSeconds:', lengthMatch?.[1]);
      console.log('  approxDurationMs:', approxMatch?.[1]);
      console.log('  ptMatch:', ptMatch?.[1]);
    } catch (e) {
      console.error(e);
    }
  }
}
testBot();
