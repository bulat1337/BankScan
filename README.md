# BankScan

Локальный репозиторий для чтения остатков из уже авторизованных веб-сессий Альфа-Банка, ВТБ и Т-Банка через Chrome DevTools Protocol, без передачи логинов, паролей, cookies или токенов во внешние сервисы.

Основные entrypoints:
- [scripts/bank-balance-bridge.mjs](scripts/bank-balance-bridge.mjs)
- [scripts/bankscan](scripts/bankscan)
- [skills/bank-balance-bridge/SKILL.md](skills/bank-balance-bridge/SKILL.md)

## Часть 1. Работа со скриптами без Codex

### Что умеет bridge

- работает с `alpha`, `vtb` и `tbank`;
- поднимает отдельные persistent bridge-профили Chrome;
- открывает страницы банков и подключается к ним через CDP;
- ждёт ручную авторизацию, если банк требует логин;
- извлекает остатки по счетам и картам;
- для кредитных карт дополнительно достаёт долг, доступно, лимит, сроки платежа и льготный период, когда эти данные есть на странице деталей;
- пишет summary и raw scan-файлы вне репозитория;
- по умолчанию закрывает bridge-Chrome в конце `sync`.

Целевые страницы:
- Альфа: `https://web.alfabank.ru/dashboard`
- ВТБ: `https://online.vtb.ru/home/all-products`
- Т-Банк: `https://www.tbank.ru/mybank/`

### Что внутри репозитория

```text
.
├── README.md
├── package.json
├── scripts/
│   ├── bank-balance-bridge.mjs
│   ├── bankscan
│   └── banktree
└── skills/
    └── bank-balance-bridge/
        ├── SKILL.md
        └── agents/
            └── openai.yaml
```

Ключевые файлы:
- [scripts/bank-balance-bridge.mjs](scripts/bank-balance-bridge.mjs) — основной bridge для Альфы, ВТБ и Т-Банка
- [scripts/bankscan](scripts/bankscan) — короткий wrapper для запуска из любой папки
- [scripts/banktree](scripts/banktree) — helper для локальной работы с `git worktree`

### Требования

- macOS
- Node.js `>=22`
- Google Chrome
- `zsh` для wrapper-скрипта `bankscan`

### Где хранятся данные

Рабочее состояние и результаты лежат вне репозитория:
- `~/.codex/state/bank-balance-bridge/balances-summary.json`
- `~/.codex/state/bank-balance-bridge/output/*.json`
- `~/.codex/state/bank-balance-bridge/profiles/alpha`
- `~/.codex/state/bank-balance-bridge/profiles/tbank`
- `~/.codex/state/bank-balance-bridge/profiles/vtb`

Это сделано специально, чтобы не хранить реальные банковские данные в git-репозитории.

В summary:
- `banks.<bank>.balances` содержит общий список найденных балансов;
- `banks.<bank>.creditCards` содержит расширенные данные по кредиткам: долг, доступно, лимит, сроки платежа, льготный период и связанные маски карт.

### Быстрый старт

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

### Команда `bankscan`

Основные варианты:

```bash
bankscan
bankscan alpha
bankscan tbank
bankscan vtb
bankscan open all
bankscan scan all --reload
bankscan watch all --interval 300
bankscan --no-close-browser
bankscan --no-wait-for-login
```

Поведение wrapper:
- без аргументов: `sync all`
- `alpha|vtb|tbank|all`: `sync <bank>`
- любые остальные аргументы: прямой passthrough в `bank-balance-bridge.mjs`

### Установка глобальной команды

Если `~/Documents/MyScripts` уже добавлен в `PATH`, удобнее всего сделать symlink:

```bash
ln -sf "/Users/bulatmotygullin/Documents/BankScan/scripts/bankscan" "$HOME/Documents/MyScripts/bankscan"
```

Если текущий shell ещё не видит команду:

```bash
source ~/.zshrc
```

### npm-скрипты

Из корня репозитория доступны:

```bash
npm run open
npm run scan
npm run scan:reload
npm run sync
npm run sync:alpha
npm run sync:tbank
npm run sync:vtb
npm run help
npm run worktree -- help
```

