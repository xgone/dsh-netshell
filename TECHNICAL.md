# NetShell Technical Notes

> Audience: engineers and AI agents taking part in development. Goal: after reading, you can modify the code safely.
>
> - For usage instructions see [README.en.md](README.en.md) (the Chinese default README is [README.md](README.md)); for the original design and the host-contract research see [DESIGN.zh.md](DESIGN.zh.md) (note: DESIGN is the early-stage design; **where it differs from the implementation, §8.3 of this document and the source code prevail**).
> - This repository is the plugin itself: there is no build step and no dependencies; the two files `nsh-host.js` + `nsh-client.js` are the entire product.

## 1. A Reading Guide for AI Agents

**Reading order**: README.en.md → this document → DESIGN.zh.md (the host-contract part is still worth consulting) → source code.

**Three invariants you must know before changing code**:

1. **Cross-realm object rules** (§8.1) — violating them makes credential writes throw or fail silently;
2. RPC method names and payloads are the contract between the Client and Host halves; renaming must be done on both sides in sync (§5);
3. The Guard evaluation order (§6) and "passwords never leave the Host" are security boundaries that no refactor may weaken.

## 2. File Structure and the Dual-Mode Architecture

> **Branching model**: `master` = the Loader release form, carrying the full packaging layer (every file described in this section is based on master); `dev` = the dynamic-loading development form. The two branches are **file-isomorphic** (dev likewise keeps the packaged files so that merge paths stay clean); differences come only from the evolution of docs and source. On dev, modify only the `src/` sources and the docs; packaging and version changes happen on master (after merging, `pnpm test` regenerates `lib/` and it is committed).

The plugin has **two installation forms**, both driven by **the same source code** (the `src/` directory):

| File | Description |
|------|------|
| `src/nsh-host.js` | **Source · host half**: SSH session management, Guard engine, credential read/write, RPC handlers, model tools (dynamic-sandbox function-body style, ES5) |
| `src/nsh-client.js` | **Source · browser half**: main-area terminal tab (conversation.view), settings page, ANSI rendering, polling (same as above) |
| `scripts/build.mjs` | Build: inlines the `src/` sources into the two halves under `lib/` (`pnpm build`) |
| `lib/index.js` | Generated · Loader static host half (real Node ESM + harness shim + `/netshell/rpc` dispatch) |
| `lib/client.js` | Generated · Loader static browser half (`window.__ModuleLoader__` factory + builtin shim) |
| `cordis.patch.yml` | bundle patch: the `netshell` row of the loader tree |
| `test/smoke.mjs` | End-to-end smoke test: stub services drive both generated halves + real HTTP RPC (23 assertions) |
| `README.md` / `README.en.md` | Chinese default README and English README (plus `README.ru/ja/de/fr/es/ko.md`) |
| `TECHNICAL.md` / `TECHNICAL.zh.md` | Technical notes (this document; Chinese original in `TECHNICAL.zh.md`) |
| `DYNAMIC.md` / `DYNAMIC.zh.md` | Dynamic loading guide (English / Chinese) |
| `UPDATES.md` / `UPDATES.zh.md` | User-facing update notes (English / Chinese) |
| `DESIGN.zh.md` | Design document; the host-contract research in §9 is still valid |
| `CHANGELOG.md` | Complete history and implementation change log |

Both `src/` files end with `var …; return { inject: [...], apply(ctx) { … } }` — this is the **dynamic-sandbox function-body evaluation** format; `build.mjs` inlines the whole source verbatim into a single IIFE, so there is only one copy of the business logic and all mode differences are confined to the shims of the generated products:

