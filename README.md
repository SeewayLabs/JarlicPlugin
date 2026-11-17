# Jarlic plugin

A plugin for OpenAI and Claude that connects to the hosted Jarlic MCP service.
It includes Project research, Meeting creation, and a Codex desktop workflow
for attaching local recordings. The application backend and Project data remain
in Azure.

## Install

Add `https://github.com/SeewayLabs/JarlicPlugin` as a marketplace in the app, then install **Jarlic** and connect your Jarlic account.

For Codex marketplace registration:

```powershell
codex plugin marketplace add SeewayLabs/JarlicPlugin
```

For Claude Code:

```powershell
claude plugin marketplace add SeewayLabs/JarlicPlugin
claude plugin install jarlic@jarlic-local
```

The marketplace catalogs live at `.agents/plugins/marketplace.json` and `.claude-plugin/marketplace.json`. Both point to the plugin in `jarlic/`.

## Environment and access

This package uses **Jarlic staging** at
`https://app-jarlic-stg-web.azurewebsites.net/api/mcp`. It requires an approved
Jarlic account and access to the selected Project. Research uses
`jarlic:project-context:read`; Meeting creation uses `jarlic:meetings:create`.
The new Recording workflow requires the matching backend release and renewed
`jarlic:meetings:recordings:write` consent. Installing this package does not
deploy the backend, grant Project access, or expand an existing OAuth grant.

## Create a Meeting and attach a recording

In Codex desktop, ask Jarlic to create a completed Meeting in a named Project
with a title and date and attach a recording at a specific local path. The
workflow checks the local file, creates or selects the Meeting, transfers the
recording directly to Jarlic, and confirms attachment in the conversation.
It does not start transcription or analysis.

This workflow requires local file access and Node.js 22 or later. Its short-lived
upload authorization is limited to one Meeting, filename, size and checksum.
For an interrupted upload, keep its `uploadId`; retries reuse the saved Meeting
and skip recording bytes already stored. Existing sources require explicit
replacement. The recording helper refuses a server origin different from the
one in `jarlic/mcp.json` and does not follow redirects.

Local automated checks do not prove deployed account linking, the real Codex
conversation, or media transfer at the hosted size limit. Record those checks
against the exact backend release before claiming hosted availability. Recording
upload is scoped to Codex desktop; other hosts are outside its current acceptance.

## Development

Edit the package under `jarlic/` and keep its OpenAI and Claude manifest versions aligned. Validate JSON and the plugin before publishing an update. No credentials belong in this repository.

Run `node --test tests/*.test.mjs` for the local file and binary-transfer checks.
CI also validates the manifests and runs these checks on Windows and Linux
with Node.js 22 and 24. It does not contact the hosted Jarlic service.
