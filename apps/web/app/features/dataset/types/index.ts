export type DatasetColumnType = 'text' | 'number' | 'date' | 'select';

export interface DatasetColumn {
  id: string;
  name: string;
  type: DatasetColumnType;
  // Only meaningful for type 'select'.
  options?: string[];
}

// 'user' = created in the grid, 'agent' = created via the datasetCreate tool.
export type DatasetOrigin = 'user' | 'agent';

// Keyed by column id, not name.
export type DatasetRowData = Record<string, string | number | null>;

export interface Dataset {
  id: string;
  userId: string;
  workspaceId: string;
  name: string;
  description?: string | null;
  origin: DatasetOrigin;
  columns: DatasetColumn[];
  createdAt: string;
  updatedAt: string;
}

export type DatasetListItem = Dataset & { rowCount: number };

export interface DatasetResponse {
  dataset: Dataset;
}

export interface DatasetManyResponse {
  datasets: DatasetListItem[];
  meta: {
    totalCount: number;
  };
}

export interface DatasetRow {
  id: string;
  datasetId: string;
  data: DatasetRowData;
  createdAt: string;
  updatedAt: string;
}

export interface DatasetRowManyResponse {
  rows: DatasetRow[];
}

export interface DatasetRowResponse {
  row: DatasetRow;
}

export type CreateDatasetRequest = {
  name: string;
  description?: string;
  columns?: DatasetColumn[];
};

export type UpdateDatasetRequest = {
  datasetId: string;
  name?: string;
  description?: string | null;
  columns?: DatasetColumn[];
};

export type DatasetExportFormat = 'csv' | 'xlsx' | 'pdf' | 'md';

// `afterRowId` omitted or null moves the row to the top.
export type MoveDatasetRowRequest = {
  rowId: string;
  afterRowId?: string | null;
};
