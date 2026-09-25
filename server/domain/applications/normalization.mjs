export function normalizeText(value, maxLength) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

export function normalizeCommandName(value) {
  const name = String(value ?? "").trim().toLowerCase();
  return /^[a-z0-9_-]{1,32}$/.test(name) ? name : null;
}

export function normalizeCommandOptions(value) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 25) return null;
  const seen = new Set();
  const options = [];
  for (const item of value) {
    const name = normalizeCommandName(item?.name);
    const description = normalizeText(item?.description, 100);
    const type = String(item?.type || "string").trim().toLowerCase();
    if (!name || seen.has(name) || !description || !["string", "integer", "number", "boolean"].includes(type)) return null;
    seen.add(name);
    options.push({ name, description, type, required: item?.required === true });
  }
  return options;
}

export function normalizeInteractionOptions(definitions, value) {
  const input = value === undefined ? {} : value;
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const definitionMap = new Map((definitions || []).map((item) => [item.name, item]));
  const output = {};
  for (const [name, rawValue] of Object.entries(input)) {
    const definition = definitionMap.get(name);
    if (!definition || typeof rawValue === "object" || (typeof rawValue === "string" && rawValue.length > 1000)) return null;
    if (definition.type === "string" && typeof rawValue !== "string") return null;
    if (definition.type === "integer" && (!Number.isInteger(rawValue) || !Number.isSafeInteger(rawValue))) return null;
    if (definition.type === "number" && (typeof rawValue !== "number" || !Number.isFinite(rawValue))) return null;
    if (definition.type === "boolean" && typeof rawValue !== "boolean") return null;
    output[name] = rawValue;
  }
  for (const definition of definitions || []) {
    if (definition.required && output[definition.name] === undefined) return null;
  }
  return output;
}

export function normalizeCustomId(value) {
  const customId = String(value ?? "").trim();
  return /^[A-Za-z0-9:_-]{1,100}$/.test(customId) ? customId : null;
}

export function normalizeApplicationInstallationPermissions(value, fallback = { commands: true, messages: true, interactions: true }) {
  if (value === undefined) return { ...fallback };
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const permissions = {};
  for (const key of ["commands", "messages", "interactions"]) {
    if (value[key] !== undefined && typeof value[key] !== "boolean") return null;
    permissions[key] = value[key] === undefined ? Boolean(fallback[key]) : value[key];
  }
  return permissions;
}

export function normalizeComponents(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 25) return null;
  const seen = new Set();
  const components = [];
  for (const item of value) {
    const type = String(item?.type || "").trim().toLowerCase();
    const customId = normalizeCustomId(item?.customId);
    if (!customId || seen.has(customId)) return null;
    seen.add(customId);
    if (type === "button") {
      const label = normalizeText(item.label, 80);
      const style = String(item.style || "secondary").trim().toLowerCase();
      if (!label || !["primary", "secondary", "danger"].includes(style)) return null;
      components.push({ type, customId, label, style, disabled: item.disabled === true });
      continue;
    }
    if (type === "select") {
      const options = Array.isArray(item.options) ? item.options.slice(0, 25).map((option) => ({
        value: normalizeText(option?.value, 100),
        label: normalizeText(option?.label, 80),
        description: normalizeText(option?.description, 100),
      })) : [];
      if (!options.length || options.some((option) => !option.value || !option.label || option.value.length > 100)) return null;
      components.push({ type, customId, placeholder: normalizeText(item.placeholder, 100), options, minValues: 1, maxValues: 1 });
      continue;
    }
    if (type === "modal") {
      const title = normalizeText(item.title, 100);
      const fields = Array.isArray(item.fields) ? item.fields.slice(0, 5).map((field) => ({
        customId: normalizeCustomId(field?.customId),
        label: normalizeText(field?.label, 100),
        style: String(field?.style || "short").trim().toLowerCase(),
        required: field?.required !== false,
      })) : [];
      if (!title || !fields.length || fields.some((field) => !field.customId || !field.label || !["short", "paragraph"].includes(field.style))) return null;
      components.push({ type, customId, title, fields });
      continue;
    }
    return null;
  }
  return components;
}

export function normalizeBotResponse(body) {
  const response = body?.response && typeof body.response === "object" ? body.response : body;
  const type = String(response?.type || "message").trim().toLowerCase();
  if (type === "message") {
    const content = normalizeText(response.content ?? response.body, 2000);
    const components = normalizeComponents(response.components);
    if ((!content && !components.length) || !components) return null;
    return { type, content, components };
  }
  if (type === "modal") {
    const customId = normalizeCustomId(response.customId);
    const title = normalizeText(response.title, 100);
    const fields = normalizeComponents([{ type, customId, title, fields: response.fields }]);
    if (!fields) return null;
    return fields[0];
  }
  return null;
}

export function findComponent(response, customId, expectedType = null) {
  if (!response || typeof response !== "object") return null;
  if (response.customId === customId && (!expectedType || response.type === expectedType)) return response;
  const component = Array.isArray(response.components) ? response.components.find((item) => item.customId === customId) : null;
  if (!component || (expectedType && component.type !== expectedType)) return null;
  return component;
}

export function normalizeModalFields(component, value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const fields = {};
  const allowed = new Map((component.fields || []).map((field) => [field.customId, field]));
  for (const [customId, rawValue] of Object.entries(value)) {
    const field = allowed.get(customId);
    if (!field || typeof rawValue !== "string" || rawValue.length > 2000) return null;
    fields[customId] = rawValue;
  }
  for (const field of component.fields || []) {
    if (field.required && !fields[field.customId]) return null;
  }
  return fields;
}

export function applicationPayload(application) {
  return application ? {
    id: application.id,
    name: application.name,
    description: application.description,
    createdAt: application.createdAt,
    updatedAt: application.updatedAt,
    bot: application.bot,
  } : null;
}
