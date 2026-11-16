# tool-toggle

Turn claude.ai connectors, MCP servers, single tools and skills on and off, from a pane or from the prompt.

## Install

```bash
claude plugin marketplace add Zovaris/claude-mods
```

```bash
claude plugin install tool-toggle@claude-mods
```

Or from `/mods`, if you have [mod-manager](../../mods/mod-manager). It loads in your next session.

## The pane

`/tools` opens a pane with everything the session can use, in sections you can fold: **Connectors**, **MCP servers**, **App servers**, **Built-in tools** and **Skills**, with a search box. Skills are grouped by where they come from, and a whole group can be switched at once.

## How each kind is switched

| Kind | What happens when it's off |
| --- | --- |
| Connectors (claude.ai) | Switched off for real in the desktop app, the same switch as **+** › **Connectors**, so their tools leave the model's list. Applies when the turn ends. |
| MCP servers and single tools | Blocked: the model still sees them, but a call is denied with a reason it can act on. |
| Skills | Denied at the Skill tool, with a notice when run by name, and left out of the skill listing. |

## From the prompt

```
/tools                 open the pane
/tools off gmail       a connector or server, by name
/tools off Bash        a single tool
/tools off commit      a skill (skill:commit when a tool shares the name)
/tools on gmail        turn it back on
/tools list            what's off
```

Blocks are kept across sessions.

## Where it works

Terminal and desktop app. In the terminal, connectors are blocked rather than switched off: their tools stay listed but can't run.

## Known limits

- Where an organization's security plugin handles the skill listing first, a skill that's off stays listed, but still can't run.
