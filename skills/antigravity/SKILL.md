---
name: antigravity
description: Safe execution and control of the Antigravity CLI ('agy') tool, specialized subagents, MCP servers, and background coding workflows. Use when delegating deep coding tasks, inspecting available models, managing plugins, or executing /agy commands.
license: MIT
---

# Antigravity CLI ('agy') Agent Skill

This skill guides Pi on when, why, and how to safely invoke the **Antigravity CLI (`agy`)** tool and its corresponding slash command `/agy`.

---

## 1. Overview & Capabilities

The `agy` extension exposes the full power of the Antigravity agentic engine to Pi:
- **Direct Tool Invocation (`agy`)**: The agent can run `agy` commands programmatically via discrete argument arrays.
- **Interactive Slash Command (`/agy`)**: Users can trigger commands directly in Pi's terminal UI with autocompletion and interactive menu pickers.
- **Model Discovery & Switching**: Check available models, thinking budgets, and provider quotas.
- **Autonomous Task Delegation**: Dispatch complex, long-running sub-tasks to `agy` in non-interactive batch mode (`-p`).
- **Plugin & MCP Management**: Inspect configured plugins, MCP servers, and connected developer tools.

---

## 2. When to Use the `agy` Tool

Use the `agy` tool when:
1. **Delegating Complex Sub-tasks**: A task requires deep exploratory analysis or independent file edits that would clutter Pi's immediate context window.
2. **Checking Platform Models**: You need to discover available LLMs, context window limits, or reasoning levels supported by Antigravity (`agy models`).
3. **Inspecting Plugins & MCP Tools**: You need to know what custom MCP tools or IDE plugins are available in the developer's environment (`agy mcp list`, `agy plugin list`).
4. **Platform Diagnostics & Changelogs**: Verifying Antigravity updates or release notes (`agy changelog`).

Do **NOT** use `agy` for:
- Basic file operations (use Pi's built-in `read`, `write`, or `edit` tools).
- Simple shell utilities like `git status` or `npm test` (use standard bash execution).

---

## 3. Tool Parameters & Schema

The `agy` tool accepts the following parameters:

```json
{
  "args": ["plugin", "list"],
  "timeout": 60,
  "cwd": "/path/to/project"
}
```

- **`args` (string[], required)**: Array of discrete CLI tokens. **Never** include a shell string or redundant leading `"agy"`.
  - *Correct*: `["models"]`, `["-p", "Analyze memory leak in auth worker", "--model", "gemini-3.8-flash-high"]`
  - *Incorrect*: `["agy models"]`, `["-p 'Analyze memory leak'"]`
- **`timeout` (number, optional)**: Timeout in seconds (default: 60s, max: 600s).
- **`cwd` (string, optional)**: Working directory for execution (defaults to active session directory).

---

## 4. Common Command Recipes

### List Available Models
```json
{
  "args": ["models"]
}
```

### List Configured MCP Servers
```json
{
  "args": ["mcp", "list"]
}
```

### List Installed Plugins
```json
{
  "args": ["plugin", "list"]
}
```

### Delegate Non-Interactive Task with Output
```json
{
  "args": [
    "-p",
    "Audit src/auth/session.ts for timing attack vulnerabilities. Output findings in markdown table.",
    "--output-format",
    "text"
  ],
  "timeout": 180
}
```

### View Platform Changelog
```json
{
  "args": ["changelog"]
}
```

---

## 5. Execution Rules & Safety Protocols

1. **Non-Interactive Execution**:
   - `agy` commands are spawned with `stdio: ["ignore", "pipe", "pipe"]`.
   - Never run commands that prompt for interactive user input without passing the appropriate bypass or batch flags.
2. **No Subshell Evaluation**:
   - Direct process execution is enforced (`shell: false`). Shell operators (`|`, `>`, `&&`, `;`) are not parsed.
   - Do not attempt shell piping inside `args`. If pipe processing is needed, run `agy` first and process the output in the next step.
3. **Handling Truncation & Large Outputs**:
   - Output exceeding **2,000 lines** or **50 KB** is automatically truncated by the extension.
   - The full output is written to a temporary log file (e.g., `/tmp/pi-agy-.../output.log`).
   - If `details.truncated` is `true`, read the referenced log file using Pi's `read` tool to inspect specific sections.
4. **Process Cleanup & Timeouts**:
   - Long-running delegations should set an explicit `timeout` up to 600 seconds.
   - If a command times out or is canceled by the user, the extension automatically sends `SIGTERM` followed by `SIGKILL` to ensure no orphaned processes remain.
