#!/bin/sh
set -e

is_worker_command() {
    if [ "$#" -ge 2 ] && [ "$1" = "yarn" ] && [ "$2" = "worker:prod" ]; then
        return 0
    fi

    if [ "$#" -ge 2 ] && [ "$1" = "node" ] && [ "$2" = "dist/queue-worker/queue-worker" ]; then
        return 0
    fi

    return 1
}

should_skip_db_migrations() {
    if [ "${DISABLE_DB_MIGRATIONS}" = "true" ]; then
        return 0
    fi

    is_worker_command "$@"
}

should_skip_cron_registration() {
    if [ "${DISABLE_CRON_JOBS_REGISTRATION}" = "true" ]; then
        return 0
    fi

    is_worker_command "$@"
}

setup_and_migrate_db() {
    if should_skip_db_migrations "$@"; then
        echo "Database setup and migrations are disabled, skipping..."
        return
    fi

    echo "Running database setup and migrations..."

    # Run setup and migration scripts
    has_schema=$(psql -tAc "SELECT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'core')" ${PG_DATABASE_URL})
    if [ "$has_schema" = "f" ]; then
        echo "Database appears to be empty, running migrations."
        yarn database:init:prod
    fi

    yarn command:prod cache:flush
    yarn command:prod upgrade
    yarn command:prod cache:flush

    echo "Successfully migrated DB!"
}

register_background_jobs() {
    if should_skip_cron_registration "$@"; then
        echo "Cron job registration is disabled, skipping..."
        return
    fi

    echo "Registering background sync jobs..."
    if yarn command:prod cron:register:all; then
        echo "Successfully registered all background sync jobs!"
    else
        echo "Warning: Failed to register background jobs, but continuing startup..."
    fi
}

setup_and_migrate_db "$@"
register_background_jobs "$@"

# Continue with the original Docker command
exec "$@"
