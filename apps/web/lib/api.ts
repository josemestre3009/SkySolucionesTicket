const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';
export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, { credentials: 'include', headers: { 'Content-Type': 'application/json', ...options?.headers }, ...options });
  if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.message ?? 'Error de comunicación.'); }
  return response.json();
}
