<script>
  import { HugeiconsIcon } from "@hugeicons/svelte";
  import { iconFor } from "../../config/ui.js";
  import { streamViewerUrl } from "./stream-url.js";

  export let streams = [];
  export let selectedStreams = new Set();
  export let onClose = () => {};
  export let onSelectLive = () => {};
  export let onToggleStream = () => {};
</script>

<section class="multistream-page" aria-labelledby="multistream-title">
  <header class="multistream-page-heading">
    <div>
      <p class="eyebrow">visualização simultânea</p>
      <h1 id="multistream-title">Sua central de lives</h1>
      <p class="muted">Acompanhe {selectedStreams.size} transmissões ao mesmo tempo, com cada vídeo em seu próprio espaço.</p>
    </div>
    <div class="multistream-page-actions">
      <button class="outline rounded-xl px-4 py-2 text-sm font-extrabold" type="button" on:click={onClose}><HugeiconsIcon icon={iconFor("arrowLeft")} size={16} strokeWidth={1.8} /> Voltar para ao vivo</button>
      <button class="primary rounded-xl px-4 py-2 text-sm font-extrabold" type="button" on:click={onSelectLive}><HugeiconsIcon icon={iconFor("add")} size={16} strokeWidth={1.8} /> Adicionar live</button>
    </div>
  </header>

  {#if selectedStreams.size >= 2}
    <div class="multistream-page-toolbar">
      <span><i></i> {selectedStreams.size} lives selecionadas</span>
      <small>Você pode remover qualquer transmissão pelo botão × do cartão.</small>
    </div>
    <div class={`multistream-grid multistream-grid-dedicated multistream-grid-count-${Math.min(selectedStreams.size, 4)}`}>
      {#each streams.filter((stream) => selectedStreams.has(stream.id)) as stream}
        <article class="multistream-tile">
          <div class="multistream-tile-heading">
            <span><strong>{stream.channelName}</strong><small>{stream.title || "Transmissão ao vivo"}</small></span>
            <button class="outline" type="button" on:click={() => { onToggleStream(stream.id); if (selectedStreams.size < 3) onClose(); }} aria-label={`Remover ${stream.channelName} da grade`}>×</button>
          </div>
          <iframe src={streamViewerUrl(stream, true)} title={`Transmissão de ${stream.channelName}`} allow="autoplay; fullscreen; picture-in-picture" allowfullscreen loading="lazy"></iframe>
        </article>
      {/each}
    </div>
  {:else}
    <div class="multistream-empty panel">
      <span class="telai-icon" aria-hidden="true"><HugeiconsIcon icon={iconFor("sparkles")} size={24} strokeWidth={1.8} /></span>
      <h2>Escolha pelo menos duas lives</h2>
      <p class="muted">Volte para “Ao vivo”, selecione os canais que deseja acompanhar e abra a central novamente.</p>
      <button class="primary rounded-xl px-4 py-2 text-sm font-extrabold" type="button" on:click={onSelectLive}>Escolher transmissões</button>
    </div>
  {/if}
</section>
