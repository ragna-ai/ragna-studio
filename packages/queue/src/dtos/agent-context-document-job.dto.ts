interface ExtractAgentContextDocumentJobData {
  documentId: string;
}

const EXTRACT_AGENT_CONTEXT_DOCUMENT_JOB = 'extract-agent-context-document-job';

class ExtractAgentContextDocumentJobDto {
  documentId: string;

  constructor(data: ExtractAgentContextDocumentJobData) {
    this.documentId = data.documentId;
  }

  static fromJSON(data: ExtractAgentContextDocumentJobData): ExtractAgentContextDocumentJobDto {
    return new ExtractAgentContextDocumentJobDto({
      documentId: data.documentId,
    });
  }

  toJSON(): ExtractAgentContextDocumentJobData {
    return {
      documentId: this.documentId,
    };
  }
}

export { ExtractAgentContextDocumentJobDto, EXTRACT_AGENT_CONTEXT_DOCUMENT_JOB };
