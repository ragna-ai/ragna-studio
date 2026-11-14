// Container entry for the Nitro bun preset. Bun as PID 1 ignores SIGTERM
// without a handler, and the preset registers none, so stops would wait
// for the kill timeout.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.once(signal, () => process.exit(0));
}

await import('./server/index.mjs');
