export type QgridUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
};

export type QgridBase = {
  usage: QgridUsage;
  durationMs: number;
  costUsd: number;
};

export type QgridTextResponse = QgridBase & { text: string };
export type QgridJsonResponse<T> = QgridBase & { json: T };
