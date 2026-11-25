"use client";

import { signOut } from "next-auth/react";

/**
 * Ends the session and sends the browser to a path on the CURRENT origin.
 *
 * Auth.js resolves its redirect target from its configured base URL
 * (`AUTH_URL` / `NEXTAUTH_URL` / the request origin). A stale value — a
 * development `http://localhost:3000`, or a hosting provider's internal port —
 * otherwise sends a production user to `http://localhost:3000/login` and the
 * browser shows ERR_CONNECTION_REFUSED.
 *
 * We always ignore the absolute URL the server picks and navigate to a relative
 * path instead, so this works unchanged on localhost, the hospital LAN and
 * Render without any host being configured.
 */
export async function signOutToLogin(path = "/login"): Promise<void> {
  try {
    // Clears the session cookie server-side; `redirect: false` stops Auth.js
    // from navigating to its own (possibly wrong-origin) URL.
    await signOut({ redirect: false });
  } catch {
    // Navigating away is still preferable to trapping the user in the app; the
    // middleware re-checks the session on the next request.
  }

  // replace() keeps the signed-in page out of the back-button history.
  window.location.replace(path);
}
