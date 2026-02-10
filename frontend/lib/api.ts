export const BACKEND_URL = "http://localhost:4000";

export type ApiError = { status: number; message: string };

async function parseResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let data: T;
  try {
    data = text ? (JSON.parse(text) as T) : ({} as T);
  } catch {
    data = {} as T;
  }
  if (!res.ok) {
    const message =
      (data as { error?: string })?.error ?? res.statusText ?? "Request failed";
    throw { status: res.status, message } as ApiError;
  }
  return data;
}

/**
 * Ops fetch: reads localStorage ops_jwt, adds Authorization header.
 * Throws { status, message } on non-2xx.
 */
export async function opsFetch<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  const jwt =
    typeof window !== "undefined" ? localStorage.getItem("ops_jwt") : null;
  if (!jwt) {
    throw { status: 401, message: "Not authenticated" } as ApiError;
  }
  const { method = "GET", body } = options;
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
    },
    ...(body !== undefined && body !== null && { body: JSON.stringify(body) }),
  });
  return parseResponse<T>(res);
}

/**
 * Talent fetch: appends token to URL (or preserves existing query).
 * Throws { status, message } on non-2xx.
 */
export async function talentFetch<T = unknown>(
  path: string,
  token: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  const sep = path.includes("?") ? "&" : "?";
  const url = `${BACKEND_URL}${path}${sep}token=${encodeURIComponent(token)}`;
  const { method = "GET", body } = options;
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body !== undefined && body !== null && { body: JSON.stringify(body) }),
  });
  return parseResponse<T>(res);
}
