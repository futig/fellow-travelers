# Fellow Travelers — backend

FastAPI + SQLAlchemy (async) + PostgreSQL. Контракт API: `../docs/contracts/`.

## Установка

```bash
python -m venv .venv
.venv/Scripts/python -m pip install -e ".[dev]"   # Linux/macOS: .venv/bin/python
cp .env.example .env                              # и заполнить значения
```

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
```
