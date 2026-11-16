# usage-bar

Your plan's usage windows above the prompt, with where an even pace would be and how much you can still use per day.

## Install

```bash
claude plugin marketplace add Zovaris/claude-mods
```

```bash
claude plugin install usage-bar@claude-mods
```

Or from `/mods`, if you have [mod-manager](../../mods/mod-manager). It loads in your next session.

## The row above the prompt

Each window your plan reports: `5h`, `Week`, and a model's own week when your plan has one. Each has a slim bar with a mark where an even pace would be now, its percentage, a state, and the time to its reset.

| State | When |
| --- | --- |
| under pace | more than 3 points below an even pace |
| on pace | within 3 points |
| over pace | 3 to 15 points above |
| well over pace | more than 15 points above |
| nearly full | 90% or more |
| limit reached | 100% |

## The pane

`/limits`, or **Details** on the row. For each window:

- when it started and when it resets;
- where an even pace would be now, and how far over or under you are;
- how much you can use **per day** (weekly windows) or **per hour** (the 5-hour window) to last until the reset;
- what you've used today, and when you'd run out at the current pace.

## Where it works

Terminal and desktop app. Needs a Claude subscription: an API key reports no windows.

## Notes

Windows come from the latest API reply and refresh every minute. "Today" starts at the first reading on your local day.
