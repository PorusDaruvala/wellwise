// Live conditions for "Near you today": Open-Meteo weather and air quality, and a place name.
// Coordinates are rounded to about 10 km before they are used or stored.
const E = require('../src/engine.js');
const { getJSON } = require('./net.js');

const round = x => Math.round(+x * 10) / 10;

async function conditions(db, lat, lon) {
  lat = round(lat); lon = round(lon);
  if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new Error('Bad location');
  const key = `live:${lat},${lon}`, cached = db.cacheGet(key);
  if (cached) return cached;
  const [wx, aq, place] = await Promise.allSettled([
    getJSON(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,apparent_temperature_max,uv_index_max,precipitation_sum&current=relative_humidity_2m,temperature_2m&timezone=auto&forecast_days=1`),
    getJSON(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi,pm2_5,grass_pollen,birch_pollen,ragweed_pollen&timezone=auto`),
    getJSON(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`),
  ]);
  const w = wx.status === 'fulfilled' ? wx.value : null, a = aq.status === 'fulfilled' ? aq.value : null, p = place.status === 'fulfilled' ? place.value : null;
  if (!w && !a) throw new Error('Live weather is not available right now');
  const pollen = a?.current ? Math.max(a.current.grass_pollen || 0, a.current.birch_pollen || 0, a.current.ragweed_pollen || 0) : null;
  const reading = {
    tempMax: w?.daily?.temperature_2m_max?.[0] ?? null, apparentMax: w?.daily?.apparent_temperature_max?.[0] ?? null,
    uvMax: w?.daily?.uv_index_max?.[0] ?? null, precip: w?.daily?.precipitation_sum?.[0] ?? null,
    humidity: w?.current?.relative_humidity_2m ?? null, temp: w?.current?.temperature_2m ?? null,
    aqi: a?.current?.us_aqi ?? null, pm25: a?.current?.pm2_5 ?? null, pollen: pollen || null,
  };
  const country = p?.countryCode || null;
  const region = country === 'IN' ? 'IN' : country === 'GB' ? 'GB' : country === 'US' ? 'US' : country ? 'OTHER' : E.regionFromTimezone(w?.timezone || a?.timezone);
  const out = {
    at: Date.now(), lat, lon, place: p ? [p.city || p.locality, p.principalSubdivision].filter(Boolean).join(', ') || p.countryName : null,
    region, timezone: w?.timezone || a?.timezone || null, reading, moments: E.liveMoments(reading),
    sources: ['Open-Meteo', ...(p ? ['BigDataCloud'] : [])],
  };
  db.cacheSet(key, out, 30 * 60e3);
  return out;
}

module.exports = { conditions, round };
