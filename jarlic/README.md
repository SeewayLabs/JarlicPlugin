# Jarlic plugin

This package connects to the hosted Jarlic staging MCP endpoint. See the [repository README](../README.md) for installation and access requirements.

The Project context skill guides Project selection, source inspection and cited
answers. The Meeting creation skill records explicitly requested Meetings. The
Recording skill uses Codex desktop's local tools and the bundled Node.js helper
to attach a selected local recording without opening Jarlic's website.

The Jarlic backend enforces authentication, Project access, upload authorization,
and immutable source storage. Recording upload requires its matching backend
release, separate consent, and Node.js 22 or later on the desktop. It does not
start transcription or analysis. See the repository README for availability and
verification limits. The package contains no backend source or credentials.
