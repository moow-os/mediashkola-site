#!/usr/bin/env bash
# Показывает chat_id тех, кто уже нажал Start в боте.
# Токен спрашивается скрытым вводом: он не попадает ни в аргументы, ни в историю shell,
# ни в вывод. Печатаются только id, имя и тип чата — это не секреты.
set -euo pipefail

printf 'Токен бота (ввод не отображается): '
read -rs TOKEN
printf '\n\n'

[ -n "${TOKEN:-}" ] || { echo 'Пусто — нечего спрашивать.' >&2; exit 1; }

curl -sS --max-time 20 "https://api.telegram.org/bot${TOKEN}/getUpdates" \
| python3 -c '
import json, sys
d = json.load(sys.stdin)
if not d.get("ok"):
    print("Telegram отказал:", d.get("description", d))
    sys.exit(1)
seen = {}
for u in d.get("result", []):
    m = u.get("message") or u.get("my_chat_member") or {}
    c = m.get("chat")
    if c:
        seen[c["id"]] = c
if not seen:
    print("Пока никто не нажимал Start — либо нажали давно, и Telegram уже отдал эти события.")
    print("Пусть нажмут Start (или напишут боту любое слово) и запусти снова.")
    sys.exit(0)
print("Кто написал боту:")
print()
for cid, c in seen.items():
    parts = [x for x in [c.get("first_name"), c.get("last_name")] if x]
    name = c.get("title") or " ".join(parts) or c.get("username") or ""
    print("  {}\t{}\t{}".format(cid, c.get("type"), name))
print()
print("Строкой для TG_CHAT_IDS:")
print("  " + ",".join(str(k) for k in seen))
'
