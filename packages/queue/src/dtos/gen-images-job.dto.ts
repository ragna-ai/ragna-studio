// Id-list payload (docs/imagegen/worker-execution-prd.md decision 3): a
// gen-images job carries only the ids of the pending rows the request side
// already inserted. Every typed field (prompt, settings, provider/model,
// reference images) lives on those rows, so the worker reads them back off
// the DB instead of the job payload round-tripping them through Redis as
// widened strings. This is the whole point of the pending-row model
// videogen already ships: the row is both the typed payload carrier and the
// result channel.
interface GenImagesJobData {
  genImageIds: string[];
}

const GEN_IMAGES_JOB = 'gen-images-job';

class GenImagesJobDto {
  genImageIds: string[];

  constructor(data: GenImagesJobData) {
    this.genImageIds = data.genImageIds;
  }

  static fromJSON(data: GenImagesJobData): GenImagesJobDto {
    return new GenImagesJobDto({
      genImageIds: data.genImageIds,
    });
  }

  toJSON(): GenImagesJobData {
    return {
      genImageIds: this.genImageIds,
    };
  }
}

export { GEN_IMAGES_JOB, GenImagesJobDto };
export type { GenImagesJobData };
