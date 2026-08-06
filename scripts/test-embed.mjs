async function testEmbed() {
  const r = await fetch('https://www.youtube-nocookie.com/embed/CHpq1tGoSEI', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9'
    }
  });
  const html = await r.text();
  console.log('Embed status:', r.status);
  const m1 = html.match(/"lengthSeconds":"(\d+)"/);
  const m2 = html.match(/"approxDurationMs":"(\d+)"/);
  const m3 = html.match(/"duration":\s*"PT([^"]+)"/);
  console.log('m1 lengthSeconds:', m1?.[1]);
  console.log('m2 approxDurationMs:', m2?.[1]);
  console.log('m3 duration PT:', m3?.[1]);
}
testEmbed();