| Dynamic-sandbox builtin | Static-mode counterpart (lib/index.js / lib/client.js) |
|------|------|
| `harness.handle(method, fn)` | In-memory handler table + a single `POST /netshell/rpc` JSON dispatch (webServer route, passing `connection.admit` first) |
| `harness.defineTool(def)` | Resolves the host-provided `@deepseek-ai/dsh-tools` from the DSH host entry and calls `defineTool` (argument-schema normalization); installing it as a profile dependency would shadow the compatible host version through hoisting |
| `harness.registerTool(ctx, t)` | `ctx.tools.register(t)` |
| client `host.call(method, args)` | `fetch('netshell/rpc')` (document-relative, supports mount prefixes; the same dispatch endpoint as the host) |
| client `styles.insert(css)` | `<style>` injection into `document.head` |
| client `ctx.timer` | The client has no timer service; the wrapper layer augments ctx with `setInterval/setTimeout` |
| service names `subprocess` / `credentials` / `timer` / `connection` | Same names — the Web profile's base bundle provides the services, and the static loader additionally declares `connection` for RPC authentication |

**When changing code, change only `src/`, then run `pnpm test`** (build + check + smoke). `lib/` is a generated artifact but is committed, so installing via git clone / link needs zero build steps.

## 3. Runtime Environment and Host Contract

- The plugin runs in DSH's **node:vm sandbox realm**: there is no `require` and no third-party library can be imported — this is the root reason behind every implementation choice (wrapping the ssh binary, hand-drawn ANSI, a hand-written store).
- **Host**: the dynamic function body declares `inject: ['subprocess', 'credentials', 'timer', 'connection']`; the static loader additionally injects `tools` / `webServer`. `connection` is used only for Web RPC authentication, and a custom route must `admit` before reading the request body. It uses:
  - `subprocess.spawnTerminal(spec)`: launch an interactive `ssh` on a PTY (sessions);
  - `subprocess.spawn(spec)`: the cross-platform askpass helper, private `known_hosts` initialization/cleanup, and one-shot `ssh -T` command execution (the tool path);
  - `subprocess.resolveExecutable('ssh')`: locate the ssh binary;
  - `credentials.readRecord / modifyRecord / describe / resolve / set / unset`: persistence of profiles and passwords (§4);
  - `harness.handle(method, fn)`: register RPC; `harness.defineTool` + `harness.registerTool`: register model tools;
  - `timer.timeout / interval`: polling and waiting.
- **Client** has available: `React` (code style is the pre-destructuring form `var x = React.useState(...)`), `host.call`, `styles.insert`, `ctx.get('slots')`, `ctx.get('locale')`, `console`; slots: `conversation.view` (main-area tab, list-kind, `data-conversation-composer-overlay` fixed-height mode), `settings.section` (settings page).
- The interactive terminal is fixed at **120×32** (`COLS` / `ROWS`); resize is not implemented. Local terminals pick a shell per the DSH platform, with Windows preferring `pwsh` / `powershell` / `cmd` to avoid the common WSL `bash.exe` launcher; remote SSH uses the platform-appropriate working directory and helper, and on Windows connects via Win32 OpenSSH + DSH ConPTY. Windows automatic password injection depends on an OpenSSH that supports `SSH_ASKPASS_REQUIRE=force` (8.7+ recommended).

## 4. Data and Persistence (Why There Is No Config File)

**Having no separate config file is a deliberate design**: all configuration goes through the host `credentials` service; the host is responsible for encrypted on-disk storage (0600) and recovery across restarts, and passwords are managed in the same domain as profiles.

| Data | Location | Form |
|------|------|------|
| Server profiles + level + rules | Credential record `netshell/profiles` (constant `PKEY`) | `kind: 'grant'`, payload `{ version: 1, servers: [...] }` |
| Password | One per server; the ref is generated by `refFor(id)`: `NETSHELL_PW_<id with non-alphanumerics removed, uppercased>` | `credentials.set(ref, password)` |
| Runtime sessions | Host process memory `Map` | Cleared when the plugin stops / DSH restarts (sessions were never cross-process anyway) |
| Host fingerprints (known_hosts) | Plugin-private file `$DSH_HOME/netshell/known_hosts` (falls back to `~/.dsh` when DSH_HOME is unset) | POSIX regular file 0600 / directory 0700; on Windows inherits the user DSH directory ACL and is maintained by ssh; isolated from `~/.ssh/known_hosts` |

