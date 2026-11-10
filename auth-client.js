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
  function tokenFrom(data) {
    return data?.token || data?.accessToken || data?.access_token ||
      data?.data?.token || data?.data?.accessToken || data?.data?.access_token || null;
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
    const auth = createAuthClient(AUTH_URL);

    async function currentAccessToken() {
      const tokenUrl = AUTH_URL.replace(/\/$/, "") + "/token";
      const response = await fetch(tokenUrl, { method: "GET", credentials: "include" });
      let payload = null;
      try { payload = await response.json(); } catch { /* handled below */ }
      if (!response.ok) {
        const detail = payload?.message || payload?.error || ("HTTP " + response.status);
        throw new Error("Google owner session request failed: " + detail);
      }
      const jwt = tokenFrom(payload) || payload?.session?.access_token || payload?.data?.session?.access_token;
      const saved = saveToken(jwt);
      if (saved) return saved;
      const sessionResult = unwrap(await auth.getSession());
      return saveToken(tokenFrom(sessionResult) || sessionResult?.session?.access_token);
    }

    document.getElementById("google-owner-login")?.addEventListener("click", async () => {
      const button = document.getElementById("google-owner-login");
      button.disabled = true;
      showMessage("Opening Google sign-in…");
      try {
        unwrap(await auth.signIn.social({
          provider: "google",
          callbackURL: window.location.origin + window.location.pathname
        }));
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
          console.warn("LocalBoost could not refresh the Google owner session before the API request.", error);
        }
      }
      return nativeFetch(input, init);
    };

    let existingToken = null;
    try {
      existingToken = await currentAccessToken();
    } catch (error) {
      const detail = error?.message || "";
      if (!/401|unauthorized|unauthori[sz]ed/i.test(detail)) throw error;
      console.info("No Google owner session; Google sign-in is ready.");
    }
    if (existingToken) window.dispatchEvent(new Event("localboost:auth-ready"));
    window.dispatchEvent(new Event("localboost:auth-client-ready"));
  }

  boot().catch(error => {
    console.error("LocalBoost Google owner sign-in could not start.", error);
    showMessage("Google sign-in is unavailable: " + (error?.message || "Unknown error") + ". Refresh this page or check the Neon Auth Google provider.", true);
    window.dispatchEvent(new CustomEvent("localboost:auth-client-error", {
      detail: { message: error?.message || "Google owner sign-in failed to initialise." }
    }));
  });
})();