const configuredApiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').trim();

export const apiBaseUrl = configuredApiBaseUrl.replace(/\/+$/, '');

export const apiUrl = (path: string) => {
  if (/^https?:\/\//i.test(path)) return path;

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${apiBaseUrl}${normalizedPath}`;
};
