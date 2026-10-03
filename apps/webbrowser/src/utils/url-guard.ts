import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

// Address ranges that must never be fetched on behalf of a caller.
const blockedRanges = new BlockList();

const BLOCKED_IPV4: ReadonlyArray<readonly [string, number]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4], // includes 255.255.255.255
];

const BLOCKED_IPV6: ReadonlyArray<readonly [string, number]> = [
  ['::', 96], // unspecified, loopback and deprecated IPv4-compatible
  ['64:ff9b::', 96], // NAT64
  ['64:ff9b:1::', 48], // local-use NAT64
  ['100::', 64], // discard-only
  ['2001::', 32], // Teredo
  ['2001:db8::', 32], // documentation
  ['2002::', 16], // 6to4
  ['fc00::', 7], // unique local
  ['fe80::', 10], // link-local
  ['ff00::', 8], // multicast
];

// IPv4-mapped IPv6 (::ffff:0:0/96) is kept in its own list. Node and Bun both
// compare plain IPv4 addresses as mapped IPv6, so adding this range to the
// main list would block every IPv4 address. It is only checked for IPv6 input.
const mappedRange = new BlockList();
mappedRange.addSubnet('::ffff:0:0', 96, 'ipv6');

for (const [address, prefix] of BLOCKED_IPV4) {
  blockedRanges.addSubnet(address, prefix, 'ipv4');
}
for (const [address, prefix] of BLOCKED_IPV6) {
  blockedRanges.addSubnet(address, prefix, 'ipv6');
}

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

export class UrlNotAllowedError extends Error {
  constructor() {
    super('URL is not allowed');
    this.name = 'UrlNotAllowedError';
  }
}

export type HostResolver = (hostname: string) => Promise<Array<{ address: string }>>;

const defaultResolver: HostResolver = (hostname) => lookup(hostname, { all: true });

export function isPublicIp(address: string): boolean {
  const family = isIP(address);
  if (family === 0) {
    return false;
  }
  if (family === 4) {
    return !blockedRanges.check(address, 'ipv4');
  }
  // Mapped addresses are blocked as a whole, whatever IPv4 they embed.
  return !blockedRanges.check(address, 'ipv6') && !mappedRange.check(address, 'ipv6');
}

// Throws UrlNotAllowedError unless the URL is http(s) and every address its
// host resolves to is public. IP literals are checked without a DNS lookup.
export async function assertPublicUrl(
  rawUrl: string,
  resolve: HostResolver = defaultResolver,
): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new UrlNotAllowedError();
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new UrlNotAllowedError();
  }

  // URL.hostname keeps the brackets around IPv6 literals; a trailing dot
  // marks a fully qualified name and is not part of the address.
  const hostname = parsed.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!hostname) {
    throw new UrlNotAllowedError();
  }

  if (isIP(hostname) !== 0) {
    if (!isPublicIp(hostname)) {
      throw new UrlNotAllowedError();
    }
    return;
  }

  let addresses: Array<{ address: string }>;
  try {
    addresses = await resolve(hostname);
  } catch {
    throw new UrlNotAllowedError();
  }

  if (addresses.length === 0 || !addresses.every(({ address }) => isPublicIp(address))) {
    throw new UrlNotAllowedError();
  }
}

export async function isPublicUrl(rawUrl: string, resolve?: HostResolver): Promise<boolean> {
  try {
    await assertPublicUrl(rawUrl, resolve);
    return true;
  } catch {
    return false;
  }
}
