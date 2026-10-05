import cfg from '../config.js';

// Standard WMO weather interpretation codes, as used by Open-Meteo.
export const WMO = {
  0: 'clear sky', 1: 'mainly clear', 2: 'partly cloudy', 3: 'overcast', 45: 'fog', 48: 'rime fog',
  51: 'light drizzle', 53: 'drizzle', 55: 'heavy drizzle', 56: 'freezing drizzle', 57: 'heavy freezing drizzle',
  61: 'light rain', 63: 'rain', 65: 'heavy rain', 66: 'freezing rain', 67: 'heavy freezing rain',
  71: 'light snow', 73: 'snow', 75: 'heavy snow', 77: 'snow grains',
  80: 'rain showers', 81: 'heavy showers', 82: 'violent showers', 85: 'snow showers', 86: 'heavy snow showers',
  95: 'thunderstorm', 96: 'thunderstorm with hail', 99: 'severe thunderstorm with hail',
};

export function savedLocation() {
  if (cfg.location) return cfg.location;
  try { return JSON.parse(localStorage.getItem('loc') || 'null'); } catch { return null; }
}

export function askLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('geolocation is not available in this browser'));
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const loc = { lat: +p.coords.latitude.toFixed(2), lon: +p.coords.longitude.toFixed(2), label: '' };
        try { localStorage.setItem('loc', JSON.stringify(loc)); } catch {}
        resolve(loc);
      },
      (e) => reject(new Error(e.message || 'location permission denied')),
      { timeout: 10000, maximumAge: 3600_000 },
    );
  });
}

export async function fetchWeather(loc) {
  const u = new URL('https://api.open-meteo.com/v1/forecast');
  u.search = new URLSearchParams({
    latitude: loc.lat, longitude: loc.lon, current: 'temperature_2m,weather_code',
    temperature_unit: 'fahrenheit', timezone: 'auto',
  });
  const r = await fetch(u);
  if (!r.ok) throw new Error(`weather service answered ${r.status}`);
  const j = await r.json();
  const c = j.current;
  return { temp: Math.round(c.temperature_2m), desc: WMO[c.weather_code] ?? `code ${c.weather_code}` };
}

// Approximate moon phase from the mean synodic month (accurate to about a day).
export function moonPhase(date = new Date()) {
  const synodic = 29.530588853;
  const knownNew = Date.UTC(2000, 0, 6, 18, 14);
  const age = (((date.getTime() - knownNew) / 86400000) % synodic + synodic) % synodic;
  const names = ['new moon', 'waxing crescent', 'first quarter', 'waxing gibbous', 'full moon', 'waning gibbous', 'last quarter', 'waning crescent'];
  const glyphs = ['\u{1F311}', '\u{1F312}', '\u{1F313}', '\u{1F314}', '\u{1F315}', '\u{1F316}', '\u{1F317}', '\u{1F318}'];
  const i = Math.floor(((age / synodic) * 8 + 0.5) % 8);
  return { age: age.toFixed(1), name: names[i], glyph: glyphs[i], lit: Math.round((1 - Math.cos((2 * Math.PI * age) / synodic)) * 50) };
}
