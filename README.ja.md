# DSH-NetShell

<p align="center">
  <a href="https://www.npmjs.com/package/@xgone/dsh-netshell"><img src="https://img.shields.io/npm/v/%40xgone%2Fdsh-netshell?logo=npm&label=npm" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/@xgone/dsh-netshell"><img src="https://img.shields.io/npm/dm/%40xgone%2Fdsh-netshell?logo=npm&label=downloads" alt="npm monthly downloads" /></a>
  <a href="https://github.com/xgone/dsh-netshell/actions/workflows/ci.yml"><img src="https://github.com/xgone/dsh-netshell/actions/workflows/ci.yml/badge.svg?branch=master" alt="CI status" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/xgone/dsh-netshell?label=license" alt="MIT license" /></a>
</p>

<p align="center"><a href="README.md">中文</a> · <a href="README.en.md">English</a> · <a href="README.ru.md">Русский</a> · <strong>日本語</strong> · <a href="README.de.md">Deutsch</a> · <a href="README.fr.md">Français</a> · <a href="README.es.md">Español</a> · <a href="README.ko.md">한국어</a></p>

<p align="center">
  <img src="assets/social-preview.png" alt="DSH-NetShell — Guarded local and remote SSH terminal" width="720" />
</p>

<p align="center"><strong>DeepSeek Harness 向けの、ガード付きローカル / リモート SSH ターミナル</strong></p>

DSH-NetShell を使うと、サーバーを管理し、ライブターミナルを利用し、危険なコマンドが DSH 上で実行される前に人のチェックポイントを明確に挟めます。人の入力と AI の操作は同じコマンドガードを共有します。UI の文言は DSH の UI ロケールに追従し、中国語、英語、ロシア語、日本語、ドイツ語、フランス語、スペイン語、韓国語に対応しています。

## ハイライト

| 機能 | できること |
| --- | --- |
| ローカルターミナル | SSH の設定なしで、現在のデバイス上で `bash`、`sh`、PowerShell、`cmd` を起動できます。Windows では PowerShell/pwsh/cmd が優先されます |
| リモート SSH | ホスト、ポート、ユーザー、認証を管理し、複数のセッションを扱えます。Windows OpenSSH Client に対応 |
| コマンドガード | `allow` は即座に実行、`ask` は承認待ち、`deny` はブロックします |
| 実行内容の可視化 | 人の入力も AI のコマンドも、同じライブターミナルパネルに表示されます |
| 認証情報の分離 | SSH パスワードは DSH の暗号化ストアに留まり、AI のメッセージ、ツール結果、ログには入りません |
| コマンド履歴 | 実行、ブロック、許可の件数と、すべての判断記録を確認できます |
| インターフェース言語 | 中国語、英語、ロシア語、日本語、ドイツ語、フランス語、スペイン語、韓国語。DSH の UI ロケールに追従します |

## インストール

公開パッケージ:

```bash
dsh plugin --profile web add @xgone/dsh-netshell
```

ローカルのチェックアウトから:

```bash
dsh plugin --profile web add link:/path/to/dsh-netshell
```

Windows では Windows OpenSSH Client をインストール/有効化してください（利用可否は `ssh -V` で確認できます）。パスワード保存の自動化には `SSH_ASKPASS_REQUIRE=force` のサポートが必要です（OpenSSH 8.7 以降を推奨）。インストール後は DSH Web を再起動し、**設定 → ターミナル** を開いてください。

## クイックスタート

### ローカルターミナル

1. メインエリアで **ターミナル** タブを開きます。
2. **ローカルターミナル** の行にある **新規** をクリックします。
3. コマンドを入力し、ライブ出力を確認します。

ローカルターミナルは、リモートのプロファイルや SSH パスワードを読み込みません。

### リモートサーバー

1. **設定 → ターミナル → 新規** を開きます。
2. 名前、ホスト、ポート、ユーザー名を入力します。
3. パスワード、秘密鍵、`ssh-agent` のいずれかの認証を選択します。
4. 権限レベルを選択します。初回接続では `guarded` のままにしてください。
5. **ターミナル** タブに戻り、サーバーの行にある **接続** をクリックします。

