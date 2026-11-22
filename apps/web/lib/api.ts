import { markSessionExpired, readSession, readSnapshot, saveSession, saveSnapshot, type OfflineSession } from "./offline";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

export class ApiError extends Error {
  constructor(message: string, readonly status?: number, readonly offline = false) {
    super(message);
    this.name = "ApiError";
  }
}

let offlineUserId: string | null = null;

export function setOfflineUser(id: string | null) {
  offlineUserId = id;
}

// A cached session survives an expired cookie; the flag only pauses syncing until a new login.
export function resolveCachedSession(session: OfflineSession | null, unauthorized: boolean): OfflineSession | null {
  if (!session) return null;
  return { user: session.user, expired: session.expired || unauthorized };
}

export function isOfflineError(error: unknown) {
  return error instanceof ApiError && error.offline;
}

export async function checkHealth() {
  try {
    const response = await fetch(`${API}/health`, { cache: "no-store" });
    return response.ok;
  } catch {
    return false;
  }
}

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const method = (options?.method ?? "GET").toUpperCase();
  const isRead = method === "GET";
  try {
    const response = await fetch(`${API}${path}`, {
      credentials: "include",
      headers: { "Content-Type": "application/json", ...options?.headers },
      ...options,
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const message = Array.isArray(body.message) ? body.message.join(" ") : body.message;
      throw new ApiError(message ?? "Error de comunicación.", response.status);
    }
    const data = (await response.json()) as T;
    if (isRead) {
      if (path === "/auth/me") {
        await saveSession(data as unknown as { id: string; name: string; role: string });
        setOfflineUser((data as unknown as { id: string }).id);
        return { ...(data as object), sessionExpired: false } as T;
      } else if (offlineUserId) {
        await saveSnapshot(offlineUserId, path, data);
      }
    }
    return data;
  } catch (error) {
    const status = error instanceof ApiError ? error.status : undefined;
    const unauthorized = status === 401;
    const unreachable = !(error instanceof ApiError);
    // Reads fall back to the last snapshot while offline or after the session expired.
    if (isRead && (unreachable || unauthorized)) {
      if (path === "/auth/me") {
        const session = resolveCachedSession(await readSession(), unauthorized);
        if (session) {
          if (unauthorized) await markSessionExpired();
          setOfflineUser(session.user.id);
          return { ...session.user, sessionExpired: session.expired } as T;
        }
      } else if (offlineUserId) {
        const cached = await readSnapshot(offlineUserId, path);
        if (cached !== undefined) {
          if (unauthorized) await markSessionExpired();
          return cached as T;
        }
      }
    }
    if (error instanceof ApiError) throw error;
    throw new ApiError(error instanceof Error ? error.message : "Sin conexión.", undefined, true);
  }
}
