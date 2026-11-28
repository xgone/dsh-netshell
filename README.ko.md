# DSH-NetShell

<p align="center">
  <a href="https://www.npmjs.com/package/@xgone/dsh-netshell"><img src="https://img.shields.io/npm/v/%40xgone%2Fdsh-netshell?logo=npm&label=npm" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/@xgone/dsh-netshell"><img src="https://img.shields.io/npm/dm/%40xgone%2Fdsh-netshell?logo=npm&label=downloads" alt="npm monthly downloads" /></a>
  <a href="https://github.com/xgone/dsh-netshell/actions/workflows/ci.yml"><img src="https://github.com/xgone/dsh-netshell/actions/workflows/ci.yml/badge.svg?branch=master" alt="CI status" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/xgone/dsh-netshell?label=license" alt="MIT license" /></a>
</p>

<p align="center"><a href="README.zh.md">中文</a> · <a href="README.md">English</a> · <a href="README.ru.md">Русский</a> · <a href="README.ja.md">日本語</a> · <a href="README.de.md">Deutsch</a> · <a href="README.fr.md">Français</a> · <a href="README.es.md">Español</a> · <strong>한국어</strong></p>

<p align="center">
  <img src="assets/social-preview.png" alt="DSH-NetShell — Guarded local and remote SSH terminal" width="720" />
</p>

<p align="center"><strong>DeepSeek Harness를 위한 보호된 로컬·원격 SSH 터미널</strong></p>

DSH-NetShell을 사용하면 서버를 관리하고 실시간 터미널을 사용할 수 있으며, DSH에서 위험한 명령이 실행되기 전에 사람이 확인하는 명확한 지점을 유지할 수 있습니다. 사람의 입력과 AI 작업은 동일한 명령 가드를 공유합니다. UI 문구는 DSH UI 로캘을 따르며, 다음 언어를 지원합니다: 중국어, 영어, 러시아어, 일본어, 독일어, 프랑스어, 스페인어, 한국어.

## 주요 기능

| 기능 | 제공 내용 |
| --- | --- |
| 로컬 터미널 | SSH 설정 없이 현재 기기에서 `bash`, `sh`, PowerShell, `cmd`를 시작합니다. Windows에서는 PowerShell/pwsh/cmd를 우선 사용합니다 |
| 원격 SSH | 호스트, 포트, 사용자, 인증을 관리하고 여러 세션을 사용합니다. Windows OpenSSH Client를 지원합니다 |
| 명령 가드 | `allow`는 즉시 실행, `ask`는 승인 대기, `deny`는 차단 |
| 실행 과정 표시 | 사람의 입력과 AI 명령이 동일한 실시간 터미널 패널에 표시됩니다 |
| 자격 증명 격리 | SSH 비밀번호는 DSH의 암호화된 저장소에만 보관되며 AI 메시지, 도구 결과, 로그에 포함되지 않습니다 |
| 명령 기록 | 실행, 차단, 허용 횟수와 모든 결정 기록을 확인합니다 |
| 인터페이스 언어 | DSH UI 로캘을 따르며 중국어, 영어, 러시아어, 일본어, 독일어, 프랑스어, 스페인어, 한국어를 지원합니다 |

## 설치

배포된 패키지:

```bash
dsh plugin --profile web add @xgone/dsh-netshell
```

로컬 체크아웃에서 설치:

```bash
dsh plugin --profile web add link:/path/to/dsh-netshell
```

Windows에서는 Windows OpenSSH Client를 설치·활성화하세요(`ssh -V`로 사용 가능 여부를 확인할 수 있습니다). 저장된 비밀번호를 이용한 자동화에는 `SSH_ASKPASS_REQUIRE=force` 지원이 필요합니다(OpenSSH 8.7 이상 권장). 설치 후 DSH Web을 다시 시작한 다음 **설정 → 터미널**을 여세요.

## 빠른 시작

### 로컬 터미널

1. 메인 영역에서 **터미널** 탭을 엽니다.
2. **로컬 터미널** 행에서 **새로 만들기**를 클릭합니다.
3. 명령을 입력하고 실시간 출력을 확인합니다.

로컬 터미널은 원격 프로필이나 SSH 비밀번호를 읽지 않습니다.

### 원격 서버

1. **설정 → 터미널 → 새로 만들기**를 엽니다.
2. 이름, 호스트, 포트, 사용자 이름을 입력합니다.
3. 비밀번호, 개인 키, `ssh-agent` 인증 중에서 선택합니다.
4. 권한 수준을 선택합니다. 첫 연결에서는 `guarded`를 유지하세요.
5. **터미널** 탭으로 돌아가 서버 행에서 **연결**을 클릭합니다.

