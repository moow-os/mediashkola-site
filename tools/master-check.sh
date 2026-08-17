#!/usr/bin/env bash
# Мастер-чек сайта Медиашколы. Меряет ЖИВОЙ сайт и сверяет его с репозиторием,
# а не с чьим-то «готово». Каждая строка — то, что реально ломалось или может сломать
# продажу: транспорт, синхронность деплоя, предохранители Куратора, обещания клиенту.
#
#   bash tools/master-check.sh            # человеческий отчёт + изменения с прошлого прогона
#   bash tools/master-check.sh --json     # только итоговый JSON
#
# Exit: 0 — всё зелёное или только WARN; 1 — есть FAIL.
# Снимок состояния: ~/.local/state/msh-master-check/last.json.
# Диффер сравнивает по КЛЮЧУ строки, не по её тексту: переформулировка сообщения
# не должна выглядеть как изменение состояния сайта.

set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SITE="http://mediashkola.pro"
API="https://api.mediashkola.pro"
STATE_DIR="${HOME}/.local/state/msh-master-check"
JSON_ONLY=0; [[ "${1:-}" == "--json" ]] && JSON_ONLY=1
mkdir -p "$STATE_DIR"

PASS=0; WARN=0; FAIL=0; ROWS=()
row() { # row <status> <ключ> <текст>
  local s="$1" key="$2" msg="$3"
  case "$s" in PASS) PASS=$((PASS+1));; WARN) WARN=$((WARN+1));; FAIL) FAIL=$((FAIL+1));; esac
  ROWS+=("$s|$key|$msg")
  [[ $JSON_ONLY -eq 1 ]] && return 0
  local mark; case "$s" in PASS) mark="  ok  ";; WARN) mark=" warn ";; FAIL) mark=" FAIL ";; esac
  printf '[%s] %-14s %s\n' "$mark" "$key" "$msg"
}
code() { curl -s -o /dev/null --max-time 20 -w '%{http_code}' "$1" 2>/dev/null || echo 000; }
say()  { [[ $JSON_ONLY -eq 0 ]] && echo "$@"; return 0; }

say "── МАСТЕР-ЧЕК МЕДИАШКОЛЫ · $(date '+%Y-%m-%d %H:%M') ──"
say "── ТРАНСПОРТ ──"

# T1. Голый http обязан отдавать 200, а не 301: Enforce HTTPS убивает сайт на части
#     российских сетей (замер 17.08, обоснование в README).
c=$(code "$SITE/")
if   [[ "$c" == 200 ]]; then row PASS T1-http "http:// отдаёт 200 — сайт доступен без TLS"
elif [[ "$c" =~ ^30 ]];  then row FAIL T1-http "http:// отдаёт $c — похоже, включили Enforce HTTPS; на части РФ-сетей сайт умрёт"
else                          row FAIL T1-http "http:// отдаёт $c — сайт не отвечает"; fi

# T2/T3. Состояние Pages: Enforce и срок сертификата.
if command -v gh >/dev/null 2>&1; then
  pages=$(gh api repos/moow-os/mediashkola-site/pages 2>/dev/null)
  if [[ -n "$pages" ]]; then
    enf=$(printf '%s' "$pages" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("https_enforced"))' 2>/dev/null)
    exp=$(printf '%s' "$pages" | python3 -c 'import sys,json;print((json.load(sys.stdin).get("https_certificate") or {}).get("expires_at",""))' 2>/dev/null)
    [[ "$enf" == "False" ]] && row PASS T2-enforce "Enforce HTTPS выключен (так и задумано)" \
                            || row FAIL T2-enforce "Enforce HTTPS = $enf — включён; выключить, пока сайт на GitHub Pages"
    if [[ -n "$exp" ]]; then
      left=$(python3 -c "import datetime;print((datetime.date.fromisoformat('${exp:0:10}')-datetime.date.today()).days)" 2>/dev/null || echo "")
      if   [[ -z "$left" ]]; then row WARN T3-cert "срок сертификата не разобран: $exp"
      elif (( left < 14 ));  then row FAIL T3-cert "сертификат истекает через $left дн. ($exp) — автопродление не сработало"
      elif (( left < 30 ));  then row WARN T3-cert "сертификату осталось $left дн. ($exp) — следить за автопродлением"
      else                        row PASS T3-cert "сертификат до $exp ($left дн.)"; fi
    fi
  else row WARN T2-enforce "gh api pages не ответил — Enforce и сертификат не проверены"; fi
else   row WARN T2-enforce "gh не установлен — Enforce и сертификат не проверены"; fi

