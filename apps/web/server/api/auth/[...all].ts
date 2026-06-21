import { auth } from '@repo/auth/server';

export default defineEventHandler((event) => {
  return auth.handler(toWebRequest(event));
});
