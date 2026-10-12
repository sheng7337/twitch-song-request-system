// server/request-guard.js
// Stops other websites from driving this server through the streamer's
// browser. A cross-site request carries a foreign Origin; a DNS-rebinding
// attack arrives with a public domain in Host. IPs, localhost and LAN names
// (no dots, or .local) stay allowed so a two-PC OBS setup keeps working.

const net = require('net');

function isLocalHostname(hostHeader) {
  const name = hostHeader.replace(/:\d+$/, '').replace(/^\[|\]$/g, '').toLowerCase();
  return net.isIP(name) !== 0
    || name === 'localhost' || name.endsWith('.localhost') || name.endsWith('.local')
    || !name.includes('.');
}

function isAllowedRequest(req) {
  const host = req.headers.host;
  if (host && !isLocalHostname(host)) return false;
  const origin = req.headers.origin;
  if (!origin) return true; // non-browser clients (PowerShell, curl) send no Origin
  try { return new URL(origin).host === host; } catch { return false; }
}

module.exports = { isAllowedRequest };
