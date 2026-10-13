#!/bin/zsh
# Applies the migrations to a throwaway local database and runs the SQL checks.
# Requires a local PostgreSQL (e.g. `brew install postgresql@17`) and psql in PATH.
# Usage: supabase/tests/run.sh [psql connection options, e.g. -h 127.0.0.1 -p 5432 -U postgres]
set -e
cd ${0:a:h}
PSQL=(psql -v ON_ERROR_STOP=1 -q "$@")
$PSQL -d postgres -c "drop database if exists bezkratomu_test" -c "create database bezkratomu_test"
$PSQL -d bezkratomu_test -f supabase_stub.sql
# 0005 (pg_cron) is skipped: the extension isn't available in a plain local Postgres.
for f in ../migrations/*.sql; do [[ $f == *0005_cron.sql ]] || $PSQL -d bezkratomu_test -f $f; done
$PSQL -d bezkratomu_test -f rls_and_scoring.sql
# Refresh the fixture used by src/lib/parity.test.ts
mv fixture.json ../../src/lib/__fixtures__/sql_user_days.json
echo "SQL checks finished; fixture updated."
