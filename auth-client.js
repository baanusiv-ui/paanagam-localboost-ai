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
  function tokenFrom(result) {
    const data = unwrap(result);
    return data?.session?.access_token || data?.access_token || data?.session?.token || null;
  }
  async function currentAccessToken() {
    try { return tokenFrom(await auth.getSession()); }
    catch { return null; }
  }
  function saveToken(token) {
    if (typeof token === "string" && token.split(".").length === 3) {
      sessionStorage.setItem(TOKEN_KEY, token);
      return token;
    }
    return null;
  }
  async function signIn(event) {
    event.preventDefault(); event.stopImmediatePropagation();
    const email = document.getElementById("owner-email").value.trim();
    const password = document.getElementById("owner-password").value;
    if (!email || !password) return showMessage("Enter your email and password.", true);
    const button = document.getElementById("login-button"); button.disabled = true;
    try {
      const signInResult = await auth.signIn.email({ email, password });
      const signInData = unwrap(signInResult);
      const token = saveToken(signInData?.session?.access_token || signInData?.access_token || signInData?.session?.token) || saveToken(await currentAccessToken());
      if (!token) throw new Error("Sign-in was accepted, but no JWT session token was available to the dashboard. Check browser cookie settings or try a supported browser.");
      sessionStorage.removeItem("localboost_auth_recovering");
      window.location.reload();
    } catch (error) {
      if (/verif|unverified/i.test(error.message || "")) document.getElementById("email-verification-panel").hidden = false;
      showMessage(error.message || "Could not sign in.", true);
      button.disabled = false;
    }
  }
  async function register(event) {
    event.preventDefault(); event.stopImmediatePropagation();
    const email = document.getElementById("owner-email").value.trim();
    const password = document.getElementById("owner-password").value;
    const name = document.getElementById("owner-name").value.trim();
    if (!name || !email || password.length < 12) return showMessage("Enter your name, email and a password with at least 12 characters.", true);
    const button = document.getElementById("register-button"); button.disabled = true;
    try {
      const signUpResult = await auth.signUp.email({ email, password, name });
      const signUpData = unwrap(signUpResult);
      const token = saveToken(signUpData?.session?.access_token || signUpData?.access_token || signUpData?.session?.token) || saveToken(await currentAccessToken());
      if (!token) {
        document.getElementById("email-verification-panel").hidden = false;
        showMessage("Account created. Enter the verification code sent to your email.");
        button.disabled = false;
        return;
      }
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

  document.getElementById("verify-email-button")?.addEventListener("click", async () => {
    const email = document.getElementById("owner-email").value.trim();
    const otp = document.getElementById("owner-otp").value.trim();
    const button = document.getElementById("verify-email-button");
    if (!email || !otp) return showMessage("Enter your email and verification code.", true);
    button.disabled = true;
    try {
      const verifyResult = await auth.emailOtp.verifyEmail({ email, otp });
      const verifyData = unwrap(verifyResult);
      const token = saveToken(verifyData?.session?.access_token || verifyData?.access_token || verifyData?.session?.token) || saveToken(await currentAccessToken());
      if (!token) throw new Error("Email verified. Please sign in to continue.");
      sessionStorage.setItem(TOKEN_KEY, token);
      window.location.reload();
    } catch (error) {
      showMessage(error.message || "Email verification failed.", true);
      button.disabled = false;
    }
  });
  document.getElementById("resend-email-code")?.addEventListener("click", async () => {
    const email = document.getElementById("owner-email").value.trim();
    if (!email) return showMessage("Enter your email first.", true);
    try {
      unwrap(await auth.emailOtp.sendVerificationOtp({ email, type: "email-verification" }));
      showMessage("A new verification code has been sent.");
    } catch (error) { showMessage(error.message || "Could not resend verification code.", true); }
  });
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const requestUrl = typeof input === "string" ? input : input?.url || "";
    if (API_BASE && requestUrl.startsWith(API_BASE + "/v1/")) {
      try {
        const freshToken = saveToken(await currentAccessToken()) || sessionStorage.getItem(TOKEN_KEY);
        if (freshToken) {
          const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
          headers.set("authorization", "Bearer " + freshToken);
          return nativeFetch(input, { ...init, headers });
        }
      } catch { /* API will reject missing/expired tokens; do not block auth endpoints. */ }
    }
    return nativeFetch(input, init);
  };
  currentAccessToken().then(token => {
    if (token) saveToken(token);
    // Preserve the token returned by sign-in when cross-site cookie lookup is unavailable.
    // The API remains authoritative and verifies the JWT signature, issuer, subject and email.
  });
})();
