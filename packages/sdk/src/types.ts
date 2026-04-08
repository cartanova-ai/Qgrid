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

export type QgridResponse = QgridBase & { data: string };
export type QgridTypedResponse<T> = QgridBase & { data: T };