# T4. Приёмник заявок. Если он лежит — заявки родителей пропадают молча.
h=$(curl -s --max-time 20 "$API/health" 2>/dev/null)
if [[ -z "$h" ]]; then row FAIL T4-worker "$API/health не отвечает — форма записи никуда не доедет"
else
  ready=$(printf '%s' "$h" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("ready"))' 2>/dev/null)
  ids=$(printf   '%s' "$h" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("chat_ids",0))' 2>/dev/null)
  sheet=$(printf '%s' "$h" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("sheet_url"))' 2>/dev/null)
  [[ "$ready" == "True" ]] && row PASS T4-worker "воркер готов, получателей в Телеграме: $ids" \
                           || row FAIL T4-worker "воркер не готов: $h"
  [[ "$sheet" == "True" ]] && row PASS O1-sheet "таблица заявок подключена — обещание Кате «и туда и туда» закрыто" \
                           || row WARN O1-sheet "таблица заявок НЕ подключена: нет права записи, ждём доступ от владельца"
fi

# T5. Страницы и то, что грузится в браузере родителя.
for p in / /kurs.html /assets/site.css /assets/site.js /assets/brand/logo.svg /assets/brand/og-cover.png /data/calendar-2026.json; do
  c=$(code "$SITE$p"); k="T5${p//\//-}"; k="${k%-}"
  [[ "$c" == 200 ]] && row PASS "$k" "200 $p" || row FAIL "$k" "$c $p — битая ссылка на живом сайте"
done

say "── ДЕПЛОЙ ──"

# D1. Живой сайт обязан быть побайтово тем, что лежит в репозитории.
for f in index.html kurs.html data/calendar-2026.json; do
  lm=$(curl -s --max-time 20 "$SITE/$f" 2>/dev/null | md5 -q 2>/dev/null)
  rm_=$(md5 -q "$REPO/$f" 2>/dev/null); k="D1-$(basename "$f")"
  if   [[ -z "$lm" || -z "$rm_" ]]; then row WARN "$k" "$f — не удалось сравнить"
  elif [[ "$lm" == "$rm_" ]];       then row PASS "$k" "$f совпадает с репозиторием"
  else                                   row FAIL "$k" "$f на сайте НЕ равен репозиторию — деплой отстал или правили мимо git"; fi
done

# D2. Незакоммиченное и неотправленное — это работа, которой на сайте нет.
dirty=$(cd "$REPO" && git status --porcelain | wc -l | tr -d ' ')
[[ "$dirty" == 0 ]] && row PASS D2-dirty "рабочая копия чистая" || row WARN D2-dirty "$dirty незакоммиченных файлов"
(cd "$REPO" && git fetch -q origin 2>/dev/null)
ahead=$(cd "$REPO" && git rev-list --count origin/main..main 2>/dev/null || echo 0)
[[ "$ahead" == 0 ]] && row PASS D2-push "main совпадает с origin/main" \
                    || row FAIL D2-push "$ahead коммитов не отправлено — на сайте их нет"

say "── СОДЕРЖАНИЕ (предохранители и договорённости) ──"

# C1. Предохранитель Куратора: пустая сетка календаря клиенту не показывается никогда.
python3 - "$REPO" <<'PY' > /tmp/msh_cal.txt 2>/dev/null
import json,sys
d=json.load(open(sys.argv[1]+"/data/calendar-2026.json"))
sep=[x for x in d["weekly_lessons"]["dates"] if x.startswith("2026-09")]
print(len(sep), len(d["saturday_events"]), len(d["month_finals"]), len(d["tv_shoots"]), d.get("season_start",""))
PY
read -r n_sep n_sat n_fin n_tv s_start < /tmp/msh_cal.txt 2>/dev/null || true
if [[ -n "${n_sep:-}" ]] && (( n_sep > 0 && n_sat > 0 && n_fin > 0 )); then
  row PASS C1-full "календарь наполнен: сентябрь — $n_sep занятий, суббот — $n_sat, финалов — $n_fin, съёмок — $n_tv"
else
  row FAIL C1-full "календарь пуст или неполон — нарушен предохранитель «никогда не показывать пустую сетку»"
fi
[[ "${s_start:-}" == "2026-09-06" ]] && row PASS C1-start "старт сезона 6 сентября на месте" \
                                     || row FAIL C1-start "season_start = ${s_start:-нет} — разошёлся с «6 сентября»"

# C2. Возраст: правка Кати 17.08 — старшие 13–18, всего 7–18. Регресс сюда уже случался.
for f in index.html kurs.html; do
  a=$(grep -c "7–18" "$REPO/$f"); b=$(grep -c "13–18" "$REPO/$f")
  (( a > 0 && b > 0 )) && row PASS "C2-${f%%.*}" "$f: возрасты 7–18 и 13–18 на месте" \
                       || row FAIL "C2-${f%%.*}" "$f: потерян возраст (7–18: $a, 13–18: $b) — регресс правки Кати 17.08"
done

