# Fellow Travelers — backend

FastAPI + SQLAlchemy (async) + PostgreSQL. Контракт API: `../docs/contracts/`.

## Установка

```bash
python -m venv .venv
.venv/Scripts/python -m pip install -e ".[dev]"   # Linux/macOS: .venv/bin/python
cp .env.example .env                              # и заполнить значения
```

## База данных

```bash
docker compose up -d db          # PostgreSQL для разработки и тестов; на хосте — порт 5434
```

Порт 5434 выбран, чтобы не конфликтовать с локальным PostgreSQL на 5432. Тесты с БД сами создают
базу `fellow_travelers_test` и накатывают миграции; адрес можно переопределить через `TEST_DATABASE_URL`.
Без запущенного `db` такие тесты падают; тесты без БД (`tests/matching`, `tests/test_auth_telegram.py`) от него не зависят.

## Проверки

```bash
.venv/Scripts/ruff check .
.venv/Scripts/ruff format --check .
.venv/Scripts/mypy
.venv/Scripts/pytest -q
```

## Запуск

```bash
docker compose up --build        # API на http://localhost:8000, проверка: GET /healthz
```

Без Docker: `.venv/Scripts/uvicorn app.main:app --reload` (нужен доступный PostgreSQL из `DATABASE_URL`).

## Миграции

```bash
.venv/Scripts/alembic revision --autogenerate -m "описание"
.venv/Scripts/alembic upgrade head
# в compose: docker compose run --rm api alembic upgrade head
.venv/Scripts/python -m app.seeds.locations   # справочник аэропортов из data/airports.csv (идемпотентно)
```
