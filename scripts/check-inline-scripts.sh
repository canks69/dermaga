#!/bin/sh
# Fails if any HTML inside the packaged app carries an inline <script>.
#
# The app serves itself under `default-src 'self'`, which blocks inline
# scripts. An inline <script> therefore does nothing at all once packaged --
# silently, with no error the user or the developer ever sees. Development
# applies no policy, so it works there and only there, which is exactly how the
# splash shipped inert through several releases.
#
#   usage: scripts/check-inline-scripts.sh path/to/App.app
set -eu

app="${1:?usage: check-inline-scripts.sh <app bundle>}"
# Absolute, because reading each file happens from a temporary directory.
asar="$(cd "$(dirname "$app")" && pwd)/$(basename "$app")/Contents/Resources/app.asar"

[ -f "$asar" ] || { echo "FAIL: no app.asar in $app"; exit 1; }

found=0

for file in $(npx --no-install asar list "$asar" | grep '\.html$'); do
	# `asar extract-file` writes to the working directory, so read through a
	# temporary directory and clean up after.
	dir=$(mktemp -d)
	(cd "$dir" && npx --no-install asar extract-file "$asar" "${file#/}")

	# An opening <script> followed by anything other than its closing tag. The
	# character class excludes "<" deliberately: without that, `<script
	# src="x"></script>` matches its own closing bracket and every external
	# script is reported as inline.
	if tr '\n' ' ' < "$dir/$(basename "$file")" | grep -qE '<script[^>]*>[[:space:]]*[^<[:space:]]'; then
		echo "FAIL: $file has an inline <script>, which the app's CSP blocks"
		found=1
	fi

	rm -rf "$dir"
done

if [ "$found" -eq 1 ]; then
	echo "      Move it to its own file and load it with <script src=\"…\">."
	exit 1
fi

echo "check-inline-scripts: no inline scripts in the bundle"
