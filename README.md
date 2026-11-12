# RandomCord for Revenge

RandomCord as slash commands for the Revenge Discord client mod. The commands work in every server and DM, and every reply is local, so only you can see it. The webhook message itself posts normally.

This is written for Revenge's classic plugin format (the Vendetta/Bunny plugin API that Revenge Manager installs today). It is plain JavaScript, so there is nothing to build.

## Install

1. Put the `randomcord` folder on any static host. GitHub Pages works, for example in the same repo as the RandomCord app.
2. In Revenge go to Settings, Plugins, Install, and paste the folder URL ending in a slash, like `https://YOURNAME.github.io/REPO/randomcord/`.
3. Turn the plugin on.

## First steps

1. `/rc-use` and paste a webhook URL (or `/rc-save` it under a name first).
2. `/rc-send message:hello`
3. `/rc-help` lists every command.

## Commands (34)

| Group | Commands |
| --- | --- |
| Send | `rc-send` `rc-quick` `rc-embed` `rc-preview` `rc-json` `rc-link` `rc-hub` `rc-poll` |
| Manage | `rc-edit` `rc-delete` |
| Batch | `rc-bulk` `rc-rotate` `rc-split` |
| Settings | `rc-identity` `rc-mentions` `rc-thread` |
| Webhooks | `rc-use` `rc-save` `rc-remove` `rc-hooks` `rc-health` `rc-info` `rc-ping` |
| Templates | `rc-tpl-save` `rc-tpl-send` `rc-tpl-list` `rc-tpl-delete` `rc-vars` |
| History and backup | `rc-history` `rc-resend` `rc-clear-history` `rc-export` `rc-import` |

Tips:
- Type `\n` inside any text option for a new line.
- Variables like `{date}`, `{time}`, `{random}`, `{randint:1-100}` and `{pick:a|b|c}` are filled in when you send.
- Lists inside one option use `|` between items. Embed fields use `Name|Value|1;Name2|Value2`, where `1` makes a field inline.
- Everything, including webhook URLs, is stored in the plugin's storage on your phone.

## Notes

- Replies are shown as local bot messages. If your Revenge version can't create those, the reply falls back to a short toast.
- `rc-preview` tries to show a local embed. If it doesn't render on your version, the header line still appears.
- There is no file command, because webhooks can't take attachments from a command. Scheduled sending is not included.
