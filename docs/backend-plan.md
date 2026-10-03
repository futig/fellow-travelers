# Бэкенд: техническая разбивка

Требования и этапы — в [`Capabilities_Poputchiki.md`](Capabilities_Poputchiki.md) (источник истины), API —
в [`contracts/`](contracts/). Здесь только **как** делаем бэкенд и в каком порядке. Задачи сформулированы так,
чтобы оркестратор мог отдать каждую агенту `implementer` (см. `CLAUDE.md`).

## Стек

| Что | Выбор | Почему |
| --- | --- | --- |
| Язык | Python 3.12 | `backend/.gitignore` уже под Python |
| HTTP API | FastAPI + Pydantic v2 | OpenAPI из коробки — легко сверять с контрактом |
| БД | PostgreSQL 16, SQLAlchemy 2 (async), Alembic | `timestamptz`, блокировки для подбора |
| Бот | aiogram 3, тот же процесс/репозиторий, общий слой сервисов | Бот только сохраняет телефон и открывает мини-приложение |
| Фон (MVP) | APScheduler в отдельном процессе-воркере | Опрос рейсов, уведомления; Celery пока избыточен |
| Тесты | pytest, pytest-asyncio, httpx, testcontainers-postgres | |
| Качество | ruff (lint + format), mypy | |
| Зависимости | uv, `pyproject.toml` | |
| Запуск | Docker Compose: `api`, `bot`, `db` (+ `worker` в MVP) | |

## Структура `backend/`

```
backend/
  pyproject.toml  alembic.ini  Dockerfile  docker-compose.yml  .env.example
  app/
    main.py                 # FastAPI app, роутеры, обработчики ошибок → формат Error из контракта
    config.py               # pydantic-settings: DATABASE_URL, BOT_TOKEN, BOT_USERNAME, ...
    db.py                   # engine, session
    auth/telegram.py        # проверка initData (HMAC), зависимость current_user
    errors.py               # AppError(code, message, http_status, details)
    models/                 # ORM: user, event, membership, location, trip, application, transfer
    schemas/                # Pydantic-модели строго по openapi.yaml
    services/               # бизнес-логика, без HTTP: events, invites, trips, applications, transfers
    matching/               # ЧИСТЫЕ функции подбора, без БД (CAP-06)
    api/v1/                 # роутеры: me, events, invites, trips, applications, admin
    bot/                    # aiogram: /start, приём контакта, кнопки WebApp
  migrations/
  tests/  unit/ (matching, auth)  api/ (по эндпоинтам)
  data/airports.csv         # справочник аэропортов (IATA, город, страна, IANA tz) для сидов
```

## Модель данных (pre-MVP)

| Таблица | Ключевые поля | Ограничения |
| --- | --- | --- |
| `users` | telegram_id (unique), first_name, last_name, username, phone, photo_url | |
| `events` | title, starts_on, ends_on, admin_id → users, meeting_point/pickup_point/destination (JSONB: address, lat, lon), meeting_instruction, chat_url, join_open, invite_code (unique) | ends_on ≥ starts_on |
| `memberships` | event_id, user_id, joined_at | unique(event_id, user_id); админ сюда попадает, только если вступил как участник |
| `locations` | kind (airport/station), code, name, city, country, timezone | unique(kind, code) |
| `trips` | event_id, mode, number, departure_location_id, arrival_location_id, scheduled_departure, scheduled_arrival, estimated_arrival, status, source, provider_ref, updated_at | рейс принадлежит группе (ручной список, CAP-05) |
| `applications` | event_id, user_id, trip_id, with_companion, baggage_count, max_wait_minutes, status, at_meeting_point, departed_at, transfer_id | unique(event_id, user_id); baggage 0..2 |
| `transfers` | event_id, status, created_at, created_by (auto/admin) | |

`effective_arrival = coalesce(estimated_arrival, scheduled_arrival)` — подбор опирается только на него, а не на
формат поставщика (задел на поезда из «Задел на другие виды транспорта»).

## Подбор в pre-MVP

**Правило совместимости (наше допущение, вопрос открыт в «Как применять ожидание»):** все ждут самого позднего
прилетающего, и каждый — в пределах своего ожидания: `max(t) − t_i ≤ wait_i` для каждого участника. Плюс
одинаковая точка прилёта (`arrival_location_id`), Σ пассажиров ≤ 3, Σ багажа ≤ 2.
Пример А/Б из документа (А 10:00/15 мин, Б 10:10/0 мин) — совместимы.

**Алгоритм** (`matching.find_group(new, candidates) -> list[id] | None`):
1. Кандидаты: заявки той же группы в `searching`, без `departed_at`, кроме новой.
2. Перебор подмножеств кандидатов размером 1–2 (заявок мало, ≤ 3 мест) вместе с новой; берём допустимое с
   максимумом пассажиров, при равенстве — с минимальным разбросом времени.
3. Трансфер создаётся, только если в нём ≥ 2 заявки. Иначе заявка остаётся в `searching`.
4. Существующие трансферы на pre-MVP не дополняются (CAP-06).

Правило совместимости — отдельная функция `is_compatible(group)`: после ответа заказчика меняется только она.
Подбор выполняется в транзакции под `pg_advisory_xact_lock(event_id)`, чтобы два одновременных PUT не собрали одну
заявку в два трансфера.

## Задачи pre-MVP

Порядок: **сверху вниз**; задачи в одной волне независимы и могут идти параллельно.
Критерий готовности каждой задачи — эндпоинты соответствуют `openapi.yaml`, тесты зелёные, `ruff` и `mypy` чистые.

