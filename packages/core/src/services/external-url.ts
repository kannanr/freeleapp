/** OS URL handlers can execute programs; authentication and help links only need HTTPS. */
export const isSafeExternalUrl = (value: string): boolean => {
  try {
    // Reject control characters before URL parsing can silently normalize them away.
    // eslint-disable-next-line no-control-regex
    if (typeof value !== "string" || /[\u0000-\u0020\u007f\\]/.test(value)) {
      return false;
    }
    const url = new URL(value);
    return url.protocol === "https:" && !!url.hostname && !url.username && !url.password;
  } catch (_) {
    return false;
  }
};
