export type DataRow = Record<string, any>;

export type ColumnType = "string" | "number" | "date" | "boolean" | "unknown";

export type AuditEntry = {
  step: string;
  detail?: string;
  changedCells?: number;
  affectedRows?: number;
  notes?: string[];
};

export type ValidationIssue = {
  rowIndex: number; // 0-based in data (not counting header)
  column: string;
  rule: string;
  value: any;
  message: string;
};

export type ChangeLogEntry = {
  rowIndex: number;
  column: string;
  rule: string;
  before: any;
  after: any;
  message?: string;
};

export type PipelineRecipe = {
  version: string;
  createdAt: string;
  inferredTypes: Record<string, ColumnType>;
  steps: Array<{ id: string; params?: Record<string, any> }>;
};

export type CleanResult = {
  columns: string[];
  rows: DataRow[];
  inferredTypes: Record<string, ColumnType>;
  audit: AuditEntry[];
  changeLog: ChangeLogEntry[];
  issues: ValidationIssue[];
};