Server profile fields: `{ id, name, host, port, user, auth: 'password'|'key'|'agent', keyPath?, level: 'open'|'guarded'|'locked', rules: [{ pattern, action: 'allow'|'ask'|'deny', note? }], createdAt }`.

**Password isolation guarantee**: the list / save responses only attach `hasPassword` (from `credentials.describe(ref).configured`); the password value never appears in any RPC, any log, or any terminal output.

## 5. RPC Interface (Client → Host)

All are registered via `harness.handle`; arguments / returns are lossless JSON:

| method | args | Returns | Description |
|--------|------|------|------|
| `netshell.profiles.list` | `{}` | `{ servers: [server & { hasPassword }] }` | Profile list |
| `netshell.profiles.save` | `{ server, password?, clearPassword? }` | `{ server }` | Create / update; a non-empty `password` writes the credential, `clearPassword` deletes it; validates required fields and the port range 1–65535 |
| `netshell.profiles.delete` | `{ id }` | `{ ok: true }` | Delete the profile + delete the credential + terminate that server's active sessions |
| `netshell.connect` | `{ serverId }` | `{ id, pid }` | Spawns a new session every time |
| `netshell.local.connect` | `{}` | `{ id, pid }` | Automatically picks an available local shell and creates an independent local session |
| `netshell.input` | `{ id, data }` | `{ ok: true }` | Keyboard input, ≤4096 characters per call; discarded entirely while pending; **multi-character data with embedded `\r`/`\n` is forcibly split and fed to the Guard** (§6.1), so no input shape can bypass interception |
| `netshell.poll` | `{ id }` | `{ status, output, lossy, dropped, nextCursor, events, pending, hint, closedReason, atPwPrompt, cols, rows }` | **Full snapshot** (see below) |
| `netshell.decide` | `{ id, pendingId, action: 'allow'\|'always'\|'deny' }` | `{ ok: true }` | Adjudicates a pending command; a manual pending (`from: 'line'`) writes `\r`/`\u0015` to the PTY as before, while a tool pending (`from: 'tool'`) only records against the confirmation token and does not touch the PTY |
| `netshell.disconnect` | `{ id }` | `{ ok: true }` | Terminate the session |
| `netshell.sessions.list` | `{}` | `{ sessions: [{ id, serverName, status, pending }] }` | Used for cross-panel session discovery |

Notes:

- `netshell.poll` is currently a full snapshot: `output` is the entire buffer, `nextCursor` is always `0` and `lossy` is always `false` — the incremental cursor is a **reserved field**, not implemented;
- The Client uses **adaptive polling** (replacing the old fixed 80 ms global interval): with sessions present it pulls the current session snapshot every 80 ms (`pollOne(activeId)`) plus refreshes the session list roughly once per second (`discoverSessions`); **with no sessions at all it drops to a probe about every 5 s**; while the page is hidden (`document.visibilityState === 'hidden'`) it suspends all polling; opening the terminal view or the page becoming visible again triggers an immediate catch-up pull. List requests are serialized (if one is still in flight, that round is skipped), and a completed input RPC additionally triggers an immediate poll. The old behavior sent `sessions.list` every 80 ms from the moment the plugin loaded (12.5 times/second, about 750 times/minute), even with no host connected — that is the RPC amplification problem this version fixes.

## 6. Guard Engine (Host Side)

### 6.1 Line Buffer and Submission Timing

`onInput` maintains the current line buffer `s.line`:

- **Enter** (`\r`) → `submitEnter`: after trimming, hand it to `evaluateFor` for evaluation; empty lines and the password-prompt state pass through directly;
- **Backspace** (`\x7f`) deletes one character; **Ctrl-U** (`\x15`) / **Ctrl-C** (`\x03`) / **Ctrl-L** (`\x0c`) clear the line;
- **↑/↓** (`\x1b[A`/`\x1b[B`) traverse the Host-side `hist` (≤100 entries): first write `\x15` to clear the remote current line, then write the content back, keeping the remote display consistent with the buffer;
- **Tab** and the remaining ESC sequences pass through directly (completion, vim, etc. are not governed by the Guard);
- **Password-prompt bypass**: when `s.tail` (the last 60 characters) matches `/password\s*:$/i`, `atPwPrompt` is set, after which Enter passes through without evaluation — otherwise sudo / ssh password input would be treated as a command and fed to the Guard;
- **While pending (awaiting confirmation)** all input is discarded; after a `deny` verdict, `\x15` is written to reset the remote line.
- **Multi-character bypass hardening** (`feedMultiline`): a legitimate browser client only sends single keys (Enter is a separate `\r`), but the protocol layer once allowed a single multi-character `data` with an embedded `\r` to reach the PTY directly and bypass the Guard. Now `netshell.input` splits data containing `\r`/`\n` on `[\r\n]` (normalizing `\r\n` first), feeds it character by character to `onInput`, and injects `\r` between segments to submit — every segment's Enter goes through `submitEnter` → `evaluateFor`, so benign segments still execute and dangerous segments are still held, semantically equivalent to per-key input.

### 6.2 Evaluation Order (`evaluateFor`)

1. A hit with `action: 'deny'` in the server's `rules` → **deny**;
2. A hit with the rest of the server's `rules` (`allow` / `ask`) → per its action;
3. Built-in `deny` → 4. built-in `ask` → 5. level default (`guarded` → allow; `locked` → ask, i.e. allowlist mode; `open` never reaches here).

### 6.3 Matching Semantics

- glob → regex (`globToRe`, with a cache): `*` → `[\s\S]*`, `?` → `.`, all other characters escaped; **whole-string match, case-insensitive**;
- `variants()`: strips up to 3 layers of `sudo|doas|nice|nohup|env ` prefixes; all variants participate in matching;
- Rules are evaluated in array order and the first hit wins;
- Only the raw command string is matched; no shell lexical parsing is performed ("lexical tokenization" in DESIGN is not implemented, see §8.3).

### 6.4 Built-in Rule Library

`BUILTIN_RULES` has 38 entries: 9 `deny` (`rm -rf` on root paths and variants, `mkfs*`, `dd` writing directly to devices, overwriting `/dev/sd*`, fork bombs, `chmod -R 777 /*`) + 29 `ask` (recursive delete, shutdown/reboot, dropping databases and tables, force push / hard reset, flushing the firewall, deleting crontab, package-manager removal, docker/k8s cleanup, etc.). When changing them, update CHANGELOG and README in sync.

## 7. Session Lifecycle and Model Tools

### 7.1 Interactive Sessions (`netshell.connect` → `spawnSession`)

