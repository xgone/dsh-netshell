# DSH-NetShell

<p align="center">
  <a href="https://www.npmjs.com/package/@xgone/dsh-netshell"><img src="https://img.shields.io/npm/v/%40xgone%2Fdsh-netshell?logo=npm&label=npm" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/@xgone/dsh-netshell"><img src="https://img.shields.io/npm/dm/%40xgone%2Fdsh-netshell?logo=npm&label=downloads" alt="npm monthly downloads" /></a>
  <a href="https://github.com/xgone/dsh-netshell/actions/workflows/ci.yml"><img src="https://github.com/xgone/dsh-netshell/actions/workflows/ci.yml/badge.svg?branch=master" alt="CI status" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/xgone/dsh-netshell?label=license" alt="MIT license" /></a>
</p>

<p align="center"><a href="README.md">中文</a> · <a href="README.en.md">English</a> · <a href="README.ja.md">日本語</a> · <strong>Español</strong> · <a href="README.fr.md">Français</a> · <a href="README.de.md">Deutsch</a> · <a href="README.ru.md">Русский</a> · <a href="README.pt.md">Português</a></p>

<p align="center">
  <img src="assets/social-preview.png" alt="DSH-NetShell — Guarded local and remote SSH terminal" width="720" />
</p>

<p align="center"><strong>Un terminal SSH local y remoto con protección para DeepSeek Harness</strong></p>

DSH-NetShell te permite gestionar servidores, usar un terminal en vivo y mantener un punto de control humano claro antes de que se ejecuten comandos de riesgo en DSH. La entrada humana y las acciones de la IA comparten la misma protección de comandos. Los textos de la interfaz siguen la configuración regional de DSH: chino, inglés, japonés, español, francés, alemán, ruso o portugués.

## Aspectos destacados

| Capacidad | Qué obtienes |
| --- | --- |
| Terminal local | Inicia `bash`, `sh`, PowerShell o `cmd` en el dispositivo actual sin configurar SSH; en Windows se prefiere PowerShell/pwsh/cmd |
| SSH remoto | Gestiona hosts, puertos, usuarios y autenticación con varias sesiones; compatible con Windows OpenSSH Client |
| Protección de comandos | `allow` se ejecuta de inmediato, `ask` espera aprobación y `deny` bloquea |
| Ejecución visible | La entrada humana y los comandos de la IA aparecen en el mismo panel de terminal en vivo |
| Aislamiento de credenciales | Las contraseñas SSH permanecen en el almacén cifrado de DSH y nunca entran en mensajes de IA, resultados de herramientas ni registros |
| Historial de comandos | Consulta los recuentos de ejecutados, bloqueados y permitidos, además de cada registro de decisión |
| Idioma de la interfaz | Chino, inglés, japonés, español, francés, alemán, ruso o portugués, siguiendo la configuración regional de la interfaz de DSH |

## Instalación

Paquete publicado:

```bash
dsh plugin --profile web add @xgone/dsh-netshell
```

Desde un checkout local:

```bash
dsh plugin --profile web add link:/path/to/dsh-netshell
```

En Windows, instala o habilita el cliente Windows OpenSSH Client (`ssh -V` comprueba su disponibilidad); la automatización con contraseña guardada requiere compatibilidad con `SSH_ASKPASS_REQUIRE=force` (se recomienda OpenSSH 8.7 o posterior). Reinicia DSH Web tras la instalación y luego abre **Configuración → Terminal**.

## Inicio rápido

### Terminal local

1. Abre la pestaña **Terminal** en el área principal.
2. Haz clic en **Nuevo** en la fila **Terminal local**.
3. Escribe comandos y observa la salida en vivo.

El terminal local no lee perfiles remotos ni contraseñas SSH.

### Servidor remoto

1. Abre **Configuración → Terminal → Nuevo**.
2. Introduce un nombre, host, puerto y usuario.
3. Elige autenticación con contraseña, clave privada o `ssh-agent`.
4. Elige un nivel de permisos; mantén `guarded` para una primera conexión.
5. Vuelve a la pestaña **Terminal** y haz clic en **Conectar** en la fila del servidor.

