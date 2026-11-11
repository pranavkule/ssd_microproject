export function getJwtTestVerdict(status, hasToken, authRequired) {
  if (status === 401) return { label: 'Authentication failed (401)', success: false };
  if (status === 403) return { label: 'Authenticated, but role authorization failed (403)', success: false };
  if (status >= 200 && status < 300) {
    return {
      label: authRequired
        ? hasToken ? 'Authentication succeeded; request was authorized' : 'Request allowed although authentication is required'
        : 'Request allowed; this route does not require authentication',
      success: true,
    };
  }
  return { label: 'Request failed; authentication result is not conclusive', success: false };
}

export async function sendJwtTestRequest({ url, token, authRequired, fetcher = fetch }) {
  const headers = {};
  if (token.trim()) headers.Authorization = `Bearer ${token.trim()}`;
  const response = await fetcher(url, { method: 'GET', headers });
  const responseText = await response.text();
  let body = responseText;
  try {
    body = responseText ? JSON.parse(responseText) : '';
  } catch {
    body = responseText;
  }
  return {
    status: response.status,
    verdict: getJwtTestVerdict(response.status, Boolean(token.trim()), authRequired),
    body,
  };
}
