# Update Log

This page records user-facing feature updates. For implementation constraints and interface changes, see [TECHNICAL.md](TECHNICAL.md); for the full history, see [CHANGELOG.md](CHANGELOG.md).

## DSH Compatibility Notes

- This branch targets the DSH `0.2.1` Web profile; the local compatibility review is based on upstream `dsh-v0.2.1-rc.2`, and older DSH versions are out of support. `@deepseek-ai/dsh-tools` is provided by the DSH host and declared as an optional peer; do not install it separately as a profile runtime dependency. The static plugin loads the host version from the DSH host entry, preventing a copy in a hoisted profile from shadowing the compatible version.
- Local terminal commands should use DSH's built-in local terminal tool, not `netshell_run`; NetShell's model tools are only for remote servers explicitly specified by the user. On Windows, the local terminal prefers PowerShell/pwsh/cmd, avoiding mistaking the `bash.exe` WSL launcher for a usable Bash.
- Remote SSH supports the OpenSSH Client on Windows 10/11; automatic Windows password injection requires an OpenSSH that supports `SSH_ASKPASS_REQUIRE=force` (8.7+ recommended).

## 0.6.6 · 2026-11-02

- **See the latest command line immediately when opening a terminal**: it no longer stops at the top of history; the first screen automatically sticks to the bottom.
- **Remembers where you manually scrolled**: switching to the "Chat" tab or another terminal session and coming back returns you to the position you were just reading, instead of being reset.
- **Auto-follow when there is new output**: if the AI ran commands or the terminal produced new output while the view was not visible, returning shows the latest content directly.

## 0.6.5 · 2026-10-30

- Windows remote SSH uses Win32 OpenSSH; private keys with broad ACLs are loaded through a temporary copy protected by the current user, without modifying the original file permissions.
- The Windows local terminal selects PowerShell/pwsh/cmd by default, avoiding mistakenly starting WSL Bash.
- Shows loading and handshake status when connecting to a server; the active terminal count moves to the line with the session name and mode.

## 0.6.4 · 2026-10-30

- Fixed an issue that could cause DSH startup failure after installing through a package manager; `dsh-tools` is now provided by the DSH host.

## 0.6.3 · 2026-10-29

- **Fixed background polling amplification**: after the plugin was enabled, it kept generating a large number of RPC requests even with no hosts connected. Now it refreshes terminals at high frequency only when sessions exist, barely requests anything when idle, and stops completely when the browser tab goes to the background.

## 0.6.2 · 2026-10-24

- Adapted to the Web and Desktop profiles of DSH 0.2.1.
- Fixed RPC authentication errors, configurable routes, asynchronous SSH PTY writes, and termination waits.
- Fixed password askpass, legacy profile fields, and Client Slot compatibility.

## 0.6.1 · 2026-09-07

### Added

- **Local terminal**: the terminal panel can now directly launch `bash`, `sh`, PowerShell, or `cmd` on the current device, without configuring an SSH server.
- **Chinese and English UI**: the terminal, settings page, permission rules, and status bar follow DSH's UI language switch.
- **Bilingual user documentation**: added user-facing Chinese and English READMEs covering installation, server configuration, permission levels, and AI tools.
- **CDP feature screenshots**: added redacted Chinese and English terminal UI screenshots showing live output, command statistics, and dangerous command confirmation.
- **New repository preview image**: updated the GitHub social preview image to highlight DSH-NetShell, remote terminals, and the human confirmation flow.

### Security and UX

- The local terminal does not read remote server profiles or SSH passwords.
- Local and remote sessions continue to use a unified command Guard; `allow`, `ask`, and `deny` behave consistently.
- **Model remote connection confirmation**: the first time the current model session uses a server, or when the user manually disconnects and then uses it again, user confirmation is required first; authorization is retained separately per model session and per server within the current plugin lifecycle, and different model sessions must each confirm even if they reuse the same SSH session. Network failures, SSH exits, or connection wait timeouts only trigger automatic reconnection of already-authorized model sessions and will not ask again. If the confirmation service is unavailable, it fails safe and will not connect automatically.
- The README explicitly states the plugin's security boundary: the command guardrail is not a complete sandbox, and other SSH channels are not intercepted by this plugin.

### Fixed

- **Terminal cursor and arrow key experience**: the cursor is now a green block cursor covering the current character, no longer inserting an extra glyph or creating whitespace on the right; the view refreshes immediately after arrow key input is complete, poll snapshots are serialized, and the polling interval is adjusted to 80ms.
- **Terminal output listener leak**: only one output async iterator is created per PTY session, avoiding duplicate registration of `PassThrough`'s `end`, `finish`, `error`, and `close` listeners and eliminating `MaxListenersExceededWarning`.
