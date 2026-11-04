export interface DriveFileResource {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  webViewLink?: string;
}

export interface DriveFileListResource {
  files?: DriveFileResource[];
  nextPageToken?: string;
}
