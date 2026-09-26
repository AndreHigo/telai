import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

function safeExtension(mimeType) {
  const extension = String(mimeType || "bin").split("/", 2)[1]?.replace(/[^a-z0-9]/gi, "").slice(0, 8);
  return extension ? `.${extension}` : ".bin";
}

export function createAttachmentScanner({ command = "", timeoutMs = 15_000, tempDir = os.tmpdir() } = {}) {
  const executable = String(command || "").trim();
  if (!executable) return { mode: "disabled", async scan() { return { clean: true, skipped: true }; } };

  async function scan({ buffer, mimeType } = {}) {
    const filePath = path.join(tempDir, `telai-attachment-${randomUUID()}${safeExtension(mimeType)}`);
    await fs.writeFile(filePath, buffer, { flag: "wx", mode: 0o600 });
    try {
      const result = await new Promise((resolve, reject) => {
        const child = spawn(executable, ["--no-summary", filePath], { windowsHide: true, shell: false });
        let stderr = "";
        const timer = setTimeout(() => {
          child.kill();
          const error = new Error("attachment-scan-timeout");
          error.code = "attachment-scan-timeout";
          reject(error);
        }, Math.max(1_000, Number(timeoutMs) || 15_000));
        child.stderr?.on("data", (chunk) => { stderr += String(chunk); });
        child.on("error", (error) => { clearTimeout(timer); reject(error); });
        child.on("close", (code) => {
          clearTimeout(timer);
          if (code === 0) return resolve({ clean: true, skipped: false });
          if (code === 1) return resolve({ clean: false, skipped: false, infected: true });
          const error = new Error("attachment-scan-failed");
          error.code = "attachment-scan-failed";
          error.details = stderr.slice(0, 500);
          reject(error);
        });
      });
      if (!result.clean) {
        const error = new Error("attachment-infected");
        error.code = "attachment-infected";
        throw error;
      }
      return result;
    } finally {
      await fs.rm(filePath, { force: true }).catch(() => {});
    }
  }

  return { mode: "command", command: executable, scan };
}
