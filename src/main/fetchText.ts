// Downloads a web page or text file for the readings feature. Runs in the main process, because the page itself may
// only talk to the sites listed in its Content-Security-Policy.
//
// The address comes from a markdown file someone wrote (or a search result), so it is treated as untrusted
// (OWASP "server-side request forgery"):
//   - https only, on the standard port, with no user name or password in the address;
//   - the address is looked up here and refused if it points at the user's own machine or network (loopback,
//     private, link-local...). The check runs at the moment of connecting, so a site can't answer one thing when
//     checked and another when used; every redirect is checked the same way, and there are at most 3;
//   - text only, at most MAX_BYTES (more is cut off, not an error), and 15 seconds at most.
import * as dns from 'node:dns';
import * as https from 'node:https';
import * as net from 'node:net';

const MAX_BYTES = 1_000_000;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 15_000;
const TEXT_TYPES = /^(text\/|application\/(xhtml\+xml|json))/i;

/** Addresses that are not on the public internet. */
const NOT_PUBLIC = new net.BlockList();
for (const [network, bits] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 3], // 224 and up: multicast, reserved
] as const) NOT_PUBLIC.addSubnet(network, bits, 'ipv4');
for (const [network, bits] of [
  ['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8], ['64:ff9b::', 96], // the last: IPv4 reached through NAT64
] as const) NOT_PUBLIC.addSubnet(network, bits, 'ipv6');

/** "::ffff:127.0.0.1" and "::ffff:7f00:1" are IPv4 addresses written inside an IPv6 one: judge the IPv4 address. */
function unwrapMappedIpv4(address: string): string {
  const dotted = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(address);
  if (dotted) return dotted[1] ?? address;
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(address);
  if (!hex) return address;
  const [high, low] = [parseInt(hex[1] ?? '0', 16), parseInt(hex[2] ?? '0', 16)];
  return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`;
}

export const isPublicAddress = (address: string): boolean => {
  const plain = unwrapMappedIpv4(address);
  const family = net.isIP(plain);
  return family !== 0 && !NOT_PUBLIC.check(plain, family === 4 ? 'ipv4' : 'ipv6');
};

/** Looks a host name up like the system does, but fails if any address it gives is not public. */
const publicOnlyLookup = ((hostname: string, options: dns.LookupOptions, callback: (...args: unknown[]) => void): void => {
  dns.lookup(hostname, { family: options.family, hints: options.hints, all: true }, (error, addresses) => {
    if (error) { callback(error); return; }
    if (!addresses.length || !addresses.every((entry) => isPublicAddress(entry.address))) {
      callback(new Error('That address is not on the public internet.'));
      return;
    }
    if (options.all) callback(null, addresses);
    else callback(null, addresses[0]?.address, addresses[0]?.family);
  });
}) as unknown as net.LookupFunction;

export interface FetchedText {
  text: string;
  /** The address finally reached, after any redirects. */
  url: string;
}

/** Throws unless `address` is one this app is willing to download from. */
export function checkAddress(address: string): URL {
  if (!URL.canParse(address)) throw new Error('That is not a web address.');
  const url = new URL(address);
  if (url.protocol !== 'https:') throw new Error('Only https:// addresses can be used.');
  if (url.username || url.password) throw new Error('Addresses with a user name or password are not allowed.');
  if (url.port && url.port !== '443') throw new Error('Only the standard port can be used.');
  const host = url.hostname.replace(/^\[|\]$/g, ''); // an IPv6 address is written in brackets
  if (net.isIP(host) !== 0 && !isPublicAddress(host)) throw new Error('That address is not on the public internet.');
  return url;
}

/** One request, no redirects followed. Resolves to the response (already limited) and its body so far. */
function getOnce(url: URL): Promise<{ status: number; location: string; contentType: string; body: string }> {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      lookup: publicOnlyLookup,
      headers: { 'User-Agent': 'art-history-study-buddy/1.0', Accept: 'text/html,text/plain,application/json;q=0.9' },
      timeout: TIMEOUT_MS,
    }, (response) => {
      const status = response.statusCode ?? 0;
      const location = response.headers.location ?? '';
      const contentType = response.headers['content-type'] ?? '';
      if ((status >= 300 && status < 400) || status >= 400 || !TEXT_TYPES.test(contentType)) {
        response.resume();
        resolve({ status, location, contentType, body: '' });
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      response.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
        size += chunk.length;
        if (size >= MAX_BYTES) response.destroy(); // enough: keep what has arrived
      });
      const finish = (): void => { resolve({ status, location, contentType, body: Buffer.concat(chunks).toString('utf8').slice(0, MAX_BYTES) }); };
      response.on('end', finish);
      response.on('close', finish);
      response.on('error', finish);
    });
    request.on('timeout', () => { request.destroy(new Error('The site took too long to answer.')); });
    request.on('error', reject);
  });
}

/** Downloads the text of `address`. Throws a message fit to show the user. */
export async function fetchText(address: string): Promise<FetchedText> {
  let url = checkAddress(address);
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    const { status, location, contentType, body } = await getOnce(url);
    if (status >= 300 && status < 400 && location) {
      url = checkAddress(new URL(location, url).href);
      continue;
    }
    if (status < 200 || status >= 300) throw new Error(`The site answered with an error (HTTP ${status}).`);
    if (!TEXT_TYPES.test(contentType)) throw new Error('That address is not a web page or text file.');
    return { text: body, url: url.href };
  }
  throw new Error('Too many redirects.');
}
