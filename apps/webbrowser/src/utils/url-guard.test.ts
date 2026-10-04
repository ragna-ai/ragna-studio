import { describe, expect, test } from 'bun:test';
import { assertPublicUrl, isPublicIp, isPublicUrl, type HostResolver } from './url-guard';

const resolveTo =
  (...addresses: string[]): HostResolver =>
  async () =>
    addresses.map((address) => ({ address }));

const failingResolver: HostResolver = async () => {
  throw new Error('ENOTFOUND');
};

describe('isPublicIp', () => {
  test.each(['8.8.8.8', '1.1.1.1', '93.184.216.34', '172.32.0.1', '2606:4700:4700::1111'])(
    'allows %s',
    (ip) => expect(isPublicIp(ip)).toBe(true),
  );

  test.each([
    '0.0.0.0',
    '0.1.2.3',
    '10.0.0.1',
    '10.255.255.255',
    '100.64.0.1',
    '100.127.255.255',
    '127.0.0.1',
    '127.255.255.254',
    '169.254.169.254',
    '172.16.0.1',
    '172.31.255.255',
    '192.0.0.1',
    '192.0.2.1',
    '192.168.1.1',
    '198.18.0.1',
    '198.19.255.255',
    '198.51.100.1',
    '203.0.113.1',
    '224.0.0.1',
    '239.255.255.255',
    '240.0.0.1',
    '255.255.255.255',
  ])('blocks IPv4 %s', (ip) => expect(isPublicIp(ip)).toBe(false));

  test.each([
    '::',
    '::1',
    'fc00::1',
    'fd12:3456::1',
    'fe80::1',
    'febf::1',
    'ff02::1',
    '2001:db8::1',
    '64:ff9b::808:808',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '::ffff:10.0.0.1',
    '::ffff:a9fe:a9fe',
  ])('blocks IPv6 %s', (ip) => expect(isPublicIp(ip)).toBe(false));

  test('rejects strings that are not IPs', () => {
    expect(isPublicIp('example.com')).toBe(false);
  });
});

describe('assertPublicUrl', () => {
  test('allows http and https URLs on public hosts', async () => {
    const resolve = resolveTo('93.184.216.34');
    await expect(assertPublicUrl('https://example.com/a?b=1', resolve)).resolves.toBeUndefined();
    await expect(assertPublicUrl('http://example.com', resolve)).resolves.toBeUndefined();
  });

  test('allows public IP literals without a lookup', async () => {
    await expect(assertPublicUrl('https://8.8.8.8/', failingResolver)).resolves.toBeUndefined();
    await expect(
      assertPublicUrl('https://[2606:4700:4700::1111]/', failingResolver),
    ).resolves.toBeUndefined();
  });

  test.each([
    'http://127.0.0.1/',
    'http://10.0.0.5:8080/x',
    'http://169.254.169.254/latest/meta-data/',
    'http://192.168.0.1/',
    'http://[::1]/',
    'http://[::1]:3010/health',
    'http://[fd00::1]/',
    'http://[fe80::1]/',
    'http://[::ffff:127.0.0.1]/',
    'http://[::ffff:10.0.0.1]/',
    'http://2130706433/', // decimal form of 127.0.0.1, normalised by URL
    'http://0x7f.0.0.1/',
    'http://0/',
  ])('blocks IP literal %s', async (url) => {
    await expect(assertPublicUrl(url, failingResolver)).rejects.toThrow('URL is not allowed');
  });

  test.each([
    'file:///etc/passwd',
    'ftp://example.com/',
    'data:text/html,hi',
    'javascript:alert(1)',
    'ws://example.com/',
    'about:blank',
    'not a url',
    '',
  ])('blocks %p', async (url) => {
    await expect(assertPublicUrl(url, resolveTo('93.184.216.34'))).rejects.toThrow(
      'URL is not allowed',
    );
  });

  test('blocks a hostname that resolves to a private address', async () => {
    await expect(
      assertPublicUrl('https://internal.example/', resolveTo('10.1.2.3')),
    ).rejects.toThrow('URL is not allowed');
    await expect(assertPublicUrl('https://localhost/', resolveTo('::1'))).rejects.toThrow(
      'URL is not allowed',
    );
  });

  test('blocks when any resolved address is private', async () => {
    const resolve = resolveTo('93.184.216.34', '127.0.0.1');
    await expect(assertPublicUrl('https://mixed.example/', resolve)).rejects.toThrow(
      'URL is not allowed',
    );
  });

  test('blocks when the lookup fails or returns nothing', async () => {
    await expect(assertPublicUrl('https://nx.example/', failingResolver)).rejects.toThrow(
      'URL is not allowed',
    );
    await expect(assertPublicUrl('https://empty.example/', resolveTo())).rejects.toThrow(
      'URL is not allowed',
    );
  });

  test('passes the bare hostname to the resolver', async () => {
    const seen: string[] = [];
    const resolve: HostResolver = async (hostname) => {
      seen.push(hostname);
      return [{ address: '93.184.216.34' }];
    };
    await assertPublicUrl('https://example.com./path', resolve);
    expect(seen).toEqual(['example.com']);
  });
});

describe('isPublicUrl', () => {
  test('returns booleans instead of throwing', async () => {
    expect(await isPublicUrl('https://example.com/', resolveTo('93.184.216.34'))).toBe(true);
    expect(await isPublicUrl('http://127.0.0.1/')).toBe(false);
  });
});
