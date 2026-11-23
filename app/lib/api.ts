export async function responseError(response: Response): Promise<Error> {
  const body = await response.json().catch(() => null);
  return new Error(body?.message || body?.statusMessage || `请求失败（HTTP ${response.status}）`);
}
export async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, { credentials: 'same-origin', ...options });
  if (!response.ok) throw await responseError(response);
  return response.status === 204 ? undefined as T : response.json();
}
