<script>
  import { HugeiconsIcon } from "@hugeicons/svelte";
  import { iconFor } from "../../config/ui.js";

  export let session = null;
  export let busy = false;
  export let onReconnect = () => {};
  export let onDismiss = () => {};
</script>

{#if session}
  <section class="voice-reconnect-banner" role="status" aria-live="polite">
    <span class="voice-reconnect-banner-icon telai-icon" aria-hidden="true"><HugeiconsIcon icon={iconFor("volume")} size={19} strokeWidth={1.8} /></span>
    <div class="voice-reconnect-copy">
      <span class="voice-reconnect-kicker">Conexão interrompida</span>
      <strong>Voltar para a sala de voz?</strong>
      <p><b>{session.groupName}</b><span aria-hidden="true"> · </span>{session.roomName}<span class="voice-reconnect-status">{busy ? "Reconectando…" : navigator.onLine ? "A sala continua disponível." : "Aguardando a internet voltar."}</span></p>
    </div>
    <div class="voice-reconnect-actions">
      <button class="primary rounded-xl px-4 py-2 text-sm font-extrabold" type="button" on:click={onReconnect} disabled={busy || !navigator.onLine}>{busy ? "Reconectando…" : "Reconectar"}</button>
      <button class="outline rounded-xl px-4 py-2 text-sm font-extrabold" type="button" on:click={onDismiss} disabled={busy}>Descartar</button>
    </div>
  </section>
{/if}
