// NOAA General Solar Position Calculations, fractional-year approximation.
// Azimuth: clockwise from true north. Elevation: geometric solar center.
// https://gml.noaa.gov/grad/solcalc/solareqns.PDF
const rad = Math.PI / 180;
const clamp = value => Math.max(-1, Math.min(1, value));
const wrap = (value, period) => ((value % period) + period) % period;
export const LOCATION = { latitude: -16.6052679, longitude: -49.2657852, timeZone: 'America/Sao_Paulo' };
const calendarCache = new Map();

export function brazilDate() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: LOCATION.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function calendar(date) {
  if (calendarCache.has(date)) return calendarCache.get(date);
  const [year, month, day] = date.split('-').map(Number);
  const dayOfYear = (Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 0)) / 86400000;
  const days = (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86400000;
  const offsetText = new Intl.DateTimeFormat('en-US', { timeZone: LOCATION.timeZone, timeZoneName: 'longOffset' }).formatToParts(new Date(Date.UTC(year, month - 1, day, 15))).find(p => p.type === 'timeZoneName')?.value || 'GMT-03:00';
  const offset = offsetText.match(/GMT([+-])(\d{2}):(\d{2})/);
  const zone = offset ? (offset[1] === '-' ? -1 : 1) * (Number(offset[2]) + Number(offset[3]) / 60) : -3;
  const value = { dayOfYear, days, zone };
  if (calendarCache.size >= 32) calendarCache.delete(calendarCache.keys().next().value);
  calendarCache.set(date, value);
  return value;
}
function coefficients(date, minutes) {
  const { dayOfYear, days, zone } = calendar(date);
  const gamma = 2 * Math.PI / days * (dayOfYear - 1 + (minutes / 60 - 12) / 24);
  const equation = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma) - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma));
  const declination = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma) - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma) - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);
  return { equation, declination, zone };
}
export function solarPosition(date, minutes) {
  const { equation, declination, zone } = coefficients(date, minutes);
  const lat = LOCATION.latitude * rad;
  const solarMinutes = wrap(minutes + equation + 4 * LOCATION.longitude - 60 * zone, 1440);
  const hourAngle = (solarMinutes / 4 - 180) * rad;
  const elevation = Math.asin(clamp(Math.sin(lat) * Math.sin(declination) + Math.cos(lat) * Math.cos(declination) * Math.cos(hourAngle))) / rad;
  const azimuth = wrap(Math.atan2(Math.sin(hourAngle), Math.cos(hourAngle) * Math.sin(lat) - Math.tan(declination) * Math.cos(lat)) / rad + 180, 360);
  return { elevation, azimuth };
}
export function daylight(date) {
  const { equation, declination, zone } = coefficients(date, 720), lat = LOCATION.latitude * rad;
  const cosine = Math.cos(90.833 * rad) / (Math.cos(lat) * Math.cos(declination)) - Math.tan(lat) * Math.tan(declination);
  const noon = 720 - 4 * LOCATION.longitude - equation + 60 * zone;
  const hour = Math.acos(clamp(cosine)) / rad * 4;
  return { sunrise: noon - hour, sunset: noon + hour, noon };
}
export function clock(minutes) {
  const value = Math.max(0, Math.min(1439, Math.round(minutes)));
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}
export function directionName(azimuth) {
  return ['Norte', 'Nordeste', 'Leste', 'Sudeste', 'Sul', 'Sudoeste', 'Oeste', 'Noroeste'][Math.round(azimuth / 45) % 8];
}
