## Agent skills

### Issue tracker

Issues live in GitHub Issues at `sitepark/thundercode`, reached with the `gh`
CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical roles, used verbatim as GitHub label names. See
`docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/), because
`CHANGELOG.md` is generated from them by git-cliff. `feat` and `fix` are the
two types that reach the changelog, so their subjects are user-facing prose,
not notes to the next reader of `git log`. See the Commit messages section of
`README.md` for the type and scope list.

## Releasing

`manifest.json` holds the version; everything else follows it. See the
Releasing section of `README.md` for the commit-and-tag ritual, and
`docs/release-checklist.md` for the hands-on checks that the test suite cannot
make.
