import { FOREIGN_REFERENCE_RESOURCE_LABEL, getForeignReferenceResource } from '@repo/database';
import type { ToolFailure } from './tool-definition';

/**
 * Runs a write that references other rows by id. A reference outside the workspace becomes a
 * `not_found` failure. Any other error is rethrown for the runner to log.
 */
export async function failOnForeignReference<Result>(
  run: () => Promise<Result>,
): Promise<Result | ToolFailure<'not_found'>> {
  try {
    return await run();
  } catch (error) {
    const foreignResource = getForeignReferenceResource(error);
    if (foreignResource === null) {
      throw error;
    }
    return {
      status: 'not_found',
      message: `${FOREIGN_REFERENCE_RESOURCE_LABEL[foreignResource]} not found.`,
    };
  }
}
