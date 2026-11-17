import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  inspectRecording,
  uploadRecording,
} from "../jarlic/skills/jarlic-attach-recording/scripts/upload-recording.mjs";

const bytes = Buffer.from("RIFF\u0004\u0000\u0000\u0000WAVE");
const policy = { maxBytes: bytes.length, extensions: [".wav"] };
async function fixture(t, initialStatus = "awaiting_upload") {
  const directory = await mkdtemp(join(tmpdir(), "jarlic-plugin-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, "review & follow-up.wav");
  await writeFile(file, bytes);
  const requests = [];
  let status = initialStatus;
  let failAttachment = false;
  let redirect = false;
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    requests.push({
      method: req.method,
      body: Buffer.concat(chunks),
      authorization: req.headers.authorization,
    });
    if (redirect) {
      res.writeHead(307, { location: "https://attacker.invalid/upload" });
      res.end();
      return;
    }
    if (req.method === "PUT") {
      status = "bytes_saved";
      if (failAttachment) {
        res.writeHead(503);
        res.end(JSON.stringify({ status: "attachment_unconfirmed" }));
        return;
      }
      status = "attached";
    }
    if (req.method === "POST") status = "attached";
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        uploadId: ticket.uploadId,
        projectId: "alpha",
        meetingId: "meeting-1",
        status,
      }),
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  );
  const expectedOrigin = `http://127.0.0.1:${server.address().port}`;
  const uploadId = randomUUID();
  const ticket = {
    uploadId,
    uploadUrl: `${expectedOrigin}/api/mcp/recording-upload?uploadId=${uploadId}`,
    uploadToken: "s".repeat(43),
    projectId: "alpha",
    meetingId: "meeting-1",
    filename: "review & follow-up.wav",
    size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
  return {
    file,
    ticket,
    expectedOrigin,
    requests,
    failAttachment: () => {
      failAttachment = true;
    },
    redirect: () => {
      redirect = true;
    },
  };
}

test("preflight reads the selected file and applies the server's exact size boundary", async (t) => {
  const f = await fixture(t);
  assert.deepEqual(await inspectRecording(f.file, policy), {
    filename: f.ticket.filename,
    size: 12,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
  await assert.rejects(
    inspectRecording(f.file, { ...policy, maxBytes: bytes.length - 1 }),
  );
  await assert.rejects(
    inspectRecording(f.file, { ...policy, extensions: [".mp3"] }),
  );
});

test("uploads binary directly with the operation token and skips an attached recording", async (t) => {
  const f = await fixture(t);
  assert.equal((await uploadRecording(f)).status, "attached");
  assert.equal((await uploadRecording(f)).status, "attached");
  assert.deepEqual(
    f.requests.map(({ method }) => method),
    ["GET", "PUT", "GET"],
  );
  assert.deepEqual(f.requests[1].body, bytes);
  assert.equal(f.requests[1].authorization, `Bearer ${f.ticket.uploadToken}`);
});

test("finishes a saved upload after an uncertain attachment without resending bytes", async (t) => {
  const f = await fixture(t);
  f.failAttachment();
  await assert.rejects(
    uploadRecording(f),
    (error) => !error.message.includes(f.ticket.uploadToken),
  );
  assert.equal((await uploadRecording(f)).status, "attached");
  assert.deepEqual(
    f.requests.map(({ method }) => method),
    ["GET", "PUT", "GET", "POST"],
  );
});

test("refuses a different origin or redirect before transmitting recording bytes", async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    uploadRecording({ ...f, expectedOrigin: "https://different.invalid" }),
  );
  assert.equal(f.requests.length, 0);
  f.redirect();
  await assert.rejects(uploadRecording(f));
  assert.deepEqual(
    f.requests.map(({ method }) => method),
    ["GET"],
  );
});

test("refuses a changed local recording before upload", async (t) => {
  const f = await fixture(t);
  await writeFile(f.file, Buffer.alloc(bytes.length));
  await assert.rejects(uploadRecording(f));
  assert.deepEqual(
    f.requests.map(({ method }) => method),
    ["GET"],
  );
});

test("rejects a filename that the server would normalize before a combined create", async (t) => {
  const f = await fixture(t);
  const file = join(f.file, "..", " leading.wav");
  await writeFile(file, bytes);
  await assert.rejects(inspectRecording(file, policy));
});

test("the CLI handles structured file arguments and does not print malformed-ticket secrets", async (t) => {
  const f = await fixture(t);
  const script = fileURLToPath(
    new URL(
      "../jarlic/skills/jarlic-attach-recording/scripts/upload-recording.mjs",
      import.meta.url,
    ),
  );
  const inspected = spawnSync(
    process.execPath,
    [script, "inspect", "--file", f.file, "--policy", JSON.stringify(policy)],
    { encoding: "utf8" },
  );
  assert.equal(inspected.status, 0);
  assert.equal(JSON.parse(inspected.stdout).filename, "review & follow-up.wav");
  const secret = "synthetic-private-upload-token";
  const ticketFile = join(f.file, "..", "private-ticket.json");
  await writeFile(ticketFile, `{"uploadToken":"${secret}" invalid-json`);
  const failed = spawnSync(
    process.execPath,
    [script, "upload", "--file", f.file, "--ticket-file", ticketFile],
    { encoding: "utf8" },
  );
  assert.equal(failed.status, 1);
  assert.ok(!failed.stderr.includes(secret));
  assert.equal(f.requests.length, 0);
});
