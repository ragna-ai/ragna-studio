/** Maps an http(s) URL to its ws(s) counterpart. */
export function toWebSocketUrl(httpUrl: string): URL {
  const url = new URL(httpUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url;
}
