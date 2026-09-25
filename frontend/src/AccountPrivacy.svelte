<script>
  export let user = null;

  let deleteOpen = false;
  let confirmation = "";
  let busy = false;
  let error = "";

  $: expectedConfirmation = `EXCLUIR ${String(user?.username || "").toUpperCase()}`;

  function downloadData() {
    window.location.assign("/api/account/export");
  }

  async function deleteAccount() {
    if (confirmation.trim() !== expectedConfirmation || busy) return;
    busy = true;
    error = "";
    try {
      const response = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: confirmation.trim() }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Não foi possível excluir a conta.");
      window.location.assign("/login?account_deleted=1");
    } catch (requestError) {
      error = requestError.message;
      busy = false;
    }
  }
</script>

<section class="settings-card privacy-controls-card">
  <div class="settings-card-heading">
    <div>
      <p class="eyebrow">privacidade e direitos</p>
      <h2>Seus dados</h2>
      <p class="muted">Consulte os documentos do Telai, baixe uma cópia dos seus dados ou exclua sua conta.</p>
    </div>
    {#if user?.legal?.policyVersion}<span class="privacy-version">política {user.legal.policyVersion}</span>{/if}
  </div>
  <div class="privacy-links"><a class="outline rounded-lg px-3 py-2 text-xs font-extrabold no-underline" href="/privacidade" target="_blank" rel="noreferrer">Política de Privacidade</a><a class="outline rounded-lg px-3 py-2 text-xs font-extrabold no-underline" href="/termos-de-uso" target="_blank" rel="noreferrer">Termos de Uso</a></div>
  <div class="privacy-action-row"><div><strong>Exportar meus dados</strong><p class="muted">Baixa um JSON com os dados associados à sua conta, sem senha ou token de sessão.</p></div><button class="outline rounded-lg px-3 py-2 text-xs font-extrabold" type="button" on:click={downloadData}>Baixar meus dados</button></div>
  <div class="privacy-danger-zone"><div><strong>Excluir minha conta</strong><p class="muted">Remove a conta, sessões, mensagens, lives e grupos que você possui. Essa ação é permanente.</p></div><button class="danger-outline rounded-lg px-3 py-2 text-xs font-extrabold" type="button" on:click={() => { deleteOpen = !deleteOpen; error = ""; }}>Excluir conta</button></div>
  {#if deleteOpen}
    <form class="privacy-delete-confirm" on:submit|preventDefault={deleteAccount}>
      <p class="settings-callout danger-callout">Para confirmar, digite exatamente <strong>{expectedConfirmation}</strong>. Grupos administrados por você também serão removidos.</p>
      <input class="settings-input" bind:value={confirmation} autocomplete="off" spellcheck="false" placeholder={expectedConfirmation} aria-label="Confirmação da exclusão" />
      {#if error}<p class="settings-error" role="alert">{error}</p>{/if}
      <div class="privacy-confirm-actions"><button class="outline rounded-lg px-3 py-2 text-xs font-extrabold" type="button" on:click={() => { deleteOpen = false; confirmation = ""; }} disabled={busy}>Cancelar</button><button class="danger-outline rounded-lg px-3 py-2 text-xs font-extrabold" type="submit" disabled={busy || confirmation.trim() !== expectedConfirmation}>{busy ? "Excluindo…" : "Confirmar exclusão"}</button></div>
    </form>
  {/if}
</section>

<style>
  .privacy-controls-card { gap: 16px; }
  .privacy-version { color: #9eafd0; font-size: 10px; font-weight: 800; white-space: nowrap; }
  .privacy-links, .privacy-confirm-actions { display: flex; flex-wrap: wrap; gap: 8px; }
  .privacy-action-row, .privacy-danger-zone { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 15px 0; border-top: 1px solid #263b5d; }
  .privacy-action-row p, .privacy-danger-zone p { margin: 4px 0 0; font-size: 11px; line-height: 1.5; }
  .privacy-danger-zone { border-color: rgba(255,125,101,.28); }
  .privacy-delete-confirm { display: grid; gap: 10px; padding: 14px; border: 1px solid rgba(255,125,101,.36); border-radius: 12px; background: rgba(109,37,37,.14); }
  @media (max-width: 640px) { .privacy-action-row, .privacy-danger-zone { align-items: stretch; flex-direction: column; } }
</style>
