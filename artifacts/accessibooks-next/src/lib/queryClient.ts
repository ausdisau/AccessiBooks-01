import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { clearAuthToken, getAuthToken, setAuthToken } from "./authToken";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

function buildAuthHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { ...(extra ?? {}) };
  const token = getAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

/**
 * Some endpoints (login / register) return a fresh JWT alongside the user
 * payload. Capture it transparently so callers don't have to remember to
 * persist it themselves. Other endpoints can opt in by returning { token }.
 *
 * The response body is read via .clone() so the caller still gets a usable
 * Response object.
 */
async function captureTokenFromResponse(res: Response): Promise<void> {
  if (!res.ok) return;
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return;
  try {
    const body = await res.clone().json();
    const token = body && typeof body === "object" ? (body as { token?: unknown }).token : null;
    if (typeof token === "string" && token.length > 0) {
      setAuthToken(token);
    }
  } catch {
    /* non-JSON or unreadable — ignore */
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const baseHeaders: Record<string, string> = data
    ? { "Content-Type": "application/json" }
    : {};
  const res = await fetch(url, {
    method,
    headers: buildAuthHeaders(baseHeaders),
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  await captureTokenFromResponse(res);
  // /api/logout endpoints clear server-side session; also drop the local JWT
  // so the next request is fully unauthenticated.
  if (res.ok && /\/api(\/auth)?\/logout/i.test(url)) {
    clearAuthToken();
  }
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      headers: buildAuthHeaders(),
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
