# mod-manager

`/mods`: every installed mod, theme and plugin in one pane, to turn on and off, update and install.

## Install

```bash
claude plugin marketplace add Zovaris/claude-mods
```

```bash
claude plugin install mod-manager@claude-mods
```

It loads in your next session.

## The pane

**Mods**, **Themes** and **Other plugins**, each with its version and marketplace, plus what your marketplaces offer that you haven't installed.

- **Enable** or **Disable** any of them.
- **Update** when the marketplace has a newer version; **Check for updates** pulls your marketplaces first.
- **Install** from the **Available** section.
- **Themes are one at a time.** Turning one on turns the others off, and the look switches right away when the session has that theme loaded.
- **Reload plugins** loads a change in the current session. Sessions that can't reload plugins (the desktop app's) load it in the next one, and the pane says so.

## How it works

It reads Claude Code's own files and writes none: every change goes through the `claude plugin` command, from your PATH or the desktop app's own copy on macOS. If it can't find the command, the command is copied to your clipboard to run yourself.

## Where it works

Terminal and desktop app.
