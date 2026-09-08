# Issue tracker: GitHub Issues

Issues for this repo live at
<https://github.com/sitepark/thundercode/issues>. That is the only tracker —
bug reports from colleagues and work items for agents land in the same place,
because a split tracker means one half goes unread.

Use the `gh` CLI. It is authenticated in the environments this repo is worked
on, and it avoids scraping HTML.

## Conventions

- One issue per work item. A feature that needs decomposing becomes a parent
  issue plus one issue per ticket, each linked back to the parent.
- Triage state is a label, not a line in the body. See `triage-labels.md` for
  the five canonical labels.
- Conversation is the issue's comment thread. Do not maintain a parallel
  `## Comments` section in the body.
- The body is for the current state of the request. Edit it when the
  understanding changes rather than appending corrections.

## When a skill says "publish to the issue tracker"

```sh
gh issue create --title "<title>" --body "<body>" --label needs-triage
```

New issues start at `needs-triage` unless the skill says otherwise.

## When a skill says "fetch the relevant ticket"

```sh
gh issue view <number> --comments
```

The user will normally pass the issue number or URL directly.

## Finding work

```sh
gh issue list --label ready-for-agent --state open
```

## Wayfinding operations

Used by `/wayfinder`. This is *not* the issue tracker: a wayfinding map is
throwaway working state for a single exploration, and it stays local and
uncommitted rather than becoming public issues that outlive the question.

- **Map**: `.scratch/<effort>/map.md` (the Notes / Decisions-so-far / Fog body).
- **Child ticket**: `.scratch/<effort>/issues/NN-<slug>.md`, numbered from `01`,
  with the question in the body. A `Type:` line records the ticket type
  (`research`/`prototype`/`grilling`/`task`); a `Status:` line records
  `claimed`/`resolved`.
- **Blocking**: a `Blocked by: NN, NN` line near the top. A ticket is unblocked
  when every file it lists is `resolved`.
- **Frontier**: scan `.scratch/<effort>/issues/` for files that are open,
  unblocked, and unclaimed; first by number wins.
- **Claim**: set `Status: claimed` and save before any work.
- **Resolve**: append the answer under an `## Answer` heading, set
  `Status: resolved`, then append a context pointer (gist + link) to the map's
  Decisions-so-far in `map.md`.

If an exploration produces work worth doing later, open a GitHub issue for it.
Do not leave it in `.scratch/`.
