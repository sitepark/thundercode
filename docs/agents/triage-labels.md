# Triage Labels

The skills speak in terms of five canonical triage roles. In this repo they are
GitHub labels on <https://github.com/sitepark/thundercode/issues>, and the
label strings are the role names verbatim.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the
corresponding label string from this table.

Apply and change them with `gh`:

```sh
gh issue edit <number> --add-label ready-for-agent --remove-label needs-triage
```

Exactly one of these should be set at a time — they are states, not tags. The
five are exhaustive: an open issue with none of them has not been triaged, which
is what `needs-triage` exists to say out loud.
