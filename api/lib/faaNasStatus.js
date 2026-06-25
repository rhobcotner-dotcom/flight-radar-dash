const NAS_URL = 'https://nasstatus.faa.gov/api/airport-status-information';
const USER_AGENT = 'flight-radar-dash/1.0 (personal home dashboard)';
const CACHE_MS = 2 * 60 * 1000;
const STL_AIRPORTS = ['STL', 'SUS', 'CPS', 'BLV', 'UIN'];

let cache = { fetchedAt: 0, data: null };

function extractAirportBlocks(xml, airport) {
  const blocks = [];
  const re = new RegExp(`<Airport>[\\s\\S]*?<ARPT>${airport}</ARPT>[\\s\\S]*?</Airport>`, 'gi');
  let match;
  while ((match = re.exec(xml))) {
    blocks.push(match[0]);
  }
  return blocks;
}

function tagValue(block, tag) {
  const match = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i'));
  return match ? match[1].trim() : null;
}

export async function fetchFaaNasStatus() {
  if (cache.data && Date.now() - cache.fetchedAt < CACHE_MS) {
    return cache.data;
  }

  const res = await fetch(NAS_URL, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/xml,text/xml' },
  });
  if (!res.ok) throw new Error(`FAA NAS status unavailable (${res.status})`);

  const xml = await res.text();
  const updateMatch = xml.match(/<Update_Time>([\s\S]*?)<\/Update_Time>/i);
  const updateTime = updateMatch ? updateMatch[1].trim() : null;

  const airports = STL_AIRPORTS.map((code) => {
    const blocks = extractAirportBlocks(xml, code);
    const delays = blocks.map((block) => ({
      type: tagValue(block, 'Reason') || tagValue(block, 'Type') || 'Delay',
      reason: tagValue(block, 'Reason') || tagValue(block, 'MinDelay') || 'See FAA NAS',
      minDelay: tagValue(block, 'MinDelay'),
      maxDelay: tagValue(block, 'MaxDelay'),
      trend: tagValue(block, 'Trend'),
    }));
    return {
      code,
      active: delays.length > 0,
      delays,
    };
  }).filter((row) => row.active);

  const payload = {
    source: 'nasstatus.faa.gov',
    fetchedAt: new Date().toISOString(),
    updateTime,
    count: airports.length,
    airports,
    summary:
      airports.length > 0
        ? `${airports.map((a) => a.code).join(', ')} reporting NAS delays/programs.`
        : 'No active FAA ground delay/stop programs for STL-area airports.',
  };

  cache = { fetchedAt: Date.now(), data: payload };
  return payload;
}
