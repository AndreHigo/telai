<script>
  import { HugeiconsIcon } from "@hugeicons/svelte";
  import { iconFor } from "../../config/ui.js";

  export let streams = [];
  export let selectedStreams = new Set();
  export let followingOnly = false;
  export let socialActionId = "";
  export let onToggleFollowing = () => {};
  export let onOpenMultistream = () => {};
  export let onStreamCardClick = () => {};
  export let onStreamCardKeydown = () => {};
  export let onToggleStream = () => {};
  export let onOpenStreamViewer = () => {};
  export let onToggleFollowStream = () => {};
</script>

<section class="live-page window-page" aria-labelledby="live-title">
  <div class="live-page-heading flex flex-wrap items-end justify-between gap-4">
    <div>
      <p class="eyebrow">telai</p>
      <h1 id="live-title">Ao vivo agora</h1>
      <p class="muted">Escolha canais públicos e monte uma seleção para acompanhar as transmissões.</p>
    </div>
    <div class="live-page-actions flex gap-2">
      <button class="outline rounded-xl px-4 py-2 text-sm font-extrabold" type="button" on:click={onToggleFollowing}>
        {followingOnly ? "Todos os canais" : "Seguindo"}
      </button>
      <button class="primary rounded-xl px-4 py-2 text-sm font-extrabold" type="button" on:click={onOpenMultistream} disabled={selectedStreams.size < 2}>
        Multistream · {selectedStreams.size}
      </button>
    </div>
  </div>

  <div class="live-page-grid mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
    {#if streams.length}
      {#each streams as stream}
        <!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
        <article
          class:stream-card-selected={selectedStreams.has(stream.id)}
          class="card stream-selection-card rounded-2xl p-5"
          role="button"
          tabindex="0"
          aria-pressed={selectedStreams.has(stream.id)}
          aria-label={`Selecionar live de ${stream.channelName}`}
          on:click={(event) => onStreamCardClick(event, stream)}
          on:keydown={(event) => onStreamCardKeydown(event, stream)}
        >
          <div class="flex items-center justify-between">
            <span class="text-[10px] font-extrabold uppercase tracking-[.16em] text-emerald-300">● ao vivo · {stream.groupName || "público"}</span>
            <input type="checkbox" checked={selectedStreams.has(stream.id)} on:change={() => onToggleStream(stream.id)} aria-label="Adicionar à seleção" />
          </div>
          <div class="stream-card-identity">
            <span class="stream-channel-avatar">
              {#if stream.channelAvatarData}<img src={stream.channelAvatarData} alt="" />{:else}{stream.channelName?.slice(0, 1) || "M"}{/if}
            </span>
            <div>
              <h2 class="text-xl font-black text-white">{stream.channelName}</h2>
              {#if stream.channelGames?.length}<p class="stream-game-line">{stream.channelGames.slice(0, 3).join(" · ")}</p>{/if}
            </div>
          </div>
          <p class="muted mt-1 text-sm">{stream.title || "Transmissão ao vivo"}</p>
          <div class="mt-5 flex flex-wrap gap-2">
            <button class="primary rounded-lg px-3 py-2 text-xs font-extrabold no-underline" type="button" on:click={() => onOpenStreamViewer(stream)}>Assistir →</button>
            <button class="outline rounded-lg px-3 py-2 text-xs font-extrabold" type="button" on:click={() => onToggleStream(stream.id)}>{selectedStreams.has(stream.id) ? "Selecionado" : "Adicionar"}</button>
            <button class="social-follow-button" class:active={stream.following} type="button" on:click|stopPropagation={() => onToggleFollowStream(stream)} disabled={socialActionId === `follow:${stream.createdBy}`}>
              {stream.following ? "Seguindo" : "Seguir canal"}
            </button>
          </div>
        </article>
      {/each}
    {:else}
      <div class="live-empty-state card col-span-full border-dashed text-center">
        <span class="live-empty-icon telai-icon" aria-hidden="true"><HugeiconsIcon icon={iconFor("radio")} size={24} strokeWidth={1.8} /></span>
        <strong>Nenhuma live pública agora</strong>
        <p class="muted">Quando alguém abrir um canal público, ele aparecerá aqui.</p>
      </div>
    {/if}
  </div>
</section>
