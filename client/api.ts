export async function api<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch('/api' + path, {
      credentials: 'same-origin',
      ...options,
      headers:
        options.body === undefined || options.body instanceof FormData
          ? options.headers
          : { 'Content-Type': 'application/json', ...options.headers },
    });
  } catch {
    throw new Error('تعذر الاتصال بالخادم. أعد المحاولة بعد التحقق من الاتصال.');
  }
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error?.message ?? 'تعذر الاتصال بالخادم');
  }
  return response.json();
}
export const post = <T = any>(path: string, body?: unknown) =>
  api<T>(path, { method: 'POST', ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
export async function download(job: string, format: string, dialect: string) {
  const response = await fetch(`/api/jobs/${job}/download?format=${format}&dialect=${dialect}`);
  if (!response.ok) {
    const e = await response.json();
    throw Error(e.error?.message ?? 'تعذر التنزيل');
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download =
    response.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] ?? 'rasd-export';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
