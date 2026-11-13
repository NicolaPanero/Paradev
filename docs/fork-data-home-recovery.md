# Recover projects and chats after the 2.0.8 update

The release `desktop-v2.0.8-fork.3ebedf1-tx26` can open `~/.paradev-fork`
instead of the fork's existing `~/.superset-fork`. The original databases stay
in place. The shared main-process chunk selects its home before the entrypoint's
first-launch migration runs.

The fix pins the fork's home from `app-environment` before its path is
resolved, including in headless consumers. The first-launch copy also accepts
that pinned default. It also recognizes the incorrect default inherited
from an affected release. Explicit custom homes still work.

To repair an affected installation immediately, preview the recovery:

```sh
bash scripts/fork/recover-data-home.sh
```

Quit Paradev++ and run:

```sh
bash scripts/fork/recover-data-home.sh --apply
```

The script refuses to run while either home's databases are open. It snapshots
the original databases with SQLite, keeps the displaced directory under
`~/.fork-data-home-recovery.*/displaced-home`, and makes `~/.paradev-fork` an alias
of `~/.superset-fork`. New worktrees stay reachable at their original paths.
Reopen the app to see the original projects and chats. Sessions created in the
displaced home remain in its backup; the script does not merge the databases.

If both homes contain a `worktrees` directory, the script stops before making
changes so those checkouts can be reconciled individually.

Run the recovery from a separate system terminal and leave the app closed until
the script prints `Recovered`. A process launched from an agent's session may be
terminated when the app closes; an incomplete snapshot does not change the data
paths. On macOS, a recovery that must survive closing the agent can run as a
one-shot `launchd` job.

The packaged-startup regression test builds multiple entrypoints with Vite to
exercise shared-chunk initialization. The recovery test uses temporary databases
and verifies the original sessions, displaced data, checkout paths and repeated
runs.
