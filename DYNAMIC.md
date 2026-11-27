# Dynamic Loading Operations Manual (for New Sessions / AI Agents)

> Important: the stock Web profile of DSH `0.2.1` has removed the model-callable `cordis_define` / `cordis_run` persistent dynamic loading path; normal use of this plugin should install this repository's bundle (`dsh.bundle.patch`) through Plugin Manager, and you must not follow the legacy flow in this document to call mutation tools that no longer exist.
> This document is retained only as a reference for the source halves of development environments that have a legacy/custom Cordis runner enabled; that environment must provide the `connection` service, otherwise the RPC should fail closed and the authentication gate must not be omitted.
> Goal: load this plugin's `src/nsh-host.js` and `src/nsh-client.js` as **two halves, Host / Client**, successfully in a single pass within a compatible dynamic Cordis composition.
> This document was written according to the flow actually verified in 2026-09, and includes every pitfall that was hit.

## 0. Prerequisites (the source form determines the loading method)

The two source files are themselves in "function body" form (top-level `var …; return { inject, apply }`), and can be **inlined as-is** as the `code.host` / `code.client` of `cordis_define`, with no rewriting required:

| Half | File | Free variables (sandbox builtins, do not pass as arguments) | inject dependencies | Returns |
|------|------|------|------|------|
| Host | `src/nsh-host.js` (about 816 lines) | `harness` | `['subprocess', 'credentials', 'timer', 'connection']` | `{ inject, apply }` |
| Client | `src/nsh-client.js` (about 1140 lines, fully multi-lined as of 0.3.0) | `React`, `host`, `styles` | `['timer', 'locale']`, internally `ctx.get('slots')` | `{ inject, apply }` |

- Host registers 10 Client→Host RPCs via `harness.handle(...)` (`netshell.profiles.list/save/delete`, `netshell.connect`, `netshell.local.connect`, `netshell.sessions.list`, `netshell.input`, `netshell.poll`, `netshell.decide`, `netshell.disconnect`), and registers two model tools via `harness.defineTool` + `harness.registerTool(ctx, t)`.
- Client registers two Slots: `conversation.view` (id `netshell`, order 20, the "Remote Terminal" Tab in the main area, to the right of "Conversation / Trajectory") and `settings.section` (id `netshell`, order 50).
- **Do not** use the static package `lib/index.js` / `lib/client.js` for dynamic loading — those are ESM build artifacts with shims, and the dynamic sandbox does not accept `import`.

## 1. Operation sequence (execute in order)

```
1. cordis_inspect_list                          # confirm the Provider is still present (usually can be skipped)
2. cordis_define  → get pluginId + packageId    # define only, do not execute
3. cordis_inspect_self(pluginId, packageId)     # verify the two stored halves are byte-identical to the src/ files (see §3)
4. cordis_run(pluginId, packageId, mode:"run")  # returning awaiting-approval is normal
5. The user clicks "Allow" on the Run card in the UI  # every new packageId must be approved separately
6. cordis_inspect_self / Tool.listTools         # verify the running state and tool registration (see §4)
```

### cordis_define parameter template

```json
{
  "plugin": { "kind": "new", "idPrefix": "nsh" },
  "name": "NetShell remote terminal",
  "purpose": "Load the dynamic plugin form of dsh-netshell: a Remote Terminal Tab in the main area (session list on the left + terminal pane on the right), a dangerous-command guardrail, server profile management on the settings page, and the two model tools netshell_servers / netshell_run.",
  "code": { "host": "<full text of src/nsh-host.js>", "client": "<full text of src/nsh-client.js>" }
}
```

Key points: `plugin` / `name` / `purpose` / `code` are **four independent parameters**; `code.host` and `code.client` must be given as a pair in the **same** define — a package that supplies only the client has no Host half, and all RPCs and tools are unavailable (this was actually hit).

### When modifying an existing plugin

Use `plugin: { "kind": "existing", "pluginId": "<original ID>" }` to append a new package (the old package is immutable and will not be overwritten), then switch to it with `cordis_run` `mode:"update"`. Update iterations after changing the `src/` source follow this path.

## 2. Pitfall list (every one of these was actually hit)