저장된 비밀번호는 '설정됨' 상태로만 표시되며 다시는 화면에 표시되지 않습니다. Windows에서 개인 키 인증은 현재 사용자의 ACL로 보호되는 임시 복사본을 사용합니다. 이 복사본은 세션이 끝나면 삭제되며, 원본 키 파일과 해당 ACL은 그대로 유지됩니다.

### 위험한 명령

명령은 Enter를 누를 때 검사됩니다:

| 수준 | 동작 |
| --- | --- |
| `open` | 일상적인 사용. 강제 차단(deny) 규칙은 여전히 적용됩니다 |
| `guarded` (기본) | 위험이 큰 명령은 승인을 위해 대기합니다 |
| `locked` | 명시적으로 허용된 명령만 즉시 실행됩니다 |

`ask` 명령의 경우 **한 번 실행**, **이 명령 항상 허용**, **거부** 중에서 선택합니다. 영구 허용은 현재 서버와 정확히 동일한 명령 텍스트에만 적용됩니다.

## UI 미리보기

![Terminal and dangerous-command confirmation](assets/terminal-en.png)

터미널 하단에는 실행, 차단, 허용 횟수가 표시됩니다. **기록**을 열면 명령 기록을 확인할 수 있습니다. 다른 DSH 탭으로 전환해도 백그라운드 세션의 연결은 끊기지 않습니다.

## AI 도구

이 플러그인은 두 가지 모델 도구를 제공합니다:

| 도구 | 용도 |
| --- | --- |
| `netshell_servers` | 비밀번호 없이 서버 프로필을 나열합니다 |
| `netshell_run` | 선택한 서버에서 명령 하나를 실행합니다 |

AI 명령과 사람의 입력은 동일한 가드를 사용합니다. `deny` 명령은 절대 실행되지 않으며, `ask` 명령은 DSH 확인 UI나 터미널 패널에서 사용자가 직접 결정해야 합니다. AI는 비밀번호를 볼 수 없고 승인 결과를 위조할 수도 없습니다.

모델 세션이 서버를 처음 사용할 때, 또는 사용자가 해당 서버의 연결을 직접 해제한 뒤에는 `netshell_run`이 SSH를 시작하기 전에 원격 연결 승인을 요청합니다. 승인은 현재 플러그인이 실행되는 동안 모델 세션과 서버 단위로 유지됩니다. 서로 다른 모델 세션은 동일한 SSH 세션을 재사용하더라도 각각 승인해야 합니다. 네트워크 장애, SSH 종료, 연결 시간 초과는 이미 승인된 모델 세션에 대해서만 재연결을 트리거합니다. 직접 연 GUI 세션은 모델 승인을 대체하지 않습니다. 확인 서비스를 사용할 수 없으면 플러그인은 안전하게 실패(fail closed)하며 자동으로 연결하지 않습니다.

## 보안 경계

이것은 작업 가드이며 완전한 보안 샌드박스가 아닙니다. 이 플러그인의 터미널과 `netshell_run`을 통해 들어오는 명령을 보호합니다. 다른 플러그인이나 일반 셸 도구가 만든 SSH 연결은 적용 범위 밖입니다. 민감한 환경에서는 `locked`를 사용하고, 대화형 프로그램 내부에서의 동작은 신중하게 검토하세요.

SSH 호스트 키는 사용자의 `~/.ssh/known_hosts`와 분리된 플러그인 전용 `$DSH_HOME/netshell/known_hosts`에 저장됩니다(`DSH_HOME`이 설정되지 않은 경우 `~/.dsh/netshell`을 사용합니다).

## 문서

- [中文 README](README.zh.md) · [English README](README.md) · [Русский README](README.ru.md) · [日本語 README](README.ja.md) · [Deutsch README](README.de.md) · [Français README](README.fr.md) · [Español README](README.es.md)
- [업데이트](UPDATES.md) · [中文](UPDATES.zh.md)
- [기술 노트](TECHNICAL.md) · [中文](TECHNICAL.zh.md)
- [동적 로딩 가이드](DYNAMIC.md) · [中文](DYNAMIC.zh.md)
- [설계 및 호스트 계약 노트](DESIGN.zh.md)
- [전체 변경 이력](CHANGELOG.md)

## 자주 묻는 질문

**연결이 실패하면 무엇을 확인해야 하나요?** 호스트, 포트, 사용자 이름, 인증 방식을 확인하세요. 호스트 키가 변경되었다면 서버가 의도적으로 재구축된 것인지 먼저 확인한 다음, 플러그인 전용 `known_hosts` 파일에서 오래된 항목을 제거하세요.

**AI가 내 비밀번호를 볼 수 있나요?** 아니요. Host는 SSH 연결을 수립하는 동안에만 DSH의 암호화된 자격 증명 저장소에서 비밀번호를 읽습니다. 프로필 목록, 도구 결과, 로그, 터미널 출력에는 비밀번호 값이 포함되지 않습니다.
