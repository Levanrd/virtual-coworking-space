import { isIP } from 'node:net';

export function privateIPv4(address) {
  if (isIP(address) !== 4) return false;
  const [a, b] = address.split('.').map(Number);
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

export function lanCandidates(interfaces) {
  return Object.entries(interfaces).flatMap(([name, entries]) => {
    if (/virtual|vEthernet|WSL|docker|loopback|tailscale|vpn|vmware|vbox|hyper-v/i.test(name)) return [];
    return (entries || []).filter(entry => !entry.internal && privateIPv4(entry.address))
      .map(entry => ({ name, address: entry.address }));
  });
}

export function selectLanAddress(interfaces, requested) {
  // Explicit overrides must still belong to this host; never bind a public address.
  const all = Object.values(interfaces).flat().filter(Boolean);
  if (requested) {
    if (!privateIPv4(requested) || !all.some(entry => !entry.internal && entry.address === requested))
      throw new Error('--ip must be a private IPv4 address currently assigned to this computer.');
    return requested;
  }
  const candidates = lanCandidates(interfaces);
  const wifi = candidates.filter(entry => /wi-?fi|wireless|wlan/i.test(entry.name));
  const preferred = wifi.length ? wifi : candidates;
  if (preferred.length !== 1) throw new Error(`Choose your network: npm run lan:up -- --ip YOUR_WIFI_IP\n${candidates.map(entry => `  ${entry.name}: ${entry.address}`).join('\n') || 'No active private IPv4 interface found.'}`);
  return preferred[0].address;
}