1. `resolveExecutable('ssh')` locates the binary;
2. When `auth: 'password'`: `credentials.resolve(ref)` fetches the password → `makeAskpass` writes the askpass helper; when `auth: 'key'` on Windows, the original private key is first copied to a temporary directory whose ACL is accessible only to the current user, using managed file streams, without inheriting OneDrive / source-directory ACLs;
3. `spawnTerminal` launches `ssh -tt -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=<private file> -o NumberOfPasswordPrompts=1 -o ServerAliveInterval=15 -o ConnectTimeout=12 …` (adds `BatchMode=yes` for agent; adds `-i <keyPath or temporary restricted copy> -o IdentitiesOnly=yes` for key);
   - **Private known_hosts** (`knownHostsFile()`): the first call idempotently creates `$DSH_HOME/netshell/known_hosts` (falling back to `~/.dsh/netshell` when `DSH_HOME` is unset) and caches the path; on POSIX the directory is set to 0700 and the file to 0600, while on Windows it is created with PowerShell in the DSH user directory (inheriting that directory's ACL); a failure is retryable, and if it persists the connection for this attempt errors out; fingerprints the plugin learns never land in the user's `~/.ssh/known_hosts`;
4. Asynchronously consumes the output stream into `onOutput` (detecting error signatures to set a Chinese-language `hint`); the first output chunk immediately sets `status: 'live'`;
5. On exit, `onExit` records `closedReason` and deletes the askpass script.

**askpass mechanism** (password authentication):

- POSIX requires OpenSSH ≥ 8.4; the script is written to `/tmp/.netshell-askpass-<nsToken>-<n>.sh`, contains only `printf "%s\n" "$NETSHELL_PW"`, and is written to disk with 0700 permissions;
- Windows uses a `.cmd` helper under `%TEMP%` that invokes Windows PowerShell to output `NETSHELL_PW`; the helper file itself contains no password and is protected by the current Windows user's temporary-directory ACL;
- On both platforms the ssh process is given `SSH_ASKPASS`, `SSH_ASKPASS_REQUIRE=force`, `DISPLAY=netshell:0` and `NETSHELL_PW`; Windows automatic password injection is best with Win32 OpenSSH ≥ 8.7;
- When the session ends, the temporary helper is deleted through the corresponding platform's file tooling.

### 7.2 Buffering Strategy

- `outAll` is capped at **160K** characters; on overflow it is trimmed to 120K; `outBase` records the global offset and `dropped` accumulates the number of trimmed characters;
- `events` is capped at 500 (on overflow the oldest 100 are dropped); `hist` (command history) is capped at 100;
- On the Client side `lines` is capped at 1200 (on overflow the oldest 400 are dropped and a `dropped` notice is accumulated); rendering shows the most recent 400 lines plus the current line.

### 7.3 Model Tools

Defined with `harness.defineTool`, registered inside `ctx.effect`, unregistered on dispose:

- **`netshell_servers`**: no arguments; reads `PKEY` and returns `{ servers: [{ id, name, host, port, user, auth, level }] }`;
- **`netshell_run`**: arguments `server` (required), `command` (required), `timeoutMs` (default 30000); `confirmToken` is used only by the fallback path, and `choice` is deprecated (authorization accepts only a human verdict, and the argument is ignored). Execution flow (`toolRunExecute`):
  1. The Guard first evaluates the hard-deny rules: `deny` → return blocked immediately without establishing SSH; other commands enter the model connection-confirmation flow;
  2. When the current model session uses a server for the first time, or when that session's authorization for the server was cleared after the user disconnected voluntarily, a human confirmation is requested via `userQuestions.ask`. Authorization is retained per Agent + server for the current plugin lifecycle; different Agents must each confirm separately even when they reuse the same shared SSH session. An abnormal network/SSH exit or a connection-wait timeout only invalidates the current session; an already-authorized Agent's next call reuses the authorization to reconnect automatically. When the confirmation service is unavailable it fails closed and does not connect automatically; concurrent calls from the same Agent share one confirmation task;
  3. After confirmation passes, `resolveServer` → `ensureSession` (**reuse or create an interactive PTY session**, shared with the panel; waitLive up to 20 s);
  4. Guard evaluation: `deny` → return blocked immediately; `allow` → `runRemote` (`ssh -T … <cmd>` as an independent one-shot execution, likewise using the private known_hosts; stdout capped at 200K/spill 400K);
  5. `ask` → tries four paths in order:
     - **Path one (token redemption)**: when re-run with a `confirmToken`, verifies one-shot use, the server+command binding, and `TOOL_ASK_TTL` (10 minutes) freshness; if the panel has adjudicated → redeem and execute, if not → return blocked and **do not consume the token** (the model can remind the user and retry);
     - **Path two (redemption without a token)**: no token present, but a record with an exact (server, command) match exists and the panel has adjudicated it → redeem directly;
     - **Path three (preferred · native card)**: calls the host's `ctx.get('userQuestions').ask({ questions, agent: exec.agent, signal: exec.signal })` directly — exactly the same shape as the built-in `ask_user_question`; the confirmation card appears natively in the **conversation window** and the tool waits in place for the human's answer; the answer is returned by the host service: "run once" → `runRemote`, "always allow this command" → write the rule table then `runRemote`, anything else (reject / custom text / empty answer) is treated as rejection. **The agent must be passed through verbatim as `exec.agent` (the live Agent object)**: the server performs the identity check `agents.get(agent.id) === agent`; rebuilding an object from the id in 0.5.x caused `CALLER_NOT_LIVE` fail-closed, and that was the root cause of the earlier misdiagnosis that "the host plane cannot show a card"; `ASK_ABORTED` → aborted, `NO_PROVIDER` / `DELEGATED_CALLER` etc. → path four;
     - **Path four (panel fallback)**: sets the shared session to `pending(from: 'tool', token)` (visible in the panel banner) + issues a one-shot token and returns blocked; only one pending item is allowed per session at a time; after `TOOL_ASK_TTL` a sweep automatically revokes the pending item and invalidates the token;
  6. The result (stdout/stderr/exitCode) together with `$ <cmd>` is **written back into the shared session's `outAll` and event stream**, so the panel can see throughout what the model did.

  Authorization credentials can only come from human actions (the confirmation-card answer / a panel `netshell.decide` click); the model's `choice` argument never participates in authorization — this is a mechanical binding, not something that depends on the model's good faith.

## 8. Implementation Notes and Pitfalls

### 8.1 Cross-Realm Object Identity (the most important pitfall; there is a long comment block at the top of the source)

The plugin runs in the node:vm sandbox realm, where an object literal's `Object.prototype` differs from the host realm's; the credentials service's `assertJsonValue` compares with **the host's Object.prototype for identity equality**, so passing an object created in the sandbox fails. Therefore **every object destined for a GrantRecord payload must be based on an object born in the host realm**; there are only three safe sources:

1. The CredentialInfo returned by `credentials.describe()` (a host object) → pass it through `hostBlank()` to delete its fields and use it as a blank object;
2. `rec.payload.servers` returned by `readRecord` (the host's YAML parse product) → **modify in place**;
3. The server / rules inside RPC args (the host's JSON parse product) → **modify in place**.

Use `Array.isArray` for array checks (cross-realm safe); primitives have no realm concept and are unconstrained. The standard flow for creating a new server: first `hostBlank` to get a host blank object → push it into the old array → fill in the fields in place → `modifyRecord` returns the whole record. The same applies when `decide('always')` writes a permanent allow rule.

### 8.2 Dead Code and Reserved Fields

- `runOnSession`, `waitShellReady`, `collectOutput` (called only by the former), and `makeVirtualSession` currently have **no callers** — they are reserved for a future "tool commands go directly through the interactive PTY";
- `netshell.poll`'s `nextCursor` / `lossy` are reserved for incremental fetching and currently have no effect.

### 8.3 Differences from DESIGN.zh.md (the Implementation Prevails)

| Design | Implementation |
|------|------|
| RPC naming `netshell.servers.*`, `sessionId` / `cursor` incremental fetching | `netshell.profiles.*`, `id`, full-snapshot poll |
| Interception queries go through the host `userQuestions.ask()` | The plugin **calls** `userQuestions.ask` directly in the tool's ask branch (agent passed through verbatim as `exec.agent`), and the confirmation card appears in the conversation window; when the card is unavailable it falls back to "panel pending + panel verdict redeems the token" |
| Probe `ssh -V` before connecting and degrade | Not implemented |
| Shell lexical tokenization for rule matching | Raw-string matching only + stripping of sudo-class prefixes |
| Model tools are a P3 option | Delivered with the first version (`netshell_servers` / `netshell_run`) |

### 8.4 Security Boundaries and Known Weaknesses

- **The guardrail is not a sandbox**: the match target is the raw command string, so base64 / variable indirection / heredoc and the like can bypass it; `locked` + `allow` allowlisting is the only strong constraint, and the docs must keep making this explicit to users;
- **The Guard only guards "whole lines"**: operations after entering an interactive program (python / mysql / vim `:!` / nested ssh) are outside the evaluation scope; only the line that starts it is evaluated;
- **Scope of control = this plugin's two channels**: outside the terminal UI and `netshell_run` (for example a generic shell tool running `ssh` directly, other plugins / MCP), commands do not pass through this plugin, and the plugin can neither intercept them nor find a place to do so — the host `subprocess` service provides no global spawn hook;
- ask's authorization credentials are mechanically bound to human actions: confirmation-card answers are returned by the host `userQuestions.ask`, panel verdicts are recorded via `netshell.decide`, and the `choice` argument does not participate in authorization;
- `netshell.input` already hardens against multi-character bypass (embedded `\r`/`\n` is split and passed through the Guard), but the semantic differences of control characters such as `\x15`/`\x7f` between the line buffer and the remote readline still theoretically allow constructing obfuscated input where "the string the Guard sees ≠ the string the remote executes"; this is classified as a known weakness of the obfuscation/mutation kind;
- `atPwPrompt` is a heuristic: when the remote prompt does not contain `password:` (for example a custom PAM prompt), the password Enter may fall into the evaluation path; this is usually harmless but records a history entry;
- When the host key changes, ssh itself refuses the connection (fingerprints are stored in the private `$DSH_HOME/netshell/known_hosts`, falling back to `~/.dsh/netshell` when unset), and `onOutput` recognizes the characteristic text and gives a Chinese-language hint plus remediation guidance;
- The model path's `waitLive` polls every 120–150 ms and is not event-driven (acceptable, but inelegant).

## 9. Client Implementation at a Glance

- **State**: `store` is a hand-written observable (`set()` shallow copy + subscriber notification), plus `screens: Map<sessionId, screen>` holding each session's render state; components subscribe via `useStore()` and force a refresh (whole-tree re-render, acceptable at the current scale).
- **ANSI rendering** (`lineSpans`): per-cell buffering (character + style), handling SGR (16-color FG/BG + bold/italic/underline/strikethrough/dim), `K`/`J` line and screen clearing, `P`/`@`/`X` character delete/insert/erase, `C`/`D`/`G`/`H`/`f` cursor positioning and column movement, `s`/`u` and ESC 7/8 cursor save/restore, `\r` carriage-return redraw, `\b`, `\t` (8-column tab stops), BEL; strips OSC and control characters with no display meaning; merges adjacent spans of the same style. No xterm.js: this is a streamlined hand-rolled implementation, and full cursor replay (full-screen TUI) is not supported.
- **Key mapping** (`keyToData`): DOM keyboard events → terminal byte stream; Ctrl+letter → `\x01`..`\x1a`, arrows / Home / End / PgUp / PgDn → CSI sequences, Tab/Shift-Tab → `\t` / `\x1b[Z`; Alt / Meta combos are ignored; on a hit it calls `preventDefault` and forwards via `netshell.input`.
- **Styles**: the CSS template string is injected once via `styles.insert`; all colors go through `--dsw-*` design tokens (the `TK` mapping table) and adapt automatically to light and dark themes.

## 10. Change Checklist

Run through this before changing code:

- [ ] Change only the `src/` sources; after the change run `pnpm test` (build + check + smoke); include the regenerated `lib/` in the commit;
- [ ] A new object needs to enter the credentials payload? → it must be born in the host realm (§8.1);
- [ ] Touched an RPC name / payload? → sync both sides, `src/nsh-client.js` and `src/nsh-host.js`, and update §5 of this document;
- [ ] Touched the Guard evaluation order or the built-in rules? → update §6, README "Permission levels", CHANGELOG;
- [ ] Touched askpass / the credential path? → confirm the password does not appear in any RPC return, console, or `outAll`;
- [ ] New user-visible behavior? → sync README + CHANGELOG;
- [ ] New sub-resources (temporary files, child processes)? → reclaim them in `onExit` and in the `ctx.effect` dispose;
- [ ] Keep the dynamic source in ES5 function-body style (top-level `var` + `return { inject, apply }`); do not introduce `import`/`export`/template literals — both modes rely on "inlining the function body verbatim".

## 11. Installation and Packaging (loader static package)

- **Package shape**: `package.json` declares `exports["./client"]` + `dsh.client` (`platform: web`) + `dsh.bundle.patch` — this is the contract by which the DSH client-modules system scans for browser halves and the profile launcher recognizes the bundle (see: the scanning logic of `@deepseek-ai/dsh-client-modules` and this repository's cordis.patch.yml). Note that `dsh.client.inject` means **the names of the client packages it depends on** (edges in module-table arrival order), whereas the module's own `export const inject = [...]` means **service names** — do not confuse the two layers; in this package the former is `[]` (slots/react are provided by the existing startup graph).
- **Installation**: the local profile is `~/.dsh/profiles/web` (a pnpm workspace, whose patch layer is the `cordis.patch.yml` inside it). `dsh plugin --profile web add link:<path>` installs with pnpm and automatically appends the bundle to `dsh.profile.bundles` (a transparent pnpm passthrough plus reconciliation against install state); module resolution has two anchors (the dsh installation directory first, then the profile directory).
- **Host-half services**: `inject: ['subprocess', 'credentials', 'timer', 'tools', 'webServer', 'connection']` (the Web base bundle provides service rows with the same names); RPC goes through a self-registered exact HTTP route, and the handler calls `ctx.connection.admit({ headers: req.headers })` before reading the request body, thereby inheriting DSH's Host/Origin and browser authentication gate. The Client uses the document-relative `netshell/rpc`, supporting Web app mount prefixes. **Deliberately not** going through the generic `/api` plane: `namespace/<method>` dispatch requires a host-half `TypertRemoteService` + `@Remote` markers, and the browser half must mount strict codec descriptors generated by `@deepseek-ai/dsh-typert-generator` (the `./remote` artifact + `ctx.remote.$mount`) — too much machinery, not worth it for this plugin's 10 JSON RPCs; migrate later if streaming / strong schemas are needed.
- **Browser half**: factory form `window.__ModuleLoader__.load({ id, factory(require) })`, with dependencies injected via `require('react')`; no `eval`/`new Function`, and the source is inlined as real code (no CSP risk).

## 12. npm Publishing

- The workflow lives at `.github/workflows/npm-publish.yml`.
- Configure `NPM_TOKEN` in the GitHub repository under `Settings → Secrets and variables → Actions`; it is injected only into the publish step.
- When creating a GitHub Release, the Release tag, after stripping an optional `v` prefix, must exactly match `version` in `package.json`; otherwise the workflow fails before publishing.
- `workflow_dispatch` allows manually publishing the package version on the current branch; `pnpm test` still runs before publishing.
- The npm package's `files` allowlist includes all localized READMEs, the technical documentation and `assets/`, ensuring the documentation images on the npm page work.

## 13. Roadmap (DESIGN phases + technical debt surfaced by this document)

- Incremental poll: enable the `nextCursor` cursor to reduce bandwidth and panel re-renders;
- Tool commands through the interactive PTY: revive `runOnSession` so that `netshell_run` truly echoes interactively (the current allow path is a standalone `ssh -T`);
- `ssh -V` probing and downgrade hints (completing the risk mitigations of DESIGN §8);
- `resize`, jump-host ProxyJump, full ANSI cursor replay (full-screen TUI);
- Controlled `terminals.registerBackend` integration (behind an explicit switch), and cleaning up or landing the reserved code in §8.2.
