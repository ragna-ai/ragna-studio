interface GenVideoJobData {
  genVideoId: string;
}

const GEN_VIDEO_JOB = 'gen-video-job';

class GenVideoJobDto {
  genVideoId: string;

  constructor(data: GenVideoJobData) {
    this.genVideoId = data.genVideoId;
  }

  static fromJSON(data: GenVideoJobData): GenVideoJobDto {
    return new GenVideoJobDto({
      genVideoId: data.genVideoId,
    });
  }

  toJSON(): GenVideoJobData {
    return {
      genVideoId: this.genVideoId,
    };
  }
}

export { GEN_VIDEO_JOB, GenVideoJobDto };
