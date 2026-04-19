---
name: research
description: Run deep research on any topic using the Copilot CLI's /research mode. Produces a detailed Markdown report with citations, code snippets, and architecture insights. Use when the user sends /research or asks for in-depth investigation of a topic.
allowed-tools: Bash(copilot:*)
---

# Deep Research with Copilot CLI

## When to use

Use this skill when:
- The user's message was routed as a `/research` command
- The user explicitly asks for deep research, investigation, or a detailed report on a topic

## How to run

Execute the Copilot CLI's research command inside the container:

```bash
copilot -p "/research $TOPIC" --no-interactive 2>/dev/null
```

If `--no-interactive` is not supported, use:

```bash
echo "/research $TOPIC" | copilot --no-interactive 2>/dev/null
```

If neither non-interactive flag works, fall back to running the research yourself using your available tools (WebSearch, WebFetch, agent-browser, Grep, Glob) to gather information, then compile a structured report.

## Fallback: Agent-driven research

If the Copilot CLI is not available or fails, conduct the research yourself:

1. **Web search** — Use WebSearch to find authoritative sources on the topic
2. **Browse** — Use agent-browser to read detailed pages, documentation, or articles
3. **Code search** — If the topic involves code, search GitHub or the local codebase
4. **Synthesize** — Compile findings into a structured Markdown report

## Output format

Always structure your response as a research report:

```
📋 **Research Report: [Topic]**

**Summary**
[2-3 sentence overview of key findings]

**Key Findings**
1. [Finding with citation/source]
2. [Finding with citation/source]
3. ...

**Details**
[Expanded discussion of each finding]

**Sources**
- [Source 1 URL or reference]
- [Source 2 URL or reference]
```

## Important notes

- Research reports can be long. Prioritize the most important findings in the summary.
- Always cite sources when possible.
- If the topic is too broad, focus on the most relevant aspects and suggest follow-up questions.
- The report will be sent back through the user's messaging channel (Slack, Telegram, etc.), so keep formatting compatible with plain text / basic Markdown.
