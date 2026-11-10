export function displayTarget(value) {
  try {
    const target = new URL(value);
    if (target.username || target.password) {
      target.username = '';
      target.password = '';
      return target.toString();
    }
  } catch {
    return value;
  }
  return value;
}
