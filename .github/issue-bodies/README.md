# Issue Body Templates

Use these markdown files with:

```bash
scripts/gh-format-issue-body.sh --repo My-Slops/writespark --issue <n> --body-file .github/issue-bodies/issue-<n>.md
```

This avoids malformed formatting (e.g. literal `\n`) when editing issues via CLI.
