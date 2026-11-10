const SENSITIVE_QUERY_KEY =
  /(?:authorization|token|password|passwd|secret|api[_-]?key|client[_-]?secret|credential|cookie|session|auth)/i;

function getSafeRequestData(originalUrl) {
  const url = new URL(originalUrl, 'http://gateway.local');
  const path = url.pathname
    .replace(
      /(\/(?:access[_-]?token|token|password|passwd|secret|api[_-]?key|client[_-]?secret|credential|session|auth)\/)[^/]+/gi,
      '$1[REDACTED]'
    )
    .slice(0, 2048);
  const query = [];
  let count = 0;
  for (const [key, value] of url.searchParams) {
    if (count++ >= 100) break;
    query.push({
      key: key.slice(0, 100),
      value: SENSITIVE_QUERY_KEY.test(key) ? '[REDACTED]' : value.slice(0, 500),
    });
  }
  return { path, query };
}

function getSafeRequestUrl(originalUrl) {
  const { path, query } = getSafeRequestData(originalUrl);
  const params = new URLSearchParams();
  for (const item of query) params.append(item.key, item.value);
  const serialized = params.toString();
  return serialized ? `${path}?${serialized}` : path;
}

module.exports = { getSafeRequestData, getSafeRequestUrl };