1. **Very long line truncation (historical pitfall, eliminated as of 0.3.0)**. The read tool truncates lines longer than 2000 characters; in the old version the client's CSS / ServerEditor / SettingsPage were all single lines of several thousand characters, so at the time they could only be fetched in segments with bash and then spliced seamlessly. Now the entire source file is multi-lined and every line is shorter than 2000 characters (`scripts/build.mjs` has a hard check: 2000 or more fails the build outright), so the read tool can read it whole, and both halves can be transcribed directly from the read output without any segment splicing. If a long line is introduced in the future, the build will report the line number.
2. **idPrefix must be 3–6 lowercase English letters**. `netshell` (8 letters) is rejected; use `nsh`.
3. **One define contains both halves**, and each parameter is passed independently; do not stuff name/purpose into code (it will be rejected as an extra property of code).
4. **Byte-for-byte identity is a hard requirement**; rewriting from memory is guaranteed to be wrong. The three places actually hit this time:
   - the client CSS line (line 6) ends with `+ TK.t3 + '}'` — a **single** closing brace; one extra is a SyntaxError;
   - the host's makeAskpass (line 294) is `+ BACK + 'n" "$NETSHELL_PW"'` — there is **no** backslash in the JS literal; the `\n` is assembled at runtime by `BACK = String.fromCharCode(92)`; extra escaping corrupts the askpass output and password authentication fails;
   - the last line of client must retain `return { inject: ['timer', 'locale'], apply: function (ctx) { … } }` in full — drop it and the client half evaluates to `undefined`, reporting "client half returned `undefined`".
5. **The evaluation result of the Client half is the return value of the function body**. A "returned `undefined`" error is almost always the trailing `return {…}` line not copied in full or truncated.
6. **The inline JSON contains no backticks** (both source files follow this convention), and there are no other special-character concerns; a very large argument (about 60KB for the two halves combined) can be passed in one go — do not try to omit comments or to compress and rewrite.
7. **Every new packageId requires UI approval** (a single check only authorizes the current package). Before approval, run returning `awaiting-approval` is normal; **do not retry, wait for the user to click**; after the user rejects, do not send again.
8. **Repair path after a failure**: for a technical failure (e.g. client-half-failed) → use `cordis_inspect_self(pluginId, packageId)` to read the stored source and locate the difference → define a new package under **the same plugin** → run again. Clean up broken, abandoned plugins with `cordis_undefine`, and temporarily disable ones in use with `cordis_stop`.
9. **Client Slot query** (Slots.listSubTree) may report `"input" must be an object` in this environment (a transport-layer issue); do not dwell on it — the registration protocol of this plugin's three Slots is defined by §0 of this document, and the source is the truth.
10. **The dynamically registered `order` may still be overridden in the DSH 0.2.1-rc.2 runner**. At present `cordis-client-runner` injects a dynamic `priority` for non-chain registrations (including list), and Slot sorting looks at `priority` first, so in dynamic mode the order of this plugin's Tab, Settings and Header utility depends on the load order, and `order` cannot be treated as a stable ordering contract. The static Loader mode does not go through this dynamic guard, and `order` takes effect normally; prefer the static bundle when a stable layout is required.

## 3. Pre-activation verification (strongly recommended, saves a failed round)

The `code.host` / `code.client` returned by `cordis_inspect_self(pluginId, packageId)` is the source **actually stored**. When the result is very long it is spilled to a file (the path is given at the end of the result); use python to diff it byte by byte:

```bash
python3 - <<'EOF'
import json
f='<spill file path>'
t=open(f).read()
d,_=json.JSONDecoder().raw_decode(t[t.index('{'):])
code=d['code']
host=open('src/nsh-host.js').read()
client=open('src/nsh-client.js').read()
print('host identical:', code.get('host')==host)
print('client identical:', code.get('client')==client)
EOF
```

Proceed to `cordis_run` only when both are `True`. If they do not match, use difflib to locate the differing lines, define a corrected package, and verify again.

## 4. Post-activation verification

- `cordis_inspect_self(pluginId)`: `state` is `running`, and `currentPackageId` equals the package just activated;
- `Tool.listTools` (host) shows `netshell_servers` / `netshell_run`;
- UI: a "Remote Terminal" Tab appears to the right of "Conversation / Trajectory" in the main area (the Tab bar is shown only when there is a non-empty current session) + a Settings → Remote Terminal section.

## 5. Lifecycle reminder

Dynamic plugins are **in-process**: they disappear after a DSH restart and must be reloaded according to this document; profiles and passwords are stored in the encrypted credential store and are unaffected. In daily development, after changing `src/`: define a new package → run `update` → approve, and the change takes effect immediately.
