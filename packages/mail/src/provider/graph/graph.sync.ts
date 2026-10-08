import type { GraphDeltaMessage } from './graph.types';

// Non-removed entries already carry full metadata; `removed` ones need a live GET, done in graph.provider.ts instead.

export type GraphAggregatedChange =
  | { type: 'upserted'; message: GraphDeltaMessage }
  | { type: 'removed'; messageId: string };

export function aggregateDeltaPage(
  page: GraphDeltaMessage[],
  changes: Map<string, GraphAggregatedChange>,
): void {
  for (const item of page) {
    if (!item.id) continue;
    changes.set(
      item.id,
      item['@removed']
        ? { type: 'removed', messageId: item.id }
        : { type: 'upserted', message: item },
    );
  }
}
