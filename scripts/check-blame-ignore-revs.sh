#!/usr/bin/env bash
# Every revision in .git-blame-ignore-revs must still be an ancestor of HEAD.
# A rebase that drops one makes git blame ignore the wrong commit. Merging
# main forward keeps the listed commits reachable, so this stays green.
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
file="$root/.git-blame-ignore-revs"
found=0
while IFS= read -r line || [[ -n "$line" ]]; do
  sha=${line%%#*}
  sha=${sha//[[:space:]]/}
  [[ -z "$sha" ]] && continue
  found=1
  if ! git -C "$root" merge-base --is-ancestor "$sha" HEAD; then
    echo "blame ignore revision is not an ancestor of HEAD: $sha" >&2
    exit 1
  fi
done < "$file"
if [[ "$found" -ne 1 ]]; then
  echo "no revisions listed in .git-blame-ignore-revs" >&2
  exit 1
fi
echo "blame ignore revisions are ancestors of HEAD"
