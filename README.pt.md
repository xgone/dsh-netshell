# DSH-NetShell

<p align="center">
  <a href="https://www.npmjs.com/package/@xgone/dsh-netshell"><img src="https://img.shields.io/npm/v/%40xgone%2Fdsh-netshell?logo=npm&label=npm" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/@xgone/dsh-netshell"><img src="https://img.shields.io/npm/dm/%40xgone%2Fdsh-netshell?logo=npm&label=downloads" alt="npm monthly downloads" /></a>
  <a href="https://github.com/xgone/dsh-netshell/actions/workflows/ci.yml"><img src="https://github.com/xgone/dsh-netshell/actions/workflows/ci.yml/badge.svg?branch=master" alt="CI status" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/xgone/dsh-netshell?label=license" alt="MIT license" /></a>
</p>

<p align="center"><a href="README.md">中文</a> · <a href="README.en.md">English</a> · <a href="README.ja.md">日本語</a> · <a href="README.es.md">Español</a> · <a href="README.fr.md">Français</a> · <a href="README.de.md">Deutsch</a> · <a href="README.ru.md">Русский</a> · <strong>Português</strong></p>

<p align="center">
  <img src="assets/social-preview.png" alt="DSH-NetShell — terminal SSH local e remoto com proteção" width="720" />
</p>

<p align="center"><strong>Um terminal SSH local e remoto com proteção para o DeepSeek Harness</strong></p>

O DSH-NetShell permite gerenciar servidores, usar um terminal ao vivo e manter um ponto de controle humano claro antes que comandos de risco sejam executados no DSH. A entrada humana e as ações da IA compartilham o mesmo protetor de comandos. Os textos da interface seguem a locale da interface do DSH — chinês, inglês, japonês, espanhol, francês, alemão, russo ou português.

## Destaques

| Recurso | O que você obtém |
| --- | --- |
| Terminal local | Inicie `bash`, `sh`, PowerShell ou `cmd` no dispositivo atual sem configurar SSH; no Windows, prefira PowerShell/pwsh/cmd |
| SSH remoto | Gerencie hosts, portas, usuários e autenticação com várias sessões; suporta o Windows OpenSSH Client |
| Proteção de comandos | `allow` executa imediatamente, `ask` aguarda aprovação, `deny` bloqueia |
| Execução visível | A entrada humana e os comandos da IA aparecem no mesmo painel de terminal ao vivo |
| Isolamento de credenciais | As senhas SSH ficam no armazenamento criptografado do DSH e nunca entram em mensagens da IA, resultados de ferramentas ou logs |
| Histórico de comandos | Veja contagens de executados, bloqueados e permitidos, além do registro de cada decisão |
| Idioma da interface | Chinês, inglês, japonês, espanhol, francês, alemão, russo ou português, seguindo a locale da interface do DSH |

## Instalação

Pacote publicado:

```bash
dsh plugin --profile web add @xgone/dsh-netshell
```

A partir de um checkout local:

```bash
dsh plugin --profile web add link:/path/to/dsh-netshell
```

No Windows, instale/ative o Windows OpenSSH Client (`ssh -V` verifica a disponibilidade); a automação de senha salva exige suporte a `SSH_ASKPASS_REQUIRE=force` (OpenSSH 8.7+ recomendado). Reinicie o DSH Web após a instalação e abra **Configurações → Terminal**.

## Primeiros passos

### Terminal local

1. Abra a aba **Terminal** na área principal.
2. Clique em **Novo** na linha **Terminal local**.
3. Digite comandos e acompanhe a saída ao vivo.

O terminal local não lê perfis remotos nem senhas SSH.

### Servidor remoto

1. Abra **Configurações → Terminal → Novo**.
2. Informe nome, host, porta e usuário.
3. Escolha autenticação por senha, chave privada ou `ssh-agent`.
4. Escolha um nível de permissão; mantenha `guarded` na primeira conexão.
5. Volte à aba **Terminal** e clique em **Conectar** na linha do servidor.

