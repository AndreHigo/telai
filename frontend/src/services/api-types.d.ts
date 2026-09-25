export type ApiErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "too_many_requests"
  | "server_error"
  | "http_error";

export interface ApiError extends Error {
  status: number;
  code: ApiErrorCode | string;
  retryAfter: number;
}

export interface ApiRequestOptions extends RequestInit {
  signal?: AbortSignal;
}

export interface ApiClientOptions {
  reportError?: (kind: "api_error", error: Error, context: { method: string; route: string }) => void;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface ApiClient {
  <T = unknown>(path: string, options?: ApiRequestOptions): Promise<T>;
}

export function createApiClient(options?: ApiClientOptions): ApiClient;
