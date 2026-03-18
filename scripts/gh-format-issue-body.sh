#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<USAGE
Usage:
  scripts/gh-format-issue-body.sh --issue <number> --body-file <path> [--repo <owner/repo>] [--title <new title>]

Purpose:
  Update a GitHub issue body from a markdown file using gh CLI, preserving formatting.

Examples:
  scripts/gh-format-issue-body.sh --repo My-Slops/writespark --issue 1 --body-file .github/issue-bodies/issue-1.md
  scripts/gh-format-issue-body.sh --issue 2 --body-file /tmp/body.md --title "Milestone 2: Locking"
USAGE
}

REPO=""
ISSUE=""
BODY_FILE=""
TITLE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo)
      REPO="${2:-}"
      shift 2
      ;;
    --issue)
      ISSUE="${2:-}"
      shift 2
      ;;
    --body-file)
      BODY_FILE="${2:-}"
      shift 2
      ;;
    --title)
      TITLE="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "$ISSUE" || -z "$BODY_FILE" ]]; then
  echo "Error: --issue and --body-file are required." >&2
  usage
  exit 1
fi

if [[ ! -f "$BODY_FILE" ]]; then
  echo "Error: body file not found: $BODY_FILE" >&2
  exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "Error: gh CLI is required but not found." >&2
  exit 1
fi

ARGS=(issue edit "$ISSUE" --body-file "$BODY_FILE")
if [[ -n "$REPO" ]]; then
  ARGS+=(--repo "$REPO")
fi
if [[ -n "$TITLE" ]]; then
  ARGS+=(--title "$TITLE")
fi

echo "Updating issue #$ISSUE from $BODY_FILE..."
gh "${ARGS[@]}"
echo "Done."
