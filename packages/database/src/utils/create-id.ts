import { v7 as uuidv7 } from 'uuid';

export function createId(): string {
  return uuidv7();
}
