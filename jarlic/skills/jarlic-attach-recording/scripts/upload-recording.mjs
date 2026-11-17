import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { open, readFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

class RecordingUploadError extends Error {}

export async function inspectRecording(file, policy) {
  if (
    !Number.isSafeInteger(policy.maxBytes) ||
    policy.maxBytes <= 0 ||
    !Array.isArray(policy.extensions)
  )
    throw new RecordingUploadError(
      "A current Jarlic recording upload policy is required.",
    );
  const filename = basename(file);
  if (
    !filename ||
    filename.trim() !== filename ||
    filename.length > 120 ||
    /[\\/\x00-\x1f\x7f]/.test(filename) ||
    !policy.extensions.includes(extname(filename).toLowerCase())
  )
    throw new RecordingUploadError(
      "The selected Recording filename or format is unsupported.",
    );
  const handle = await open(file, "r");
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.size <= 0 || before.size > policy.maxBytes)
      throw new RecordingUploadError(
        "Select a non-empty Recording within Jarlic's upload size limit.",
      );
    const hash = createHash("sha256");
    let size = 0;
    for await (const chunk of handle.createReadStream({ autoClose: false })) {
      size += chunk.length;
      hash.update(chunk);
    }
    const after = await handle.stat();
    if (
      size !== before.size ||
      after.size !== before.size ||
      after.mtimeMs !== before.mtimeMs
    )
      throw new RecordingUploadError(
        "The Recording changed while being inspected. Try again after it finishes saving.",
      );
    return { filename, size, sha256: hash.digest("hex") };
  } finally {
    await handle.close();
  }
}

export async function uploadRecording({ file, ticket, expectedOrigin }) {
  const url = new URL(ticket.uploadUrl);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    !/^[0-9a-f-]{36}$/.test(ticket.uploadId) ||
    url.origin !== expectedOrigin ||
    (url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
    url.username ||
    url.password ||
    url.hash ||
    url.pathname !== "/api/mcp/recording-upload" ||
    url.searchParams.get("uploadId") !== ticket.uploadId ||
    [...url.searchParams.keys()].length !== 1 ||
    !/^[A-Za-z0-9_-]{43}$/.test(ticket.uploadToken)
  )
    throw new RecordingUploadError(
      "The upload ticket does not match the configured Jarlic server.",
    );
  const headers = { authorization: `Bearer ${ticket.uploadToken}` };
  async function call(method, body) {
    const response = await fetch(url, {
      method,
      redirect: "error",
      signal: AbortSignal.timeout(10 * 60_000),
      headers: {
        ...headers,
        ...(body
          ? {
              "content-length": String(ticket.size),
              "content-type": "application/octet-stream",
            }
          : {}),
      },
      ...(body ? { body, duplex: "half" } : {}),
    });
    const result = await response.json();
    if (!response.ok)
      throw new RecordingUploadError(
        `Jarlic upload returned ${response.status}. Check upload ${ticket.uploadId} through the plugin before retrying.`,
      );
    if (
      result.uploadId !== ticket.uploadId ||
      result.projectId !== ticket.projectId ||
      result.meetingId !== ticket.meetingId
    )
      throw new RecordingUploadError(
        "Jarlic returned a different upload identity. Check the original upload through the plugin.",
      );
    return result;
  }
  const current = await call("GET");
  if (current.status === "attached") return current;
  if (current.status === "bytes_saved") return call("POST");
  if (current.status !== "awaiting_upload")
    throw new RecordingUploadError(
      "Check the upload state through the Jarlic plugin before retrying.",
    );
  const inspected = await inspectRecording(file, {
    maxBytes: ticket.size,
    extensions: [extname(ticket.filename).toLowerCase()],
  });
  if (
    inspected.filename !== ticket.filename ||
    inspected.size !== ticket.size ||
    inspected.sha256 !== ticket.sha256
  )
    throw new RecordingUploadError(
      "The selected Recording does not match the upload ticket. Inspect it again through the plugin.",
    );
  return call("PUT", createReadStream(file));
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      file: { type: "string" },
      policy: { type: "string" },
      "ticket-file": { type: "string" },
    },
  });
  if (positionals.length !== 1 || !values.file)
    throw new RecordingUploadError(
      "Use inspect --file PATH --policy POLICY_JSON or upload --file PATH --ticket-file PRIVATE_JSON.",
    );
  if (positionals[0] === "inspect") {
    return inspectRecording(values.file, JSON.parse(values.policy ?? "null"));
  }
  if (positionals[0] !== "upload" || !values["ticket-file"])
    throw new RecordingUploadError(
      "Select inspect or upload with the required arguments.",
    );
  const config = JSON.parse(
    await readFile(new URL("../../../mcp.json", import.meta.url), "utf8"),
  );
  const expectedOrigin = new URL(config.mcpServers.jarlic.url).origin;
  const ticket = JSON.parse(await readFile(values["ticket-file"], "utf8"));
  return uploadRecording({ file: values.file, ticket, expectedOrigin });
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  try {
    process.stdout.write(`${JSON.stringify(await main())}\n`);
  } catch (error) {
    const safe =
      error instanceof RecordingUploadError
        ? error.message
        : "Recording upload could not be confirmed. Check its uploadId through the Jarlic plugin before retrying.";
    process.stderr.write(`${safe}\n`);
    process.exitCode = 1;
  }
}
