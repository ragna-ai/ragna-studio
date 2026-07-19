import { userUpdateSchema } from '@repo/database';
import { myzValidator } from '../utils/validator-wrapper';

export const validUpdateUserProfileBody = myzValidator('json', userUpdateSchema);
