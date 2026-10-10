/** The slice of a BullMQ `Job` that processors read, so tests can pass a plain object. */
export interface ProcessorJob {
  id?: string;
  name: string;
  data: unknown;
  opts: { attempts?: number };
  attemptsMade: number;
}

export interface ProcessorSuccess {
  success: true;
}
