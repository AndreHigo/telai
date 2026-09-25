<script>
  import { HugeiconsIcon } from "@hugeicons/svelte";
  import { DiscordIcon } from "@hugeicons/core-free-icons";
  import { iconFor } from "../../config/ui.js";

  export let isDark = true;
  export let authMode = "login";
  export let providers = { google: false, discord: false };
  export let authBusy = false;
  export let authError = "";
  export let loginUsername = "";
  export let loginPassword = "";
  export let registerDisplayName = "";
  export let registerUsername = "";
  export let registerPassword = "";
  export let registerLegalAccepted = false;
  export let onStateChange = () => {};
  export let onSubmit = () => {};
  export let onStartOAuth = () => {};

  function toggleAuthMode() {
    onStateChange({ authMode: authMode === "login" ? "register" : "login", authError: "" });
  }

  function updateField(name, event) {
    const target = event.currentTarget;
    onStateChange({ [name]: target.type === "checkbox" ? target.checked : target.value });
  }
</script>

<main class="auth-page shell-width flex min-h-screen items-center justify-center py-8">
  <section class="auth-card glass w-full max-w-[430px] rounded-2xl p-6 shadow-2xl sm:p-8">
    <div class="mb-7 flex items-center justify-between gap-3"><span class="telai-logo-switcher"><img class:active={isDark} src="/telai-logo-dark.png?v=1" alt={isDark ? "Telai" : ""} aria-hidden={!isDark} /><img class:active={!isDark} src="/telai-logo.png?v=1" alt={!isDark ? "Telai" : ""} aria-hidden={isDark} /></span><a class="download-app-link outline rounded-lg px-3 py-2 text-xs font-extrabold no-underline" href="https://github.com/AndreHigo/telai-downloads/releases/latest/download/Telai-Setup-latest.exe" target="_blank" rel="noreferrer" aria-label="Baixar o aplicativo Telai"><HugeiconsIcon icon={iconFor("arrowDown")} size={15} strokeWidth={1.8} /> Baixar app</a></div>
    <p class="eyebrow">acesso Telai</p>
    <h1 class="mt-2 text-3xl font-black tracking-[-.05em] text-white">{authMode === "login" ? "Entrar" : "Criar conta"}</h1>
    <p class="muted mt-2 text-sm leading-6">{authMode === "login" ? "Entre para acessar seus grupos e transmissões." : "Crie seu acesso para montar grupos e compartilhar."}</p>

    {#if providers.google || providers.discord}
      <div class="mt-6 grid gap-2 sm:grid-cols-2">
        {#if providers.google}<button class="auth-provider-button outline rounded-xl px-3 py-2.5 text-xs font-extrabold" type="button" on:click={() => onStartOAuth("google")}><span class="provider-icon google-icon">G</span>Google</button>{/if}
        {#if providers.discord}<button class="auth-provider-button outline rounded-xl px-3 py-2.5 text-xs font-extrabold" type="button" on:click={() => onStartOAuth("discord")}><span class="provider-icon discord-icon telai-icon"><HugeiconsIcon icon={DiscordIcon} size={16} strokeWidth={1.8} /></span>Discord</button>{/if}
      </div>
      <div class="auth-divider my-5"><span>ou use sua conta Telai</span></div>
    {/if}

    <form class="auth-form grid gap-4" on:submit|preventDefault={onSubmit}>
      {#if authMode === "register"}
        <label class="auth-label">Nome de exibição<input value={registerDisplayName} on:input={(event) => updateField("registerDisplayName", event)} class="auth-input" autocomplete="name" maxlength="48" required placeholder="Como os outros vão chamar você?" /></label>
      {/if}
      <label class="auth-label">Usuário<input value={loginUsername} on:input={(event) => updateField("loginUsername", event)} class:auth-hidden={authMode !== "login"} class="auth-input" autocomplete="username" maxlength="32" required={authMode === "login"} placeholder="seu usuário" /><input value={registerUsername} on:input={(event) => updateField("registerUsername", event)} class:auth-hidden={authMode === "login"} class="auth-input" autocomplete="username" maxlength="32" required={authMode === "register"} placeholder="ex.: andre.higo" /></label>
      <label class="auth-label">Senha<input value={loginPassword} on:input={(event) => updateField("loginPassword", event)} class:auth-hidden={authMode !== "login"} class="auth-input" type="password" autocomplete="current-password" maxlength="128" required={authMode === "login"} placeholder="sua senha" /><input value={registerPassword} on:input={(event) => updateField("registerPassword", event)} class:auth-hidden={authMode === "login"} class="auth-input" type="password" autocomplete="new-password" minlength="8" maxlength="128" required={authMode === "register"} placeholder="mínimo de 8 caracteres" /></label>
      {#if authMode === "register"}<label class="auth-legal-consent"><input type="checkbox" checked={registerLegalAccepted} on:change={(event) => updateField("registerLegalAccepted", event)} required /><span>Li e aceito a <a href="/privacidade" target="_blank" rel="noreferrer">Política de Privacidade</a> e os <a href="/termos-de-uso" target="_blank" rel="noreferrer">Termos de Uso</a>.</span></label>{/if}
      {#if authError}<p class="auth-error rounded-lg px-3 py-2 text-xs" role="alert">{authError}</p>{/if}
      <button class="primary mt-1 rounded-xl px-4 py-3 text-sm font-extrabold" type="submit" disabled={authBusy}>{authBusy ? "Aguarde…" : authMode === "login" ? "Entrar" : "Criar conta"} <HugeiconsIcon icon={iconFor("arrowRight")} size={16} strokeWidth={1.8} /></button>
    </form>
    <button class="auth-switch muted mt-5 w-full text-center text-xs font-bold" type="button" on:click={toggleAuthMode}>{authMode === "login" ? "Ainda não tenho conta · criar agora" : "Já tenho uma conta · voltar ao login"}</button>
    <p class="auth-legal-footer"><a href="/privacidade" target="_blank" rel="noreferrer">Privacidade</a><span>·</span><a href="/termos-de-uso" target="_blank" rel="noreferrer">Termos de Uso</a></p>
  </section>
</main>
