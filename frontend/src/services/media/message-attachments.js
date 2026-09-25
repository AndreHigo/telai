export const MAX_MESSAGE_ATTACHMENTS = 4;
export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
export const MAX_MESSAGE_ATTACHMENTS_BYTES = 20 * 1024 * 1024;

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    reader.readAsDataURL(file);
  });
}

export async function readMessageAttachments(files, currentCount = 0, currentBytes = 0) {
  const available = Math.max(0, MAX_MESSAGE_ATTACHMENTS - currentCount);
  let totalBytes = currentBytes;
  const next = [];
  for (const file of [...files].slice(0, available)) {
    if (file.size > MAX_ATTACHMENT_BYTES) throw new Error("Cada anexo pode ter no máximo 8 MB.");
    totalBytes += file.size;
    if (totalBytes > MAX_MESSAGE_ATTACHMENTS_BYTES) throw new Error("Os anexos desta mensagem podem ter no máximo 20 MB.");
    if (!file.type) throw new Error("Não foi possível identificar o tipo deste arquivo.");
    next.push({ name: file.name, type: file.type, size: file.size, data: await readAsDataUrl(file) });
  }
  return next;
}