保存されたパスワードは「設定済み」という状態としてのみ表示され、その後二度と表示されることはありません。Windows では、秘密鍵認証に現在のユーザーの ACL で保護された一時コピーを使用します。このコピーはセッション終了後に削除され、元の鍵ファイルとその ACL は変更されません。

### 危険なコマンド

コマンドは Enter を押した時点で検査されます:

| レベル | 動作 |
| --- | --- |
| `open` | 日常的な利用向け。ハード拒否のルールは引き続き適用されます |
| `guarded`（既定） | 高リスクのコマンドは承認のために一時停止します |
| `locked` | 明示的に許可されたコマンドだけが直接実行されます |

`ask` のコマンドでは、**1 回だけ実行**、**このコマンドを常に許可**、**拒否** のいずれかを選択します。恒久的な許可は、現在のサーバーと完全に同一のコマンド文字列にのみ適用されます。

## UI プレビュー

![ターミナルと危険なコマンドの確認](assets/terminal-en.png)

ターミナルのフッターには、実行、ブロック、許可の件数が表示されます。**履歴** を開くとコマンドの記録を確認できます。別の DSH タブに切り替えても、バックグラウンドのセッションは切断されません。

## AI ツール

このプラグインは 2 つのモデルツールを公開しています:

| ツール | 用途 |
| --- | --- |
| `netshell_servers` | パスワードを含めずにサーバープロファイルを一覧表示します |
| `netshell_run` | 選択したサーバーで 1 つのコマンドを実行します |

AI のコマンドも人の入力も同じ Guard を使用します。`deny` のコマンドは決して実行されず、`ask` のコマンドは DSH の確認 UI またはターミナルパネルで判断を求められます。AI はパスワードを見ることも、承認結果を偽造することもできません。

モデルセッションがそのサーバーを初めて使うとき、またはユーザーがそのサーバーを手動で切断した後は、`netshell_run` は SSH を開始する前にリモート接続の承認を求めます。承認はモデルセッションとサーバーの組み合わせごとに、現在のプラグインのライフタイム中保持されます。同じ SSH セッションを再利用する場合でも、別のモデルセッションはそれぞれ独立して承認する必要があります。ネットワーク障害、SSH の終了、接続タイムアウトは、すでに承認済みのモデルセッションの再接続を促すだけです。手動で開いた GUI セッションは、モデルの承認を置き換えません。確認サービスが利用できない場合、プラグインはフェイルクローズし、自動的に接続しません。

## セキュリティ境界

これは操作ガードであり、完全なセキュリティサンドボックスではありません。このプラグインのターミナルと `netshell_run` を通じて入ってくるコマンドを保護します。他のプラグインや汎用のシェルツールが作成した SSH 接続は対象外です。機密性の高い環境では `locked` を使用し、対話型プログラム内での操作は慎重に確認してください。

SSH のホスト鍵は、ユーザーの `~/.ssh/known_hosts` とは別に、プラグイン専用の `$DSH_HOME/netshell/known_hosts` に保存されます（`DSH_HOME` が未設定の場合は `~/.dsh/netshell` にフォールバックします）。

## ドキュメント

- [中文 README](README.md) · [English README](README.en.md) · [Русский README](README.ru.md) · [Deutsch README](README.de.md) · [Français README](README.fr.md) · [Español README](README.es.md) · [한국어 README](README.ko.md)
- [アップデート](UPDATES.md) · [中文](UPDATES.zh.md)
- [技術ノート](TECHNICAL.md) · [中文](TECHNICAL.zh.md)
- [動的読み込みガイド](DYNAMIC.md) · [中文](DYNAMIC.zh.md)
- [設計とホスト契約のノート](DESIGN.zh.md)
- [完全な変更履歴の一覧](CHANGELOG.md)

## FAQ

**接続に失敗したときは何を確認すればよいですか？** ホスト、ポート、ユーザー名、認証方式を確認してください。ホスト鍵が変わっている場合は、プラグイン専用の `known_hosts` から古いエントリを削除する前に、サーバーが意図的に再構築されたことを確認してください。

**AI は私のパスワードを見られますか？** いいえ。Host は SSH を確立する間だけ、DSH の暗号化された認証情報ストアから読み出します。プロファイルの一覧、ツール結果、ログ、ターミナル出力にパスワードの値が含まれることはありません。