async function test() {
  const r = await fetch('https://www.youtube.com/watch?v=CHpq1tGoSEI');
  const html = await r.text();
  let sec = 0;
  const m1 = html.match(/"lengthSeconds":"(\d+)"/);
  const m2 = html.match(/"approxDurationMs":"(\d+)"/);
  if (m1) sec = parseInt(m1[1], 10);
  else if (m2) sec = Math.round(parseInt(m2[1], 10) / 1000);
  console.log('Extracted sec:', sec, 'Formatted:', `${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}`);
}
test();
