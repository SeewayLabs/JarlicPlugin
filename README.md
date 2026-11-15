# Jarlic plugin

A plugin for OpenAI and Claude that connects to the hosted Jarlic MCP service. The package includes a project-context skill, connection settings and the Jarlic logo. The application backend and project data remain in Azure.

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

This initial package uses **Jarlic staging** at `https://app-jarlic-stg-web.azurewebsites.net/api/mcp`. It requires an approved Jarlic account, access to the selected project and `jarlic:project-context:read` consent. Installation does not grant project access or deploy the service. The initial skill guides read-only project research.

Package validation has passed locally. Account linking and live tool calls through this package still need verification in each host. Claude account linking is not yet verified.

## Development

Edit the package under `jarlic/` and keep its OpenAI and Claude manifest versions aligned. Validate JSON and the plugin before publishing an update. No credentials belong in this repository.
