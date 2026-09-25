export function createAuthController({
  api,
  getState,
  setState,
  onAuthenticated,
  navigateOAuth,
}) {
  async function submitAuth(event) {
    event?.preventDefault();
    setState({ authBusy: true, authError: "" });
    const state = getState();
    const isLogin = state.authMode === "login";
    const payload = isLogin
      ? { username: state.loginUsername, password: state.loginPassword }
      : {
        displayName: state.registerDisplayName,
        username: state.registerUsername,
        password: state.registerPassword,
        termsAccepted: state.registerLegalAccepted,
        privacyAccepted: state.registerLegalAccepted,
      };
    try {
      const result = await api(isLogin ? "/api/auth/login" : "/api/auth/register", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      await onAuthenticated(result.user);
    } catch (error) {
      setState({ authError: error.message });
    } finally {
      setState({ authBusy: false });
    }
  }

  function startOAuth(provider) {
    navigateOAuth(provider);
  }

  return { submitAuth, startOAuth };
}
