#!/usr/bin/env bash
# Прогон миграций и сценарного теста на локальном Postgres.
# Использование: PGURL=postgres://postgres@localhost:5432/postgres supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/.."
: "${PGURL:?укажите PGURL на пустой Postgres}"
DB=grani_test_$$
psql "$PGURL" -qc "create database $DB"
trap 'psql "$PGURL" -qc "drop database $DB"' EXIT
T="${PGURL%/*}/$DB"
psql "$T" -q -v ON_ERROR_STOP=1 -f tests/auth_stub.sql
for f in migrations/*.sql; do psql "$T" -q -v ON_ERROR_STOP=1 -f "$f"; done
psql "$T" -q -v ON_ERROR_STOP=1 -f seed.sql
psql "$T" -v ON_ERROR_STOP=1 -f tests/scenario.sql
