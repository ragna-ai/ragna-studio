interface ExtractAgentDocumentJobData {
  documentId: string;
}

const EXTRACT_AGENT_DOCUMENT_JOB = 'extract-agent-document-job';

class ExtractAgentDocumentJobDto {
  documentId: string;

  constructor(data: ExtractAgentDocumentJobData) {
    this.documentId = data.documentId;
  }

  static fromJSON(data: ExtractAgentDocumentJobData): ExtractAgentDocumentJobDto {
    return new ExtractAgentDocumentJobDto({
      documentId: data.documentId,
    });
  }

  toJSON(): ExtractAgentDocumentJobData {
    return {
      documentId: this.documentId,
    };
  }
}

export { ExtractAgentDocumentJobDto, EXTRACT_AGENT_DOCUMENT_JOB };
