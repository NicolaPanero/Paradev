# Portable backup

Settings → Fork → Storage → **Portable backup** transfers the local Paradev++
environment between Macs. Install the same or a newer Paradev++ release on the
destination first. Windows/Linux transfers are not supported by this version.

## Create a backup

1. Select **Back up everything** and review the folders, uncompressed size and
   missing paths. A large installation can take several minutes to scan.
2. Enter and confirm a password of at least 12 characters. There is no password
   recovery. The archive includes credentials, private keys and `.env` files.
3. Pause other tools that write these folders, confirm the preview and choose
   an output file outside the captured folders. An existing archive is never
   overwritten.
4. Paradev++ stops its agents, host services and terminal processes completely.
   A separate window rescans the data and creates an encrypted
   `.paradev-backup` archive. Closing that window cancels the operation.
5. Paradev++ reopens when the operation finishes. Copy the archive to the other
   Mac through your preferred transfer method.

The backup includes the app data home, Electron profile, SQLite databases, local
chats, attachments, layouts, agent profiles and histories, SSH/Git/shell
configuration, project repositories and extra folder worktrees. Discovery reads
legacy and current host databases, saved account selections and external
symbolic links. Ignored and untracked files, dependencies, Git objects, staged
changes and uncommitted work are included. Missing paths are reported, never
silently presented as backed up. Runtime sockets, PID files and process manifests
are excluded. Files that change during copying cause the operation to fail.

Supported provider directories include Claude, Codex, Cursor, Grok, Gemini,
OpenCode, Copilot, Amp, Pi, Factory, Aider and Continue, plus custom Claude/Codex
profiles recorded in the app. Mac Keychain access may request approval. A denial
fails the backup rather than silently dropping available credentials.

## Restore

1. Open **Restore backup**, select the archive and enter its password.
2. Review the authenticated manifest. App data and the desktop profile use the
   destination installation's locations. Agent configuration defaults to the
   new user's home. Repositories and other external folders default to
   `~/Paradev Restored`; edit each destination as needed.
3. Confirm the destinations and close the app to restore. The helper checks
   free space per volume, stages the data beside each destination and verifies
   every file and the archive authentication tag before replacing anything.
4. Existing folders are renamed to sibling
   `<folder>.before-paradev-restore-<id>` safety copies. The completion dialog
   lists these paths. Existing Keychain values also have an encrypted safety
   copy beside the restore journal, bound to the destination Mac.

Restore remaps app/provider metadata, SQLite path fields, renderer storage,
account registry filenames, Git worktree pointers and symbolic links. Claude
project directory names and Cursor conversation directory hashes are linked to
the new working paths. Chat and workspace IDs stay intact. Repository source
files are not rewritten. Machine-encrypted app authentication and integration
tokens are resealed for the destination Mac, which retains its own host identity.

Live processes cannot move between computers. Conversation files and settings
are preserved, and agents can be resumed after installing the required tools.
Provider sessions can expire or require another sign-in. Native dependencies
may need reinstalling when moving between Intel and Apple Silicon. The backup
does not install system applications, copy the entire OS Keychain, or preserve
filesystem ACLs and extended attributes.

## Recovery and format

`~/Library/Application Support/Paradev++-portable-restore.json` records the
restore transaction outside the folders being replaced. A process lock prevents
this app version from reopening during an operation. Startup recovers an
interrupted restore before loading any normal app database. A failed rollback
keeps the journal and prevents startup until recovery succeeds; never delete it
to bypass recovery. Successfully committed safety copies stay on disk until the
owner removes them.

The versioned archive uses scrypt and AES-256-GCM, with an independently
authenticated encrypted manifest and a compressed, authenticated streaming
payload. File records also carry SHA-256 checksums. Relative paths are validated,
file creation is exclusive and symbolic links are created only after extraction,
so archive entries cannot write through a link outside staging. Passwords and
Keychain data are passed to helpers through pipes, not command arguments or
plaintext job files.

The main entry wrapper selects the offline helper before normal app imports.
Main chunks stay beside `index.js` so existing worker/preload paths that use
`__dirname` continue to resolve after splitting normal startup into a chunk.
The renderer consumes an existing-storage seed once, before its stores load;
the seed is removed after successful application. No new persistent localStorage
collection is introduced.
