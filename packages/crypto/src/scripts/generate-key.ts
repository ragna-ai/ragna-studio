import { randomBytes } from 'node:crypto';

console.log(`base64:${randomBytes(32).toString('base64')}`);
