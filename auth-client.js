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
  function setBusy(id, busy) {
    const button = document.getElementById(id);
    if (button) button.disabled = busy;
  }
  function unwrap(result) {
    if (result?.error) throw new Error(result.error.message || "Authentication failed");
    return result?.data ?? result;
  }
  function saveToken(value) {
    const token = typeof value === "string" ? value : null;
    if (token && token.split(".").length === 3) {
      sessionStorage.setItem(TOKEN_KEY, token);
      return token;
    }
    return null;
  }
  function tokenFrom(data) {
    return data?.token || data?.accessToken || data?.access_token ||
      data?.data?.token || data?.data?.accessToken || data?.data?.access_token || null;
  }

  async function boot() {
    if (!AUTH_URL) throw new Error("Neon Auth is not configured for this dashboard.");
    const { createAuthClient } = await import("https://esm.sh/@neondatabase/auth@0.7.0-beta?bundle");
    const auth = createAuthClient(AUTH_URL);

    async function currentAccessToken() {
      // Managed Neon Auth exposes a JWKS-verifiable API JWT at GET /token.
      // getJWTToken() in this SDK build calls the unsupported /get-jwt-token path.
      const tokenUrl = AUTH_URL.replace(/\\/$/, "") + "/token";
      const response = await fetch(tokenUrl, { method: "GET", credentials: "include" });
      let payload = null;
      try { payload = await response.json(); } catch { /* handled below */ }
      if (!response.ok) {
        const detail = payload?.message || payload?.error || ("HTTP " + response.status);
        throw new Error("Neon Auth token request failed: " + detail);
      }
      const jwt = tokenFrom(payload) || payload?.session?.access_token || payload?.data?.session?.access_token;
      const saved = saveToken(jwt);
      if (saved) return saved;

      // Some SDK responses include the short-lived JWT in the session object.
      const sessionResult = unwrap(await auth.getSession());
      return saveToken(tokenFrom(sessionResult) || sessionResult?.session?.access_token);
    }
    async function requestVerification(email) {
      const result = unwrap(await auth.emailOtp.sendVerificationOtp({
        email, type: "email-verification"
      }));
      document.getElementById("email-verification-panel").hidden = false;
      showMessage("A fresh verification code has been requested. Check your inbox and spam folder.");
      return result;
    }

    async function signIn(event) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const email = document.getElementById("owner-email").value.trim();
      const password = document.getElementById("owner-password").value;
      if (!email || !password) return showMessage("Enter your email and password.", true);
      setBusy("login-button", true);
      try {
        const result = unwrap(await auth.signIn.email({ email, password }));
        const token = saveToken(tokenFrom(result)) || await currentAccessToken();
        if (!token) throw new Error("Neon Auth did not return a usable session token. Please retry; if this continues, share this message with support.");
        showMessage("Signed in. Opening your private workspace…");
        window.location.reload();
      } catch (error) {
        const detail = error?.message || "Could not sign in.";
        if (/verif|unverified|email_not_verified/i.test(detail)) {
          document.getElementById("email-verification-panel").hidden = false;
          try { await requestVerification(email); }
          catch (sendError) { showMessage("Your email needs verification, but a new code could not be sent: " + (sendError.message || "Unknown error"), true); }
        } else {
          showMessage(detail, true);
        }
      } finally {
        setBusy("login-button", false);
      }
    }

    async function register(event) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const email = document.getElementById("owner-email").value.trim();
      const password = document.getElementById("owner-password").value;
      const name = document.getElementById("owner-name").value.trim();
      if (!name || !email || password.length < 12) {
        return showMessage("Enter your name, email and a password with at least 12 characters.", true);
      }
      setBusy("register-button", true);
      try {
        const result = unwrap(await auth.signUp.email({ email, password, name }));
        const token = saveToken(tokenFrom(result)) || await currentAccessToken();
        if (!token) {
          document.getElementById("email-verification-panel").hidden = false;
          try {
            await requestVerification(email);
          } catch (sendError) {
            showMessage("Account request received, but the verification email could not be sent: " + (sendError.message || "Unknown error"), true);
          }
          return;
        }
        showMessage("Account created and signed in. Opening your workspace…");
        window.location.reload();
      } catch (error) {
        const detail = error?.message || "Could not create account.";
        if (/already exists|already registered|user_exists/i.test(detail)) {
          document.getElementById("email-verification-panel").hidden = false;
          showMessage("An account with this email already exists. Sign in, or request a fresh verification code if prompted.", true);
        } else {
          showMessage(detail, true);
        }
      } finally {
        setBusy("register-button", false);
      }
    }

    async function verifyEmail() {
      const email = document.getElementById("owner-email").value.trim();
      const otp = document.getElementById("owner-otp").value.trim();
      if (!email || !otp) return showMessage("Enter your email and verification code.", true);
      setBusy("verify-email-button", true);
      try {
        const result = unwrap(await auth.emailOtp.verifyEmail({ email, otp }));
        const token = saveToken(tokenFrom(result)) || await currentAccessToken();
        if (!token) {
          showMessage("Email verified. Now sign in with your email and password.");
          document.getElementById("email-verification-panel").hidden = true;
          return;
        }
        showMessage("Email verified. Opening your private workspace…");
        window.location.reload();
      } catch (error) {
        showMessage(error?.message || "Email verification failed.", true);
      } finally {
        setBusy("verify-email-button", false);
      }
    }

    async function resendCode() {
      const email = document.getElementById("owner-email").value.trim();
      if (!email) return showMessage("Enter your email first.", true);
      setBusy("resend-email-code", true);
      try { await requestVerification(email); }
      catch (error) { showMessage(error?.message || "Could not resend verification code.", true); }
      finally { setBusy("resend-email-code", false); }
    }

    async function signOut(event) {
      event.preventDefault();
      event.stopImmediatePropagation();
      try {
        unwrap(await auth.signOut());
        sessionStorage.removeItem(TOKEN_KEY);
        sessionStorage.removeItem("localboost_business_id");
        window.location.reload();
      } catch (error) {
        showMessage(error?.message || "Sign-out could not be confirmed.", true);
      }
    }

    document.getElementById("auth-form")?.addEventListener("submit", signIn, true);
    document.getElementById("register-button")?.addEventListener("click", register, true);
    document.getElementById("logout-button")?.addEventListener("click", signOut, true);
    document.getElementById("verify-email-button")?.addEventListener("click", verifyEmail);
    document.getElementById("resend-email-code")?.addEventListener("click", resendCode);

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
          console.warn("LocalBoost could not refresh the Neon Auth session before the API request.", error);
        }
      }
      return nativeFetch(input, init);
    };

    const existingToken = await currentAccessToken();
    if (existingToken) window.dispatchEvent(new Event("localboost:auth-ready"));
    window.dispatchEvent(new Event("localboost:auth-client-ready"));
  }

  boot().catch(error => {
    console.error("LocalBoost Neon Auth could not start.", error);
    showMessage("Secure sign-in could not load: " + (error?.message || "Unknown error") + ". Refresh this page or try Chrome again.", true);
    window.dispatchEvent(new CustomEvent("localboost:auth-client-error", {
      detail: { message: error?.message || "Neon Auth failed to initialise." }
    }));
  });
})();
