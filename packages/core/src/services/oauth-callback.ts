export type OAuthCallback = { kind: "ignore" } | { kind: "error" } | { kind: "code"; code: string };

/** Unsolicited loopback requests must not cancel a pending PKCE sign-in. */
export const validateOAuthCallback = (method: string, target: string, host: string, expectedHost: string, state: string): OAuthCallback => {
  if (method !== "GET" || host !== expectedHost || !target || target.length > 16384 || !target.startsWith("/") || target.startsWith("//")) {
    return { kind: "ignore" };
  }
  try {
    const url = new URL(target, `http://${expectedHost}`);
    if (
      url.pathname !== "/oauth/callback" ||
      url.hash ||
      !state ||
      url.searchParams.getAll("state").length !== 1 ||
      url.searchParams.get("state") !== state
    ) {
      return { kind: "ignore" };
    }
    const codes = url.searchParams.getAll("code");
    const errors = url.searchParams.getAll("error");
    if (codes.length === 1 && codes[0] && codes[0].length <= 8192 && errors.length === 0) {
      return { kind: "code", code: codes[0] };
    }
    if (errors.length === 1 && errors[0] && errors[0].length <= 256 && codes.length === 0) {
      return { kind: "error" };
    }
  } catch (_) {
    return { kind: "ignore" };
  }
  return { kind: "ignore" };
};
