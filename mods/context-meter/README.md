# context-meter

What fills your context window, and an auto-compact of your own: your threshold, ask-first or automatic, and the summary style you want.

## Install

```bash
claude plugin marketplace add Zovaris/claude-mods
```

```bash
claude plugin install context-meter@claude-mods
```

Or from `/mods`, if you have [mod-manager](../../mods/mod-manager). It loads in your next session.

## The row above the prompt

A slim bar split by what fills the window (system prompt, tools, MCP tools, memory files, skills, agents, messages), the share used, a state (**roomy**, **filling**, **getting full**, **compacts soon**, **compacting next**), and a mark where compaction kicks in: your threshold, or Claude Code's own.

## The pane

`/context-meter`, or **Details** on the row:

- the window used and what's free before auto-compact;
- every category with its tokens and share;
- memory files with their paths;
- MCP tools per server, with how many are loaded;
- the skills and agents listings;
- **Auto-compact** settings;
- **Compact now**, with an optional focus for what the summary should keep.

## Auto-compact, your way

Claude Code compacts on its own near the end of the window. context-meter adds:

- **A threshold of your own.** 20%, 35%, 50%, 65% or 80% from the pane, or any number from 5 to 95 from the prompt.
- **Ask first, or don't.** At the threshold it asks: compact now, ask again 10 points later, or not this session. Anything typed under **Other** becomes the summary's focus. Or it compacts without asking.
- **A summary style.** *Handoff* (goal, decisions and why, files, next steps), *Keep the code details* (paths, names, errors and commands verbatim), or your own text. By default the style also applies to `/compact` and Claude Code's own auto-compact.

Claude Code's own auto-compact stays on as a safety net.

## From the prompt

```
/context-meter auto 50        compact at 50% of the window
/context-meter auto off       turn it off
/context-meter ask            ask first at the threshold
/context-meter compact        compact without asking
/context-meter style handoff  default, handoff, code or custom
```

Settings are kept across sessions.

## Where it works

Terminal and desktop app.

## Known limits

- The breakdown is the one `/context` draws, estimated locally after each turn (no extra requests).
- Where an organization's security plugin answers compaction first, the summary style reaches only the compactions context-meter starts, not `/compact` or Claude Code's own. The meter still updates after every compaction.
