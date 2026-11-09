import { createAuthClient } from "https://esm.sh/@neondatabase/auth@0.7.0-beta?bundle";

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
  if (!AUTH_URL) { showMessage("Neon Auth is not configured for this dashboard.", true); return; }
  const auth = createAuthClient(AUTH_URL);
  function unwrap(result) {
    if (result?.error) throw new Error(result.error.message || "Authentication failed");
    return result?.data ?? result;
  }
  async function currentAccessToken() {
    const result = unwrap(await auth.getSession());
    return result?.session?.access_token || result?.access_token || null;
  }
  async function signIn(event) {
    event.preventDefault(); event.stopImmediatePropagation();
    const email = document.getElementById("owner-email").value.trim();
    const password = document.getElementById("owner-password").value;
    if (!email || !password) return showMessage("Enter your email and password.", true);
    const button = document.getElementById("login-button"); button.disabled = true;
    try {
      unwrap(await auth.signIn.email({ email, password }));
      const token = await currentAccessToken();
      if (!token) throw new Error("Sign-in completed, but Neon Auth did not return an API access token.");
      sessionStorage.setItem(TOKEN_KEY, token);
      sessionStorage.removeItem("localboost_auth_recovering");
      window.location.reload();
    } catch (error) { showMessage(error.message || "Could not sign in.", true); button.disabled = false; }
  }
  async function register(event) {
    event.preventDefault(); event.stopImmediatePropagation();
    const email = document.getElementById("owner-email").value.trim();
    const password = document.getElementById("owner-password").value;
    const name = document.getElementById("owner-name").value.trim();
    if (!name || !email || password.length < 12) return showMessage("Enter your name, email and a password with at least 12 characters.", true);
    const button = document.getElementById("register-button"); button.disabled = true;
    try {
      unwrap(await auth.signUp.email({ email, password, name }));
      const token = await currentAccessToken();
      if (!token) throw new Error("Account created. Complete any email verification required, then sign in.");
      sessionStorage.setItem(TOKEN_KEY, token);
      window.location.reload();
    } catch (error) { showMessage(error.message || "Could not create account.", true); button.disabled = false; }
  }
  async function signOut(event) {
    event.preventDefault(); event.stopImmediatePropagation();
    try { unwrap(await auth.signOut()); }
    catch (error) { showMessage(error.message || "Sign-out could not be confirmed.", true); return; }
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem("localboost_business_id");
    sessionStorage.removeItem("localboost_auth_recovering");
    window.location.reload();
  }
  document.getElementById("auth-form")?.addEventListener("submit", signIn, true);
  document.getElementById("register-button")?.addEventListener("click", register, true);
  document.getElementById("logout-button")?.addEventListener("click", signOut, true);
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const requestUrl = typeof input === "string" ? input : input?.url || "";
    if (API_BASE && requestUrl.startsWith(API_BASE + "/v1/")) {
      try {
        const freshToken = await currentAccessToken();
        if (freshToken) {
          sessionStorage.setItem(TOKEN_KEY, freshToken);
          const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
          headers.set("authorization", "Bearer " + freshToken);
          return nativeFetch(input, { ...init, headers });
        }
      } catch { /* API will reject missing/expired tokens; do not block auth endpoints. */ }
    }
    return nativeFetch(input, init);
  };
  currentAccessToken().then(token => {
    if (!token) { sessionStorage.removeItem(TOKEN_KEY); return; }
    const oldToken = sessionStorage.getItem(TOKEN_KEY);
    sessionStorage.setItem(TOKEN_KEY, token);
    if (!oldToken && !sessionStorage.getItem("localboost_auth_recovering")) {
      sessionStorage.setItem("localboost_auth_recovering", "1");
      window.location.reload();
    }
  }).catch(error => showMessage(error.message || "Could not restore Neon Auth session.", true));
})();
