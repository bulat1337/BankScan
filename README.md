# BankScan

Локальный репозиторий для чтения остатков из уже авторизованных веб-сессий Альфа-Банка и ВТБ через Chrome DevTools Protocol, без передачи логинов, паролей, cookies или токенов во внешние сервисы.

Сейчас это основной source of truth для всей логики:
- multi-bank bridge CLI;
- короткая глобальная команда `bankscan`;
- Codex skill `bank-balance-bridge`;
- legacy alfa-only prototype.

## Что внутри

```text
.
├── README.md
├── package.json
├── scripts/
│   ├── alpha-dashboard-read.mjs
│   ├── bank-balance-bridge.mjs
│   └── bankscan
└── skills/
    └── bank-balance-bridge/
        ├── SKILL.md
        └── agents/
            └── openai.yaml
```

Ключевые файлы:
- [scripts/bank-balance-bridge.mjs](/Users/bulatmotygullin/Documents/BankScan/scripts/bank-balance-bridge.mjs) — основной bridge для Альфы и ВТБ.
- [scripts/bankscan](/Users/bulatmotygullin/Documents/BankScan/scripts/bankscan) — короткий wrapper для запуска из любой папки.
- [skills/bank-balance-bridge/SKILL.md](/Users/bulatmotygullin/Documents/BankScan/skills/bank-balance-bridge/SKILL.md) — локальная копия актуального Codex skill.
- [scripts/alpha-dashboard-read.mjs](/Users/bulatmotygullin/Documents/BankScan/scripts/alpha-dashboard-read.mjs) — исходный alfa-only prototype, оставлен как legacy reference.

## Что умеет bridge

- работает с `alpha` и `vtb`;
- поднимает отдельные persistent bridge-профили Chrome;
- открывает страницы банков и подключается к ним через CDP;
- ждёт ручную авторизацию, если банк требует логин;
- извлекает только остатки по счетам и картам;
- пишет summary и raw scan-файлы;
- по умолчанию закрывает bridge-Chrome в конце `sync`.

Целевые страницы:
- Альфа: `https://web.alfabank.ru/dashboard`
- ВТБ: `https://online.vtb.ru/home/all-products`

## Требования

- macOS
- Node.js `>=22`
- Google Chrome
- `zsh` для wrapper-скрипта `bankscan`

## Где хранятся данные

Рабочее состояние и результаты лежат вне репозитория:
- `~/.codex/state/bank-balance-bridge/balances-summary.json`
- `~/.codex/state/bank-balance-bridge/output/*.json`
- `~/.codex/state/bank-balance-bridge/profiles/alpha`
- `~/.codex/state/bank-balance-bridge/profiles/vtb`

Это сделано специально, чтобы не хранить реальные банковские данные в git-репозитории.

## Быстрый старт

Из корня репозитория:

```bash
node scripts/bank-balance-bridge.mjs open all
```

В открывшихся bridge-окнах Chrome войдите в банки один раз.

После этого обычный запуск:

```bash
node scripts/bank-balance-bridge.mjs sync all
```

Или короткой командой:

```bash
bankscan
```

По умолчанию `sync` и `bankscan`:
- открывают нужные окна;
- ждут, если требуется логин;
- сканируют банки;
- закрывают bridge-Chrome.

## Команда `bankscan`

Основные варианты:

```bash
bankscan
bankscan alpha
bankscan vtb
bankscan open all
bankscan scan all --reload
bankscan watch all --interval 300
bankscan --no-close-browser
bankscan --no-wait-for-login
```

Поведение wrapper:
- без аргументов: `sync all`
- `alpha|vtb|all`: `sync <bank>`
- любые остальные аргументы: прямой passthrough в `bank-balance-bridge.mjs`

## Установка глобальной команды

Если `~/Documents/MyScripts` уже добавлен в `PATH`, удобнее всего сделать symlink:

```bash
ln -sf "/Users/bulatmotygullin/Documents/BankScan/scripts/bankscan" "$HOME/Documents/MyScripts/bankscan"
```

Если текущий shell ещё не видит команду:

```bash
source ~/.zshrc
```

## npm-скрипты

Из корня репозитория доступны:

```bash
npm run open
npm run scan
npm run scan:reload
npm run sync
npm run sync:alpha
npm run sync:vtb
npm run help
npm run legacy:alpha
```

## Codex Skill

В репозитории лежит локальная копия актуального skill:
- [skills/bank-balance-bridge/SKILL.md](/Users/bulatmotygullin/Documents/BankScan/skills/bank-balance-bridge/SKILL.md)
- [skills/bank-balance-bridge/agents/openai.yaml](/Users/bulatmotygullin/Documents/BankScan/skills/bank-balance-bridge/agents/openai.yaml)

Если хотите, чтобы Codex использовал именно репозиторную версию skill, а не внешнюю копию, можно сделать symlink:

```bash
rm -rf "$HOME/.codex/skills/bank-balance-bridge"
ln -s "/Users/bulatmotygullin/Documents/BankScan/skills/bank-balance-bridge" "$HOME/.codex/skills/bank-balance-bridge"
```

## Безопасность

- не коммитьте `balances-summary.json` и raw scan-файлы;
- не храните в репозитории реальные остатки, токены, cookies и экспортированные страницы;
- используйте bridge-профили только для этой автоматизации;
- не держите debug-enabled Chrome включённым без необходимости;
- не привязывайте bridge к стандартному `~/Library/Application Support/Google/Chrome`: Chrome 136+ игнорирует remote debugging в standard user data dir.

## Ограничения

- банки могут менять верстку и ломать эвристики;
- ВТБ особенно чувствителен к reload/navigation, поэтому в bridge для него уже есть специальное поведение;
- успешный скан зависит от того, что авторизация завершена именно в bridge-профиле;
- если банк сам истёк сессию на сервере, автоматизация не обойдёт повторный логин.

## Legacy

Старый alfa-only скрипт [scripts/alpha-dashboard-read.mjs](/Users/bulatmotygullin/Documents/BankScan/scripts/alpha-dashboard-read.mjs) сохранён для истории и точечной отладки, но основным инструментом теперь считается только `bank-balance-bridge.mjs` и `bankscan`.