### Локальная разработка через `git worktree`

Для этого проекта основной checkout остаётся в:

```text
/Users/bulatmotygullin/Documents/BankScan
```

Все дополнительные `worktree` для feature-веток должны лежать в одной общей папке внутри `Documents`:

```text
/Users/bulatmotygullin/Documents/BankScan/worktrees
```

Правила:
- `main` держим в основном checkout, а не в отдельном feature-worktree;
- одна фича = одна локальная ветка = один отдельный `worktree`;
- не создаём отдельную соседнюю папку в `~/Documents` вроде `BankScan-worktrees`;
- feature-ветки нужны только для локальной разработки и не пушатся на GitHub;
- после завершения фичи сначала валидируем изменения в её `worktree`, потом согласуем merge в `main`, и только после локального merge можно публиковать обновлённый `main`, если это действительно нужно.

Базовые команды:

```bash
scripts/banktree root
scripts/banktree add feature/vtb-parser
scripts/banktree list
scripts/banktree remove feature/vtb-parser
```

То же через npm:

```bash
npm run worktree -- add feature/vtb-parser
```

Важно про symlink и тесты:
- `~/Documents/MyScripts/bankscan` должен оставаться привязанным к стабильному checkout на `main`;
- если меняете wrapper или bridge в feature-worktree, запускайте [scripts/bankscan](scripts/bankscan) или `node scripts/bank-balance-bridge.mjs` прямо из этого `worktree`, а не через глобальный symlink;
- symlink `~/.codex/skills/bank-balance-bridge` по умолчанию тоже лучше держать на `main`; временно переключать его на feature-worktree имеет смысл только если вы осознанно тестируете изменения skill-файлов.

### Безопасность

- не коммитьте `balances-summary.json` и raw scan-файлы;
- не храните в репозитории реальные остатки, токены, cookies и экспортированные страницы;
- используйте bridge-профили только для этой автоматизации;
- не держите debug-enabled Chrome включённым без необходимости;
- не привязывайте bridge к стандартному `~/Library/Application Support/Google/Chrome`: Chrome 136+ игнорирует remote debugging в standard user data dir.

### Ограничения

- банки могут менять верстку и ломать эвристики;
- Т-Банк сканируется с главного экрана интернет-банка `https://www.tbank.ru/mybank/`, где банк показывает карты и счета после авторизации;
- ВТБ особенно чувствителен к reload/navigation, поэтому в bridge для него уже есть специальное поведение;
- успешный скан зависит от того, что авторизация завершена именно в bridge-профиле;
- если банк сам истёк сессию на сервере, автоматизация не обойдёт повторный логин.

## Часть 2. Skill для Codex

В репозитории лежит локальная копия актуального skill:
- [skills/bank-balance-bridge/SKILL.md](skills/bank-balance-bridge/SKILL.md)
- [skills/bank-balance-bridge/agents/openai.yaml](skills/bank-balance-bridge/agents/openai.yaml)

Если хотите, чтобы Codex использовал именно репозиторную версию skill, а не внешнюю копию, можно сделать symlink:

```bash
rm -rf "$HOME/.codex/skills/bank-balance-bridge"
ln -s "/Users/bulatmotygullin/Documents/BankScan/skills/bank-balance-bridge" "$HOME/.codex/skills/bank-balance-bridge"
```

После этого в Codex можно просить, например:

```text
Используй $bank-balance-bridge и проверь остатки
```

или просто:

```text
Проверь остатки в Альфе, ВТБ и Т-Банке
```

Ожидаемый workflow для Codex:
- использовать `bankscan` как основной entrypoint;
- ждать ручную авторизацию, если нужна;
- читать результат из `~/.codex/state/bank-balance-bridge/balances-summary.json`;
- для кредитных карт читать не только `balances`, но и `creditCards`;
- не просить пользователя передавать пароли, SMS-коды, cookies или токены;
- для изменений в репозитории держать одну фичу в одной локальной ветке и в одном отдельном `worktree` под `/Users/bulatmotygullin/Documents/BankScan/worktrees`;
- не пушить feature-ветки;
- перед merge завершённой фичи в `main` сначала согласовывать это с пользователем.
