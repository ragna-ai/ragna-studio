import { generateImagesSchema } from '@repo/ai';
import { myzValidator } from '../utils/validator-wrapper';
import { paginationSchema } from './pagination.schema';

export const validGenerateImagesBody = myzValidator('json', generateImagesSchema);

export const validGenImageListQuery = myzValidator('query', paginationSchema);
