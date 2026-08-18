#!/bin/sh
# Builds release notes from the commits between the previous tag and this one.
#
# GitHub's own --generate-notes reads pull requests, and this project commits
# straight to main, so it produces an empty list. This reads the commits instead
# and groups them by their conventional-commit prefix.
#
#   usage: scripts/release-notes.sh v1.1.0
set -eu

tag="${1:?usage: release-notes.sh <tag>}"

# Works before the tag exists, so the notes can be read before cutting the
# release they describe: an unknown tag means "everything since the last one".
if git rev-parse -q --verify "$tag^{commit}" >/dev/null 2>&1; then
	head="$tag"
	prev=$(git describe --tags --abbrev=0 "$tag^" 2>/dev/null || true)
else
	head="HEAD"
	prev=$(git describe --tags --abbrev=0 2>/dev/null || true)
fi

if [ -n "$prev" ]; then
	range="$prev..$head"
else
	range="$head"
fi

# One `hash<tab>subject` per line, newest first, merges left out.
log=$(git log --no-merges --format='%h%x09%s' "$range")

section() {
	pattern="$1"
	heading="$2"

	body=$(printf '%s\n' "$log" | grep -E "	${pattern}(\([^)]*\))?!?: " || true)
	[ -n "$body" ] || return 0

	printf '### %s\n\n' "$heading"
	printf '%s\n' "$body" |
		sed -E 's/^([0-9a-f]+)\t[a-z]+(\([^)]*\))?!?: (.*)$/- \3 (`\1`)/'
	printf '\n'
}

section 'feat' 'Features'
section 'fix' 'Bug fixes'
section 'perf' 'Performance'
section 'docs' 'Documentation'

# Anything left over, minus the release commit itself, which says nothing a
# reader of the release notes does not already know.
rest=$(printf '%s\n' "$log" |
	grep -Ev "	(feat|fix|perf|docs|release)(\([^)]*\))?!?: " || true)

if [ -n "$rest" ]; then
	printf '### Maintenance\n\n'
	printf '%s\n' "$rest" |
		sed -E 's/^([0-9a-f]+)\t([a-z]+(\([^)]*\))?!?: )?(.*)$/- \4 (`\1`)/'
	printf '\n'
fi

repo=$(git remote get-url origin 2>/dev/null |
	sed -E 's#^(git@github\.com:|https://github\.com/)##; s#\.git$##')

if [ -n "$repo" ] && [ -n "$prev" ]; then
	printf '**Full Changelog**: https://github.com/%s/compare/%s...%s\n' "$repo" "$prev" "$tag"
fi