Uma senha salva é exibida apenas como status configurado e nunca é mostrada novamente. No Windows, a autenticação por chave privada usa uma cópia temporária protegida pela ACL do usuário atual; ela é removida após a sessão, e o arquivo original e sua ACL permanecem inalterados.

### Comandos de risco

Os comandos são verificados quando você pressiona Enter:

| Nível | Comportamento |
| --- | --- |
| `open` | Uso cotidiano; regras de bloqueio rígido continuam valendo |
| `guarded` (padrão) | Comandos de alto risco pausam para aprovação |
| `locked` | Apenas comandos explicitamente permitidos executam direto |

Para um comando `ask`, escolha **Executar uma vez**, **Sempre permitir este comando** ou **Negar**. Uma permissão permanente vale apenas para o servidor atual e o texto exato do comando.

## Prévia da interface

![Terminal e confirmação de comando perigoso](assets/terminal-en.png)

O rodapé do terminal mostra as contagens de executados, bloqueados e permitidos. Abra **Histórico** para revisar os registros de comandos. Trocar para outra aba do DSH não desconecta uma sessão em segundo plano.

## Ferramentas de IA

O plugin expõe duas ferramentas de modelo:

| Ferramenta | Finalidade |
| --- | --- |
| `netshell_servers` | Lista perfis de servidor sem senhas |
| `netshell_run` | Executa um comando em um servidor selecionado |

Comandos da IA e entrada humana usam o mesmo Guard. Comandos `deny` nunca executam, e comandos `ask` exigem uma decisão sua na interface de confirmação do DSH ou no painel do terminal. A IA não vê senhas nem pode forjar resultados de aprovação.

No primeiro uso de um servidor por uma sessão de modelo, ou após o usuário desconectar manualmente esse servidor, `netshell_run` pede aprovação de conexão remota antes de iniciar o SSH. A aprovação é mantida por sessão de modelo e servidor durante o tempo de vida do plugin; sessões de modelo diferentes devem aprovar independentemente, mesmo quando reutilizam a mesma sessão SSH. Uma falha de rede, saída do SSH ou timeout de conexão só dispara reconexão para a sessão de modelo já aprovada. Uma sessão de GUI aberta manualmente não substitui a aprovação do modelo. Se o serviço de confirmação estiver indisponível, o plugin falha fechado e não conecta automaticamente.

## Limite de segurança

Este é um protetor de operações, não um sandbox de segurança completo. Ele protege comandos que entram pelo terminal deste plugin e por `netshell_run`; conexões SSH criadas por outros plugins ou ferramentas de shell genéricas ficam fora do escopo. Use `locked` em ambientes sensíveis e revise com cuidado ações dentro de programas interativos.

As chaves de host SSH ficam no `$DSH_HOME/netshell/known_hosts` privado do plugin (com fallback para `~/.dsh/netshell` quando `DSH_HOME` não está definido), separadas do `~/.ssh/known_hosts` do usuário.

## Documentação

- [中文 README](README.md) · [English README](README.en.md) · [日本語 README](README.ja.md) · [Español README](README.es.md) · [Français README](README.fr.md) · [Deutsch README](README.de.md) · [Русский README](README.ru.md)
- [Atualizações](UPDATES.md) · [中文](UPDATES.zh.md)
- [Notas técnicas](TECHNICAL.md) · [中文](TECHNICAL.zh.md)
- [Guia de carregamento dinâmico](DYNAMIC.md) · [中文](DYNAMIC.zh.md)
- [Notas de design e contrato do host](DESIGN.zh.md)
- [Changelog histórico completo](CHANGELOG.md)

## FAQ

**O que devo verificar quando uma conexão falha?** Confirme o host, a porta, o usuário e o método de autenticação. Se a chave do host mudou, confirme que o servidor foi realmente reconstruído antes de remover a entrada antiga do arquivo `known_hosts` privado do plugin.

**A IA pode ver minha senha?** Não. O Host a lê do armazenamento criptografado de credenciais do DSH apenas ao estabelecer o SSH; listagens de perfis, resultados de ferramentas, logs e saída do terminal nunca contêm o valor da senha.