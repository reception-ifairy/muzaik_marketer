#!/usr/bin/env bash
# Koniec sesji (2026-11-06): czy nic nie zostało w połowie. Każda sesja Claude Code kończy się `npm run check:session`.
# Sprawdza: niezacommitowane pliki, commity niewypchnięte na origin, gałęzie bez merge'a do main (lokalne i zdalne),
# otwarte pull requesty, stashe, proces pm2 i spójność handbooka. Kod wyjścia 1 = coś zaległego (do zrobienia albo
# do wyjaśnienia właścicielowi). prywatne pliki właścicielki (PRIVATE) nigdy nie trafiają do repo.
set -u
cd "$(dirname "$0")/.." || exit 2

PRIVATE='docs/prywatne.json'
PM2_NAME='muzaik-marketer'
pending=0
ok() { printf '  \033[32m✓\033[0m %s\n' "$1"; }
bad() { printf '  \033[31m✗\033[0m %s\n' "$1"; pending=1; }
info() { printf '  • %s\n' "$1"; }

echo "Koniec sesji — $(date '+%Y-%m-%d %H:%M') — $(git rev-parse --abbrev-ref HEAD) @ $(git rev-parse --short HEAD)"

echo "Zmiany w repozytorium"
git fetch -q origin 2>/dev/null || info "nie udało się pobrać origin (sieć?) — porównanie z ostatnim znanym stanem"
changes=$(git status --porcelain | grep -v " ${PRIVATE}\$" || true)
if [ -n "$changes" ]; then bad "niezacommitowane albo nowe pliki:"; echo "$changes" | sed 's/^/      /'; else ok "drzewo czyste"; fi
git status --porcelain | grep -q " ${PRIVATE}\$" && info "${PRIVATE} — prywatny plik właściciela, celowo poza repo"

echo "Wypchnięcie"
branch=$(git rev-parse --abbrev-ref HEAD)
if git rev-parse --verify -q "origin/${branch}" >/dev/null; then
  read -r ahead behind <<<"$(git rev-list --left-right --count "${branch}...origin/${branch}")"
  [ "$ahead" -gt 0 ] && bad "${ahead} commit(ów) niewypchniętych na origin/${branch}" || ok "wszystko wypchnięte na origin/${branch}"
  [ "$behind" -gt 0 ] && bad "origin/${branch} ma ${behind} commit(ów), których tu nie ma (git pull)"
else
  bad "gałąź ${branch} nie ma odpowiednika na origin"
fi

echo "Gałęzie bez merge'a do main"
local_open=$(git branch --no-merged main --format='%(refname:short)' 2>/dev/null)
remote_open=$(git branch -r --no-merged origin/main --format='%(refname:short)' 2>/dev/null | grep -v '^origin/HEAD' || true)
[ -n "$local_open" ] && bad "lokalne: $(echo $local_open)" || ok "lokalne: brak"
[ -n "$remote_open" ] && bad "zdalne: $(echo $remote_open)" || ok "zdalne: brak"

echo "Pull requesty"
if command -v gh >/dev/null 2>&1 && prs=$(gh pr list --state open --json number,title,headRefName --template '{{range .}}#{{.number}} {{.title}} ({{.headRefName}}){{"\n"}}{{end}}' 2>/dev/null); then
  [ -n "$prs" ] && { bad "otwarte PR-y:"; echo "$prs" | sed 's/^/      /'; } || ok "brak otwartych PR-ów"
else
  info "gh niedostępne albo niezalogowane — PR-y sprawdź na GitHubie"
fi

echo "Stash"
stashes=$(git stash list)
[ -n "$stashes" ] && { bad "odłożone zmiany (git stash):"; echo "$stashes" | sed 's/^/      /'; } || ok "pusty"

echo "Serwer"
if command -v pm2 >/dev/null 2>&1; then
  status=$(pm2 jlist 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const p=JSON.parse(s).find(x=>x.name==='${PM2_NAME}');console.log(p?p.pm2_env.status:'brak')}catch{console.log('?')}})")
  [ "$status" = "online" ] && ok "pm2 ${PM2_NAME}: online" || bad "pm2 ${PM2_NAME}: ${status}"
else
  info "pm2 niedostępne"
fi

echo "Handbook i dokumentacja"
if out=$(node --test test/handbook.test.cjs 2>&1); then ok "npm run test:handbook: zaliczony"; else bad "npm run test:handbook: błędy"; echo "$out" | grep -E '^not ok|AssertionError|→' | head -20 | sed 's/^/      /'; fi

echo
if [ "$pending" -eq 0 ]; then echo "Nic zaległego — sesję można zamknąć."; else echo "Są zaległości — zrób je albo wyjaśnij właścicielowi, zanim zamkniesz sesję."; fi
exit "$pending"
