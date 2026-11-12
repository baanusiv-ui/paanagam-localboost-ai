(() => {
  "use strict";

  const API_BASE = (window.LOCALBOOST_API_BASE || "").replace(/\/$/, "");
  const AUTH_URL = window.LOCALBOOST_NEON_AUTH_URL;
  const TOKEN_KEY = "localboost_access_token";
  const authMessage = document.getElementById("auth-message");

  function showMessage(value, isError = false) {
    if (!authMessage) return;
    authMessage.textContent = value;
    authMessage.classList.toggle("error", isError);
  }
  function unwrap(result) {
    if (result?.error) throw new Error(result.error.message || "Google sign-in failed");
    return result?.data ?? result;
  }
  function tokenFrom(value) {
    if (typeof value === "string") return value;
    return value?.token || value?.accessToken || value?.access_token ||
      value?.session?.token || value?.session?.accessToken || value?.session?.access_token ||
      value?.data?.token || value?.data?.accessToken || value?.data?.access_token ||
      value?.data?.session?.token || value?.data?.session?.accessToken ||
      value?.data?.session?.access_token || null;
  }
  function saveToken(value) {
    const token = typeof value === "string" ? value : null;
    if (token && token.split(".").length === 3) {
      sessionStorage.setItem(TOKEN_KEY, token);
      return token;
    }
    return null;
  }

  async function boot() {
    if (!AUTH_URL) throw new Error("Google owner sign-in is not configured.");
    const { createAuthClient } = await import("https://esm.sh/@neondatabase/auth@0.7.0-beta?bundle");
    const auth = createAuthClient(AUTH_URL, { fetchOptions: { credentials: "include" } });

    async function currentAccessToken() {
      // Send the Neon Auth HTTP-only session cookie on cross-origin session requests.
      const sessionResult = unwrap(await auth.getSession());
      return saveToken(tokenFrom(sessionResult));
    }

    const wait = ms => new Promise(resolve => window.setTimeout(resolve, ms));
    let authReadyDispatched = false;
    async function restoreOwnerSession({ attempts = 1, delayMs = 650 } = {}) {
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
          const token = await currentAccessToken();
          if (token) {
            if (!authReadyDispatched) {
              authReadyDispatched = true;
              window.dispatchEvent(new Event("localboost:auth-ready"));
            }
            return token;
          }
        } catch (error) {
          console.warn("LocalBoost owner session restoration attempt failed.", error);
        }
        if (attempt + 1 < attempts) await wait(delayMs);
      }
      return null;
    }

    document.getElementById("google-owner-login")?.addEventListener("click", async () => {
      const button = document.getElementById("google-owner-login");
      button.disabled = true;
      showMessage("Opening Google sign-in…");
      try {
        const result = await auth.signIn.social({
          provider: "google",
          callbackURL: window.location.origin + window.location.pathname
        });
        if (result?.error) throw new Error(result.error.message || "Google sign-in could not start");
        // Better Auth normally redirects the page. If it does not, surface a useful message.
        if (!result?.data?.url && !result?.url && !result?.data?.redirect) {
          showMessage("Google sign-in started. Complete the Google prompt and return to this dashboard.");
        }
      } catch (error) {
        showMessage(error?.message || "Google sign-in could not start. Check the Neon Auth Google provider settings.", true);
        button.disabled = false;
      }
    });

    document.getElementById("logout-button")?.addEventListener("click", async (event) => {
      event.preventDefault();
      try {
        unwrap(await auth.signOut());
        sessionStorage.removeItem(TOKEN_KEY);
        sessionStorage.removeItem("localboost_business_id");
        window.location.reload();
      } catch (error) {
        showMessage(error?.message || "Sign-out could not be confirmed.", true);
      }
    });

    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (input, init = {}) => {
      const requestUrl = typeof input === "string" ? input : input?.url || "";
      if (API_BASE && requestUrl.startsWith(API_BASE + "/v1/")) {
        try {
          const freshToken = await currentAccessToken() || sessionStorage.getItem(TOKEN_KEY);
          if (freshToken) {
            const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
            headers.set("authorization", "Bearer " + freshToken);
            return nativeFetch(input, { ...init, headers });
          }
        } catch (error) {
          console.warn("LocalBoost could not restore the Google owner session before the API request.", error);
        }
      }
      return nativeFetch(input, init);
    };

    // OAuth can return to the dashboard before the browser exposes the new
    // cross-origin HTTP-only session cookie to the first session request.
    // Retry briefly so the first Google authorisation completes the login.
    const callbackReturned = new URLSearchParams(window.location.search).has("code") ||
      new URLSearchParams(window.location.search).has("state") ||
      window.location.search.includes("error=");
    const existingToken = await restoreOwnerSession({
      attempts: callbackReturned ? 10 : 3,
      delayMs: callbackReturned ? 700 : 350
    });
    if (!existingToken) {
      console.info("No Google owner session found; Google sign-in is ready.");
    }
    window.dispatchEvent(new Event("localboost:auth-client-ready"));

    // Re-check when the browser returns from an OAuth tab or restores a tab
    // from the background. This is safe to call repeatedly and won't reload
    // or start another sign-in flow.
    let focusCheckRunning = false;
    const checkSessionOnReturn = async () => {
      if (focusCheckRunning || document.visibilityState === "hidden") return;
      focusCheckRunning = true;
      try {
        await restoreOwnerSession({ attempts: 3, delayMs: 500 });
      } finally {
        focusCheckRunning = false;
      }
    };
    window.addEventListener("focus", checkSessionOnReturn);
    window.addEventListener("pageshow", checkSessionOnReturn);
    document.addEventListener("visibilitychange", checkSessionOnReturn);
  }

  boot().catch(error => {
    console.error("LocalBoost Google owner sign-in could not start.", error);
    showMessage("Google sign-in is unavailable: " + (error?.message || "Unknown error") + ". Refresh this page or check the Neon Auth Google provider.", true);
    window.dispatchEvent(new CustomEvent("localboost:auth-client-error", {
      detail: { message: error?.message || "Google owner sign-in failed to initialise." }
    }));
  });
})();
