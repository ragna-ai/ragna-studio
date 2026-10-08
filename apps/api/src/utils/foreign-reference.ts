import { FOREIGN_REFERENCE_RESOURCE_LABEL, getForeignReferenceResource } from '@repo/database';
import { NotFoundException } from '../exceptions';

/** Turns a rejected cross-workspace reference into a 404; other errors pass through. */
export function throwIfForeignReference(error: unknown): void {
  const resource = getForeignReferenceResource(error);
  if (resource === null) {
    return;
  }
  throw new NotFoundException(`${FOREIGN_REFERENCE_RESOURCE_LABEL[resource]} not found`);
}