**Волна 0 — каркас**
- **B-01 Каркас проекта.** pyproject (uv), структура выше, config, db, docker-compose (`api`, `db`), ruff/mypy/pytest,
  `GET /healthz`. Обработчик ошибок → `Error` из контракта (включая 422 с `details.fields`).

**Волна 1 — фундамент** (после B-01, параллельно)
- **B-02 Модели и миграции.** Все таблицы выше, первая миграция Alembic, сид `locations` из `data/airports.csv`.
- **B-03 Авторизация Telegram.** Проверка `initData` (HMAC, `auth_date` ≤ 24 ч), `current_user` с автосозданием
  пользователя, обновление имени/username при каждом входе. Unit-тесты с подписанными фикстурами. (CAP-01)
- **B-04 Модуль подбора.** `matching/` — чистые функции, без БД. Таблица тестов: вместимость 3/2, спутник = 2
  места, ожидание (пример А/Б, тройки), разные аэропорты, переход через полночь, детерминированность. (CAP-06)

**Волна 2 — API** (после B-02 и B-03, параллельно)
- **B-05 Профиль и группы.** `GET /me`, `GET /me/events`, `POST/GET/PATCH /events/{id}`, `GET /events/{id}/invite`;
  генерация `invite_code` (6 символов, без похожих O/0, I/1); права: управляет только создатель. (CAP-01, 02, 07)
- **B-06 Приглашения.** `GET /invites/{code}`, `POST /invites/{code}/join` — идемпотентно, `JOIN_CLOSED`,
  код без учёта регистра. (CAP-03)
- **B-07 Рейсы.** `GET /locations`, `GET/POST /events/{id}/trips`, `PATCH/DELETE /trips/{id}`; нормализация номера,
  интерпретация времени без смещения в таймзоне аэропорта, вывод со смещением аэропорта, `TRIP_IN_USE`. (CAP-05)

**Волна 3 — заявка и подбор** (после B-04…B-07)
- **B-08 Заявка.** `GET/PUT /my-application`, `go-solo`, `resume-search`, `cancel`, `PUT /marks`; машина состояний
  из `contracts/README.md` §5; `PHONE_REQUIRED`, `APPLICATION_LOCKED`, `ALREADY_DEPARTED`; выход из трансфера
  оставляет остальных вместе; трансфер с 1 заявкой расформировывается. Вызов подбора после PUT и
  resume-search. (CAP-04, 06, 08)
- **B-09 Экран поездки.** `GET /events/{id}/my-trip`: событие, заявка, трансфер с контактами только своего
  трансфера, блок `taxi` (`yandex_go_url = null`). (CAP-07, 09, 10)

**Волна 4** (параллельно)
- **B-10 Админ.** `GET /admin/participants` с фильтрами и счётчиками (спутники считаются, `cancelled` не входит
  в ожидаемых), `GET /admin/transfers`. (CAP-11)
- **B-11 Бот.** `/start` (в т.ч. `/start join_<CODE>`): стартовое сообщение, запрос контакта
  (`request_contact`), сохранение телефона (только свой контакт: `contact.user_id == from.id`), кнопки WebApp
  «Открыть» и «Управление». (CAP-01)

**Волна 5**
- **B-12 Сквозная проверка pre-MVP.** API-тест сценария из «Проверка pre-MVP» (шаги 1–6) целиком.

```
B-01 ─┬─ B-02 ─┬─ B-05 ─┐
      ├─ B-03 ─┼─ B-06 ─┼─ B-08 ─ B-09 ─┬─ B-10 ─┐
      └─ B-04 ─┘  B-07 ─┘               └─ B-11 ─┴─ B-12
```

## MVP (после pre-MVP, детализируем позже)

- **M-01 Поставщик рейсов**: интерфейс `FlightProvider` + адаптер (FlightAware?), `GET /flights/search`,
  воркер с интервалами из CAP-05, `FLIGHT_PROVIDER_UNAVAILABLE`.
- **M-02 Обработка изменений**: правка назначенной заявки, дозаполнение освободившихся мест, исключение при
  несовместимой задержке.
- **M-03 Админ**: ручные составы, отметки отъезда, табло `GET /admin/board`, закрытие вступления.
- **M-04 Уведомления** через бота с deep link `event_<id>`; без дублей и без сообщений при обновлении без изменений.
- **M-05 Яндекс Go / карты**: `yandex_go_url`, координаты точек.
- **M-06 Удаление данных** через неделю — после ответа на вопросы из «От какого момента удалять данные».

## Допущения, которые надо подтвердить

Вопросы из «Требует уточнения», без ответа на которые мы выбрали вариант сами:

| Вопрос | Допущение | Где в коде |
| --- | --- | --- |
| Ожидание при подборе | Каждый ждёт самого позднего в пределах своего ожидания | `matching.is_compatible` |
| Разные аэропорты в группе | Подбираем только при одинаковом аэропорте прилёта; точка посадки одна на группу | `matching`, модель `events` |
| Исправление «Уехал» | На pre-MVP отметка необратима | B-08 |
| Багаж > 2 мест | 422 на заявке; фронт предлагает исправить или ехать самому | схема `ApplicationInput` |
| Ручной ввод телефона | Только передача контакта боту | B-11 |
| Размер трансфера | Создаём при ≥ 2 заявках; одиночная заявка со спутником остаётся в поиске | `matching.find_group` |
