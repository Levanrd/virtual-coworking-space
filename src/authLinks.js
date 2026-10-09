// Parse links without consuming unrelated workspace/invitation parameters.
export function recoveryLink(href) {
  const url = new URL(href);
  const fragment = new URLSearchParams(url.hash.slice(1));
  const kind = fragment.has('reset') ? 'reset' : fragment.has('verify') ? 'verify' : null;
  if (!kind) return null;
  const token = fragment.get(kind);
  fragment.delete('reset');
  fragment.delete('verify');
  url.hash = fragment.toString();
  return { kind, token, cleanURL: url.pathname + url.search + url.hash };
}
