<script>
  export let interactionId = "";
  export let response = { type: "message", content: "", components: [] };
  export let onSubmitComponent = async () => {};
  export let onSubmitModal = async () => {};

  let busyId = "";
  let activeModalId = "";
  let modalValues = {};
  let selectValues = {};
  let error = "";

  $: components = Array.isArray(response?.components) ? response.components : [];
  $: activeModal = components.find((component) => component.type === "modal" && component.customId === activeModalId) || null;

  async function submitComponent(component, values = []) {
    if (!interactionId || !component?.customId || busyId) return;
    busyId = component.customId;
    error = "";
    try {
      await onSubmitComponent({ interactionId, customId: component.customId, values });
    } catch (cause) {
      error = cause?.message || "Não foi possível enviar a interação.";
    } finally {
      busyId = "";
    }
  }

  function openModal(component) {
    activeModalId = component.customId;
    modalValues = Object.fromEntries((component.fields || []).map((field) => [field.customId, ""]));
    error = "";
  }

  function closeModal() {
    activeModalId = "";
    modalValues = {};
  }

  async function submitModal() {
    if (!activeModal || !interactionId || busyId) return;
    busyId = activeModal.customId;
    error = "";
    try {
      await onSubmitModal({ interactionId, customId: activeModal.customId, fields: modalValues });
      closeModal();
    } catch (cause) {
      error = cause?.message || "Não foi possível enviar o formulário.";
    } finally {
      busyId = "";
    }
  }
</script>

{#if components.length}
  <div class="bot-interaction" aria-label="Ações da mensagem do bot">
    <div class="bot-interaction-actions">
      {#each components as component}
        {#if component.type === "button"}
          <button class="outline bot-component-button" type="button" disabled={Boolean(busyId) || component.disabled} on:click={() => submitComponent(component)}>{component.label}</button>
        {:else if component.type === "select"}
          <label class="bot-component-select"><span>{component.placeholder || "Escolha uma opção"}</span><select value={selectValues[component.customId] || ""} disabled={Boolean(busyId)} on:change={(event) => { selectValues = { ...selectValues, [component.customId]: event.currentTarget.value }; }} aria-label={component.placeholder || "Escolha uma opção"}><option value="" disabled>Selecione</option>{#each component.options || [] as option}<option value={option.value}>{option.label}</option>{/each}</select><button class="outline bot-component-button" type="button" disabled={Boolean(busyId) || !selectValues[component.customId]} on:click={() => submitComponent(component, [selectValues[component.customId]])}>Enviar</button></label>
        {:else if component.type === "modal"}
          <button class="outline bot-component-button" type="button" disabled={Boolean(busyId)} on:click={() => openModal(component)}>{component.title || "Abrir formulário"}</button>
        {/if}
      {/each}
    </div>
    {#if activeModal}
      <form class="bot-modal-form" on:submit|preventDefault={submitModal}>
        <div class="bot-modal-heading"><strong>{activeModal.title}</strong><button class="outline" type="button" on:click={closeModal}>Fechar</button></div>
        {#each activeModal.fields || [] as field}
          <label class="modal-field">{field.label}<textarea class="settings-input" rows={field.style === "paragraph" ? 3 : 1} required={field.required} value={modalValues[field.customId] || ""} on:input={(event) => { modalValues = { ...modalValues, [field.customId]: event.currentTarget.value }; }}></textarea></label>
        {/each}
        <button class="primary bot-component-button" type="submit" disabled={Boolean(busyId)}>Enviar formulário</button>
      </form>
    {/if}
    {#if error}<p class="settings-error" role="alert">{error}</p>{/if}
  </div>
{/if}
