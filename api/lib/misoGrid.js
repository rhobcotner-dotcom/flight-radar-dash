const FUEL_MIX = 'https://public-api.misoenergy.org/api/FuelMix';
const EX_ANTE_LMP = 'https://public-api.misoenergy.org/api/MarketPricing/GetExAnteLmp';
const USER_AGENT = 'flight-radar-dash/1.0 (personal home dashboard)';
const CACHE_MS = 60 * 1000;

let cache = { fetchedAt: 0, data: null };

export async function fetchMisoGrid() {
  if (cache.data && Date.now() - cache.fetchedAt < CACHE_MS) {
    return cache.data;
  }

  const [fuelRes, lmpRes] = await Promise.all([
    fetch(FUEL_MIX, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } }),
    fetch(EX_ANTE_LMP, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } }),
  ]);

  if (!fuelRes.ok) throw new Error(`MISO fuel mix unavailable (${fuelRes.status})`);

  const fuelBody = await fuelRes.json();
  const fuels = (fuelBody?.Fuel?.Type || [])
    .map((row) => ({
      category: row.CATEGORY,
      mw: Number(row.ACT) || 0,
    }))
    .filter((row) => row.mw > 0)
    .sort((a, b) => b.mw - a.mw);

  let hubLmp = null;
  if (lmpRes.ok) {
    const lmpBody = await lmpRes.json();
    const hubs = lmpBody?.LMPData?.ExAnteLMP?.Hub || [];
    const illinois = hubs.find((row) => String(row.name || '').includes('ILLINOIS'));
    if (illinois) {
      hubLmp = Number(illinois.LMP) || null;
    }
  }

  const totalMw = Number(fuelBody?.TotalMW) || fuels.reduce((sum, row) => sum + row.mw, 0);
  const coalPct = fuels.find((f) => f.category === 'Coal')?.mw || 0;
  const gasPct = fuels.find((f) => f.category === 'Natural Gas')?.mw || 0;
  const windPct = fuels.find((f) => f.category === 'Wind')?.mw || 0;
  const nuclearPct = fuels.find((f) => f.category === 'Nuclear')?.mw || 0;
  const carbonIntensity =
    totalMw > 0
      ? Math.round(((coalPct * 0.95 + gasPct * 0.45 + nuclearPct * 0.05) / totalMw) * 100)
      : null;

  const payload = {
    source: 'public-api.misoenergy.org',
    fetchedAt: new Date().toISOString(),
    interval: fuelBody?.RefId || null,
    totalMw,
    fuels,
    hubLmp,
    hubName: 'ILLINOIS.HUB',
    carbonIntensityScore: carbonIntensity,
    carbonLabel:
      carbonIntensity == null
        ? 'Unknown'
        : carbonIntensity >= 70
          ? 'Coal-heavy grid'
          : carbonIntensity >= 45
            ? 'Mixed grid'
            : 'Cleaner mix today',
  };

  cache = { fetchedAt: Date.now(), data: payload };
  return payload;
}