Una contraseña guardada solo se muestra como estado configurado y nunca se vuelve a mostrar. En Windows, la autenticación con clave privada usa una copia temporal protegida por las ACL del usuario actual; se elimina al terminar la sesión, y el archivo de clave original y sus ACL quedan intactos.

### Comandos de riesgo

Los comandos se comprueban al pulsar Intro:

| Nivel | Comportamiento |
| --- | --- |
| `open` | Uso diario; las reglas de denegación estricta siguen aplicándose |
| `guarded` (predeterminado) | Los comandos de alto riesgo se detienen para su aprobación |
| `locked` | Solo se ejecutan directamente los comandos permitidos explícitamente |

Para un comando `ask`, elige **Ejecutar una vez**, **Permitir siempre este comando** o **Denegar**. Un permiso permanente se aplica solo al servidor actual y al texto exacto del comando.

## Vista previa de la interfaz

![Terminal y confirmación de comando peligroso](assets/terminal-en.png)

El pie del terminal muestra los recuentos de ejecutados, bloqueados y permitidos. Abre **Historial** para revisar los registros de comandos. Cambiar a otra pestaña de DSH no desconecta una sesión en segundo plano.

## Herramientas de IA

El plugin expone dos herramientas de modelo:

| Herramienta | Propósito |
| --- | --- |
| `netshell_servers` | Lista los perfiles de servidor sin contraseñas |
| `netshell_run` | Ejecuta un comando en un servidor seleccionado |

Los comandos de la IA y la entrada humana usan la misma protección. Los comandos `deny` nunca se ejecutan, y los comandos `ask` requieren una decisión tuya en la interfaz de confirmación de DSH o en el panel del terminal. La IA no puede ver las contraseñas ni falsificar resultados de aprobación.

En el primer uso de un servidor por parte de una sesión de modelo, o después de que el usuario desconecte manualmente ese servidor, `netshell_run` solicita aprobación para la conexión remota antes de iniciar SSH. La aprobación se conserva por sesión de modelo y servidor durante la vida útil actual del plugin; las distintas sesiones de modelo deben aprobar de forma independiente incluso cuando reutilizan la misma sesión SSH. Un fallo de red, una salida de SSH o un tiempo de espera de conexión solo provocan la reconexión de la sesión de modelo ya aprobada. Una sesión GUI abierta manualmente no sustituye la aprobación del modelo. Si el servicio de confirmación no está disponible, el plugin falla de forma segura y no se conecta automáticamente.

## Límite de seguridad

Esto es una protección de operaciones, no un sandbox de seguridad completo. Protege los comandos que entran por el terminal de este plugin y por `netshell_run`; las conexiones SSH creadas por otros plugins o herramientas de shell genéricas quedan fuera de su alcance. Usa `locked` en entornos sensibles y revisa con cuidado las acciones dentro de programas interactivos.

Las claves de host SSH se guardan en el archivo privado del plugin `$DSH_HOME/netshell/known_hosts` (con `~/.dsh/netshell` como alternativa cuando `DSH_HOME` no está definida), separado del `~/.ssh/known_hosts` del usuario.

## Documentación

- [中文 README](README.md) · [English README](README.en.md) · [日本語 README](README.ja.md) · [Français README](README.fr.md) · [Deutsch README](README.de.md) · [Русский README](README.ru.md) · [Português README](README.pt.md)
- [Actualizaciones](UPDATES.md) · [中文](UPDATES.zh.md)
- [Notas técnicas](TECHNICAL.md) · [中文](TECHNICAL.zh.md)
- [Guía de carga dinámica](DYNAMIC.md) · [中文](DYNAMIC.zh.md)
- [Notas de diseño y contrato de host](DESIGN.zh.md)
- [Historial de cambios completo](CHANGELOG.md)

## Preguntas frecuentes

**¿Qué debo revisar cuando falla una conexión?** Verifica el host, el puerto, el usuario y el método de autenticación. Si la clave de host ha cambiado, confirma que el servidor se reconstruyó intencionadamente antes de eliminar la entrada obsoleta del archivo `known_hosts` privado del plugin.

**¿Puede la IA ver mi contraseña?** No. El host la lee del almacén de credenciales cifradas de DSH solo mientras establece SSH; los listados de perfiles, los resultados de herramientas, los registros y la salida del terminal nunca contienen el valor de la contraseña.