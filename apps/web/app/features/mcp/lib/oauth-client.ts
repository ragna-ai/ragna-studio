/** CIMD client ids are HTTPS URLs to the client's metadata document; show only the host. */
export function clientHost(clientId: string): string {
  try {
    return new URL(clientId).host;
  } catch {
    return clientId;
  }
}
