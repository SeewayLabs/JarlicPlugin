---
name: jarlic-project-context
description: Search an authorized Jarlic project, inspect its sources, and answer questions with evidence. Use when a user asks about project context, meetings, documents, or plans in Jarlic.
---

# Jarlic project context

1. Use the Jarlic MCP connection. List accessible projects and establish the intended project; ask if ambiguous. Never search across projects by assumption.
2. Search the selected project with `search_project_context` and a focused query. Follow returned `nextRead` instructions with the same project ID to inspect relevant original evidence.
3. Cite the focused source reads. Distinguish accepted project context, source text, and structured plan state. Report missing coverage, truncation, and unprocessed material; do not claim an exhaustive search without evidence.
4. Keep this workflow read-only. Do not create or modify project data unless the user separately requests it and the relevant tool and permission are available.
