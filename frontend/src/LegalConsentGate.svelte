<script>
  import { createEventDispatcher } from "svelte";

  export let user = null;

  const dispatch = createEventDispatcher();

  let termsAccepted = false;
  let privacyAccepted = false;
  let busy = false;
  let error = "";

  $: required = Boolean(user?.legal?.required);

  async function accept() {
    if (!termsAccepted || !privacyAccepted || busy) return;
    busy = true;
    error = "";
    try {
      const response = await fetch("/api/auth/consent", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ termsAccepted: true, privacyAccepted: true }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Não foi possível registrar seu aceite.");
      if (!body.legal || body.legal.required) throw new Error("O aceite não foi confirmado pelo servidor. Tente novamente.");
      dispatch("accepted", body.legal);
      termsAccepted = false;
      privacyAccepted = false;
      busy = false;
    } catch (requestError) {
      error = requestError.message;
      busy = false;
    }
  }
</script>

{#if required}
  <div class="legal-consent-backdrop" role="presentation">
    <div class="legal-consent-dialog" role="dialog" aria-modal="true" aria-labelledby="legal-consent-title">
      <p class="eyebrow">atualização de transparência</p>
      <h2 id="legal-consent-title">Leia antes de continuar</h2>
      <p class="muted">Atualizamos os documentos do Telai para explicar melhor o tratamento dos seus dados. Você precisa aceitar os dois documentos para continuar usando a conta.</p>
      <div class="legal-consent-links"><a href="/privacidade" target="_blank" rel="noreferrer">Política de Privacidade ↗</a><a href="/termos-de-uso" target="_blank" rel="noreferrer">Termos de Uso ↗</a></div>
      <label class="legal-consent-check"><input type="checkbox" bind:checked={privacyAccepted} /> <span>Li e aceito a Política de Privacidade.</span></label>
      <label class="legal-consent-check"><input type="checkbox" bind:checked={termsAccepted} /> <span>Li e aceito os Termos de Uso.</span></label>
      {#if error}<p class="settings-error" role="alert">{error}</p>{/if}
      <button class="primary rounded-xl px-4 py-3 text-sm font-extrabold" type="button" on:click={accept} disabled={busy || !termsAccepted || !privacyAccepted}>{busy ? "Salvando…" : "Aceitar e continuar"}</button>
    </div>
  </div>
{/if}

<style>
  .legal-consent-backdrop { position: fixed; inset: 0; z-index: 120; display: grid; place-items: center; padding: 20px; background: rgba(2,5,13,.78); backdrop-filter: blur(8px); }
  .legal-consent-dialog { width: min(520px, 100%); display: grid; gap: 14px; padding: 28px; border: 1px solid #40588a; border-radius: 18px; color: #edf2ff; background: #111d34; box-shadow: 0 24px 80px rgba(0,0,0,.42); }
  .legal-consent-dialog h2 { margin: 0; font-size: 25px; }
  .legal-consent-dialog p { margin: 0; line-height: 1.6; }
  .legal-consent-links { display: flex; flex-wrap: wrap; gap: 12px; }
  .legal-consent-links a { color: #b7c1ff; font-size: 12px; font-weight: 800; }
  .legal-consent-check { display: flex; align-items: flex-start; gap: 9px; color: #dce5fb; font-size: 12px; }
  .legal-consent-check input { margin-top: 4px; accent-color: #7278f5; }
</style>
