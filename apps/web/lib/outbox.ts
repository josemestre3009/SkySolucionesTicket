import type { OutboxOperation } from "./offline";

export type OutboxFailure = { offline?: boolean; status?: number };
export type OutboxDecision = "pause" | "continue";

// Offline, auth and transient server errors must keep the queue order intact; validation and
// conflict errors are terminal for their own operation only.
export function classifyOutboxFailure(failure: OutboxFailure): OutboxDecision {
  if (failure.offline) return "pause";
  const status = failure.status;
  if (status === undefined) return "pause";
  if (status === 401 || status === 408 || status === 429 || status >= 500) return "pause";
  return "continue";
}

export function summarizeOutbox(operations: OutboxOperation[]) {
  const blocked = operations.filter((operation) => operation.status === "blocked");
  return {
    pending: operations.length,
    blocked: blocked.length,
    lastError: blocked.length ? blocked[blocked.length - 1].lastError ?? "Error de sincronización." : null,
  };
}
