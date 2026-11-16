// The main process's page downloader refuses anything that isn't a public https address (see src/main/fetchText.ts).
// These tests use only addresses that are refused before any request is made, so they never touch the network.
import { checkAddress, fetchText, isPublicAddress } from '../src/main/fetchText.js';

describe('isPublicAddress', () => {
  it.each(['8.8.8.8', '151.101.1.1', '2606:4700:4700::1111', '::ffff:8.8.8.8'])('accepts %s', (address) => {
    expect(isPublicAddress(address)).toBe(true);
  });

  it.each([
    '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255',
    '::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1', '::ffff:7f00:1', '::ffff:a00:1', '64:ff9b::7f00:1',
  ])('refuses %s', (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it('refuses things that are not addresses at all', () => {
    expect(isPublicAddress('example.org')).toBe(false);
    expect(isPublicAddress('')).toBe(false);
  });
});

describe('checkAddress', () => {
  it('accepts an ordinary https address', () => {
    expect(checkAddress('https://example.org/page?x=1').hostname).toBe('example.org');
  });

  it.each([
    ['http://example.org/', /https/],
    ['file:///etc/passwd', /https/],
    ['ftp://example.org/', /https/],
    ['not a url', /web address/],
    ['https://user:secret@example.org/', /user name/],
    ['https://example.org:8443/', /port/],
    ['https://127.0.0.1/', /public internet/],
    ['https://[::1]/', /public internet/],
    ['https://192.168.0.10/admin', /public internet/],
    ['https://169.254.169.254/latest/meta-data/', /public internet/],
  ])('refuses %s', (address, reason) => {
    expect(() => checkAddress(address)).toThrow(reason);
  });
});

describe('fetchText', () => {
  it('refuses an unsafe address without making a request', async () => {
    await expect(fetchText('http://example.org/')).rejects.toThrow(/https/);
    await expect(fetchText('https://10.0.0.1/')).rejects.toThrow(/public internet/);
  });

  it('refuses a host name that points at this machine (checked when connecting)', async () => {
    await expect(fetchText('https://localhost/')).rejects.toThrow(/public internet/);
  });
});
