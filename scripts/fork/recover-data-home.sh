#!/usr/bin/env bash
set -euo pipefail
shopt -s nullglob

task_home="${HOME:?}"
apply=false
while [[ $# -gt 0 ]]; do
	case "$1" in
		--apply) apply=true; shift ;;
		--home) task_home="${2:?Missing home directory}"; shift 2 ;;
		*) echo "Usage: $0 [--apply] [--home DIRECTORY]" >&2; exit 1 ;;
	esac
done

canonical="$task_home/.superset-fork"
displaced="$task_home/.paradev-fork"
if [[ -L "$displaced" && "$(cd "$displaced" && pwd -P)" == "$(cd "$canonical" && pwd -P)" ]]; then
	echo "Already recovered: $displaced points to $canonical"
	exit 0
fi
if [[ ! -f "$canonical/local.db" || ! -d "$displaced" || -L "$displaced" ]]; then
	echo "Expected existing data in $canonical and a separate directory at $displaced." >&2
	exit 1
fi
if [[ -e "$displaced/worktrees" && ( -e "$canonical/worktrees" || -L "$canonical/worktrees" ) ]]; then
	echo "Both homes contain worktrees. Keep both directories and recover them individually." >&2
	exit 1
fi

databases=("$canonical/local.db" "$canonical"/host/*/host.db "$canonical"/host/*/chat.db)
echo "Original data: $canonical"
echo "Displaced data will be kept in a separate recovery directory."
echo "The installed release will reach the original data through $displaced."
if [[ "$apply" != true ]]; then
	echo "Preview only. Quit Paradev++, then run this command with --apply."
	exit 0
fi

for tool in lsof sqlite3; do
	command -v "$tool" >/dev/null || { echo "Required tool missing: $tool" >&2; exit 1; }
done

ensure_databases_closed() {
	for database in "${databases[@]}" "$displaced/local.db" "$displaced"/host/*/host.db "$displaced"/host/*/chat.db; do
		if [[ -f "$database" ]] && lsof -t "$database" >/dev/null 2>&1; then
			echo "Quit Paradev++ and its host before recovery: $database is open." >&2
			exit 1
		fi
	done
}

ensure_databases_closed
backup="$(mktemp -d "$task_home/.fork-data-home-recovery.XXXXXX")"
chmod 700 "$backup"
echo "Creating database snapshots in $backup"
for database in "${databases[@]}"; do
	relative="${database#"$canonical/"}"
	snapshot="$backup/original-snapshots/$relative"
	mkdir -p "$(dirname "$snapshot")"
	sqlite3 "$database" ".backup '${snapshot//\'/\'\'}'"
done
for state in app-state.json windows-state.json window-state.json; do
	if [[ -f "$canonical/$state" ]]; then
		cp -p "$canonical/$state" "$backup/original-snapshots/$state"
	fi
done

ensure_databases_closed
mv "$displaced" "$backup/displaced-home"
if ! ln -s "$canonical" "$displaced"; then
	mv "$backup/displaced-home" "$displaced"
	exit 1
fi
if [[ -d "$backup/displaced-home/worktrees" ]]; then
	ln -s "$backup/displaced-home/worktrees" "$canonical/worktrees"
fi
echo "Recovered. Backup: $backup"
echo "Open Paradev++ again."