# C3. Канон цифр школы: «14 лет» и «~3000». Один раз уже вылетал при переписывании.
grep -q "14 лет" "$REPO/index.html" && row PASS C3-14let "канон «14 лет» на месте" || row FAIL C3-14let "канон «14 лет» пропал со страницы"
grep -q "~3000"  "$REPO/index.html" && row PASS C3-3000  "канон «~3000» на месте"  || row FAIL C3-3000  "канон «~3000» пропал со страницы"

# C4. og:url/og:image обязаны быть http:// — жёсткий https ведёт родителей в зависший TLS.
bad=$(grep -h -E 'og:(url|image)"? content="https://' "$REPO/index.html" "$REPO/kurs.html" | wc -l | tr -d ' ')
[[ "$bad" == 0 ]] && row PASS C4-og "og:url/og:image на http:// — карточка ссылки не уводит в TLS" \
                  || row FAIL C4-og "$bad тегов og с жёстким https:// — вернуть http://, иначе превью и переходы виснут в РФ"

# C5. Названия ноябрьского финала на страницах должны совпадать.
n_soc=$(grep -c "СОЦИАЛКА" "$REPO/index.html"); n_fest=$(grep -ci "ФЕСТИВАЛЬ СОЦИАЛЬНЫХ" "$REPO/kurs.html")
if (( n_soc > 0 && n_fest > 0 )); then
  row WARN C5-nov "ноябрьский финал назван по-разному: главная «СОЦИАЛКА», курс «ФЕСТИВАЛЬ СОЦИАЛЬНЫХ РОЛИКОВ» — спросить у Кати короткое имя"
else
  row PASS C5-nov "название ноябрьского финала не расходится"
fi

# C6. «уточняется» на живой странице — родитель видит дату без времени.
n_tbd=$(grep -c "уточняется" "$REPO/index.html")
(( n_tbd > 0 )) && row WARN C6-tbd "на главной $n_tbd раз «уточняется» (съёмки «Шустрое утро») — показано время, которого нет" \
                || row PASS C6-tbd "«уточняется» на главной не осталось"

# C7. Записка внутри календаря не должна противоречить его же данным.
shustroe=$(python3 -c "
import json;d=json.load(open('$REPO/data/calendar-2026.json'))
n=sum(1 for e in d['tv_shoots'] if 'ШУСТРОЕ' in e['title'])
print(n, 'НЕ внесено' in d.get('source',''))" 2>/dev/null)
set -- $shustroe
if [[ "${1:-0}" -gt 0 && "${2:-False}" == "True" ]]; then
  row WARN C7-note "записка календаря говорит «Шустрое утро НЕ внесено», а в данных $1 таких съёмок — записка врёт данным"
else
  row PASS C7-note "записка календаря не противоречит данным"
fi

say ""
say "итог: $PASS ok · $WARN warn · $FAIL fail"

{
  printf '{"ts":"%s","pass":%d,"warn":%d,"fail":%d,"rows":[' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$PASS" "$WARN" "$FAIL"
  first=1
  for r in "${ROWS[@]}"; do
    s="${r%%|*}"; rest="${r#*|}"; key="${rest%%|*}"; msg="${rest#*|}"
    [[ $first -eq 0 ]] && printf ','; first=0
    printf '{"status":"%s","key":"%s","msg":%s}' "$s" "$key" \
      "$(python3 -c 'import json,sys;print(json.dumps(sys.argv[1],ensure_ascii=False))' "$msg")"
  done
  printf ']}\n'
} > "$STATE_DIR/current.json"
[[ $JSON_ONLY -eq 1 ]] && cat "$STATE_DIR/current.json"

if [[ -f "$STATE_DIR/last.json" ]]; then
  python3 - "$STATE_DIR/last.json" "$STATE_DIR/current.json" <<'PY'
import json,sys
def load(p):
    try: return {r.get("key", r.get("id","?")): r for r in json.load(open(p))["rows"]}
    except Exception: return {}
old, new = load(sys.argv[1]), load(sys.argv[2])
lines=[]
for k,r in new.items():
    o=old.get(k)
    if o is None: lines.append(f'  НОВОЕ:      [{r["status"]}] {k} — {r["msg"]}')
    elif o["status"]!=r["status"]: lines.append(f'  СТАТУС:     [{o["status"]} → {r["status"]}] {k} — {r["msg"]}')
    elif o["msg"]!=r["msg"]: lines.append(f'  ПОДРОБНОСТЬ:[{r["status"]}] {k} — было: {o["msg"]} / стало: {r["msg"]}')
for k,o in old.items():
    if k not in new: lines.append(f'  ИСЧЕЗЛО:    [{o["status"]}] {k} — {o["msg"]}')
print("\n── ИЗМЕНЕНИЯ С ПРОШЛОГО ПРОГОНА ──\n" + "\n".join(lines) if lines else "\n(с прошлого прогона ничего не сдвинулось)")
PY
fi
cp "$STATE_DIR/current.json" "$STATE_DIR/last.json"

[[ $FAIL -gt 0 ]] && exit 1 || exit 0
