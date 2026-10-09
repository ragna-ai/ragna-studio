import * as z from 'zod';
import { myzValidator } from '../utils/validator-wrapper';

const primaryId = z.uuidv7();

export const validMemberIdParam = myzValidator('param', z.object({ memberId: primaryId }));

export const validTransferOwnershipBody = myzValidator('json', z.object({ memberId: primaryId }));
