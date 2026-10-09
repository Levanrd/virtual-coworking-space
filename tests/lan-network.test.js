import test from 'node:test';
import assert from 'node:assert/strict';
import { privateIPv4, selectLanAddress } from '../scripts/lan-network.mjs';

const entry = address => [{ address, family: 'IPv4', internal: false }];
test('LAN sharing accepts only private IPv4 addresses', () => {
  for (const address of ['10.0.0.5', '172.16.0.2', '172.31.255.254', '192.168.254.104']) assert.equal(privateIPv4(address), true);
  for (const address of ['127.0.0.1', '0.0.0.0', '172.32.0.1', '8.8.8.8', '169.254.1.2', '::1', '192.168.0.999', '192.168.0.2\nOTHER=value']) assert.equal(privateIPv4(address), false);
});
test('LAN selection prefers Wi-Fi and ignores virtual adapters', () => {
  assert.equal(selectLanAddress({ Ethernet: entry('10.0.0.2'), 'Wi-Fi': entry('192.168.1.5'), 'VirtualBox Host-Only': entry('192.168.56.1'), 'vEthernet (WSL)': entry('172.27.0.1') }), '192.168.1.5');
  assert.equal(selectLanAddress({ Ethernet: entry('10.0.0.2'), 'vEthernet (WSL)': entry('172.27.0.1') }), '10.0.0.2');
});
test('LAN selection refuses ambiguous, unavailable or public overrides', () => {
  const interfaces = { Ethernet: entry('10.0.0.2'), Ethernet2: entry('192.168.1.5') };
  assert.throws(() => selectLanAddress(interfaces), /Choose your network/);
  assert.throws(() => selectLanAddress({}), /No active/);
  assert.throws(() => selectLanAddress(interfaces, '192.168.1.9'), /currently assigned/);
  assert.throws(() => selectLanAddress({ WAN: entry('8.8.8.8') }, '8.8.8.8'), /private IPv4/);
  assert.equal(selectLanAddress(interfaces, '192.168.1.5'), '192.168.1.5');
});
