#!/bin/sh
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set=app_user=ofertasuper_app --set=app_password="$APP_PASSWORD" --set=authority_user=ofertasuper_authority --set=authority_password="$AUTHORITY_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT', :'app_user', :'app_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'app_user')
\gexec
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT', :'authority_user', :'authority_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'authority_user')
\gexec
DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ofertasuper_runtime') THEN CREATE ROLE ofertasuper_runtime NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ofertasuper_verifier') THEN CREATE ROLE ofertasuper_verifier LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ofertasuper_verifier_definer') THEN CREATE ROLE ofertasuper_verifier_definer NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS; END IF; END $$;
SQL
