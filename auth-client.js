(() => {
  "use strict";
  const API_BASE = (window.LOCALBOOST_API_BASE || "").replace(/\/$/, "");
  const AUTH_URL = window.LOCALBOOST_NEON_AUTH_URL;
  const TOKEN_KEY = "localboost_access_token";
  const authMessage = document.getElementById("auth-message");
  const $ = id => document.getElementById(id);
  function showMessage(value, isError = false) {
    if (!authMessage) return;
    authMessage.textContent = value;
    authMessage.classList.toggle("error", isError);
  }
  function unwrap(result) {
    if (result?.error) throw new Error(result.error.message || "Authentication failed");
    return result?.data ?? result;
  }
  function tokenFrom(data) {
    return data?.session?.access_token || data?.access_token || data?.session?.token ||
      data?.token || data?.data?.session?.token || data?.data?.token || null;
  }
  function saveToken(value) {
    const token = typeof value === "string" ? value : null;
    if (token && token.split(".").length === 3) {
      sessionStorage.setItem(TOKEN_KEY, token);
      return token;
    }
    return null;
  }
  function busy(id, state) { if ($(id)) $(id).disabled = state; }
  async function boot() {
    if (!AUTH_URL) throw new Error("Neon Auth is not configured for this dashboard.");
    const { createAuthClient } = await import("https://esm.sh/@neondatabase/auth@0.7.0-beta?bundle");
    const auth = createAuthClient(AUTH_URL, { fetchOptions: { credentials: "include" } });
    async function currentToken() {
      const result = unwrap(await auth.getSession());
      return saveToken(tokenFrom(result));
    }
    async function requestVerification(email) {
      unwrap(await auth.emailOtp.sendVerificationOtp({ email, type: "email-verification" }));
      $("email-verification-panel").hidden = false;
      showMessage("A verification code was requested. Check your inbox and spam folder.");
    }
    async function finishLogin(result) {
      const token = saveToken(tokenFrom(result)) || await currentToken();
      if (!token) throw new Error("Neon Auth did not return a usable session token. Try signing in again.");
      showMessage("Signed in. Opening your private workspace…");
      window.location.reload();
    }
    $("auth-form")?.addEventListener("submit", async event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const email=$("owner-email").value.trim(), password=$("owner-password").value;
      if (!email || !password) return showMessage("Enter your email and password.",true);
      busy("login-button",true);
      try { await finishLogin(unwrap(await auth.signIn.email({email,password}))); }
      catch(error) {
        const detail=error?.message || "Could not sign in.";
        if (/verif|unverified|email_not_verified/i.test(detail)) {
          $("email-verification-panel").hidden=false;
          try { await requestVerification(email); }
          catch(sendError) { showMessage("Verification is required, but a new code could not be sent: "+(sendError.message||"Unknown error"),true); }
        } else showMessage(detail,true);
      } finally { busy("login-button",false); }
    }, true);
    $("register-button")?.addEventListener("click", async event => {
      event.preventDefault(); event.stopImmediatePropagation();
      const email=$("owner-email").value.trim(), password=$("owner-password").value, name=$("owner-name").value.trim();
      if (!name || !email || password.length<12) return showMessage("Enter your name, email and a password with at least 12 characters.",true);
      busy("register-button",true);
      try { await finishLogin(unwrap(await auth.signUp.email({email,password,name}))); }
      catch(error) {
        const detail=error?.message || "Could not create account.";
        if (/already exists|already registered|user_exists/i.test(detail)) showMessage("An account with this email already exists. Sign in instead.",true);
        else if (/verif|email/i.test(detail)) {
          try { await requestVerification(email); } catch(sendError) { showMessage(sendError?.message||detail,true); }
        } else showMessage(detail,true);
      } finally { busy("register-button",false); }
    }, true);
    $("verify-email-button")?.addEventListener("click", async () => {
      const email=$("owner-email").value.trim(), otp=$("owner-otp").value.trim();
      if(!email||!otp) return showMessage("Enter your email and verification code.",true);
      busy("verify-email-button",true);
      try {
        const result=unwrap(await auth.emailOtp.verifyEmail({email,otp}));
        const token=saveToken(tokenFrom(result))||await currentToken();
        if(token) window.location.reload();
        else { $("email-verification-panel").hidden=true; showMessage("Email verified. Now sign in with your password."); }
      } catch(error) { showMessage(error?.message||"Email verification failed.",true); }
      finally { busy("verify-email-button",false); }
    });
    $("resend-email-code")?.addEventListener("click", async () => {
      const email=$("owner-email").value.trim();
      if(!email) return showMessage("Enter your email first.",true);
      busy("resend-email-code",true);
      try { await requestVerification(email); }
      catch(error) { showMessage(error?.message||"Could not resend verification code.",true); }
      finally { busy("resend-email-code",false); }
    });
    $("google-owner-login")?.addEventListener("click", async () => {
      busy("google-owner-login",true); showMessage("Opening Google sign-in…");
      try {
        const result=await auth.signIn.social({provider:"google",callbackURL:window.location.origin+window.location.pathname});
        if(result?.error) throw new Error(result.error.message||"Google sign-in could not start");
      } catch(error) { showMessage(error?.message||"Google sign-in could not start. Check Neon Auth Google provider settings.",true); busy("google-owner-login",false); }
    });
    $("logout-button")?.addEventListener("click", async event => {
      event.preventDefault(); event.stopImmediatePropagation();
      try { unwrap(await auth.signOut()); sessionStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem("localboost_business_id"); window.location.reload(); }
      catch(error) { showMessage(error?.message||"Sign-out could not be confirmed.",true); }
    }, true);
    const nativeFetch=window.fetch.bind(window);
    window.fetch=async (input,init={})=>{
      const url=typeof input==="string"?input:input?.url||"";
      if(API_BASE&&url.startsWith(API_BASE+"/v1/")) {
        try {
          const token=await currentToken()||sessionStorage.getItem(TOKEN_KEY);
          if(token) { const headers=new Headers(init.headers||(input instanceof Request?input.headers:undefined)); headers.set("authorization","Bearer "+token); return nativeFetch(input,{...init,headers}); }
        } catch(error) { console.warn("LocalBoost could not restore the Neon Auth session before the API request.",error); }
      }
      return nativeFetch(input,init);
    };
    let sessionToken=null;
    try { sessionToken=await currentToken(); }
    catch(error) { if(!/401|unauthorized|unauthori[sz]ed/i.test(error?.message||"")) throw error; }
    if(sessionToken) window.dispatchEvent(new Event("localboost:auth-ready"));
    window.dispatchEvent(new Event("localboost:auth-client-ready"));
  }
  boot().catch(error=>{
    console.error("LocalBoost Neon Auth could not start.",error);
    showMessage("Secure sign-in could not load: "+(error?.message||"Unknown error")+". Refresh this page or retry.",true);
    window.dispatchEvent(new CustomEvent("localboost:auth-client-error",{detail:{message:error?.message||"Neon Auth failed to initialise."}}));
  });
})();