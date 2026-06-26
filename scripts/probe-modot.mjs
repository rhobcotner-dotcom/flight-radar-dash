const urls = [
  'https://sfs01-traveler.modot.mo.gov/rtplive/MODOT_CAM_128/playlist.m3u8',
  'https://sfs02-traveler.modot.mo.gov/rtplive/MODOT_CAM_128/playlist.m3u8',
  'https://sfs03-traveler.modot.mo.gov/rtplive/MODOT_CAM_128/playlist.m3u8',
];

async function probe(u) {
  const t0 = Date.now();
  try {
    const res = await fetch(u, {
      signal: AbortSignal.timeout(12000),
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: '*/*' },
      redirect: 'follow',
    });
    const text = await res.text();
    console.log('OK', res.status, `${Date.now() - t0}ms`, u.split('/')[2], text.slice(0, 100).replace(/\n/g, ' '));
  } catch (e) {
    console.log('FAIL', `${Date.now() - t0}ms`, u.split('/')[2], e.name, e.message?.slice(0, 80));
  }
}

for (const u of urls) await probe(u);
