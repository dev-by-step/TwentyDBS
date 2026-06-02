#!/bin/sh
set -e

is_worker_command() {
    # Our Procfile launches the worker process as `yarn worker:prod`.
    [ "$#" -ge 2 ] && [ "$1" = "yarn" ] && [ "$2" = "worker:prod" ]
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

    # Check for a foundational core table (created by the very first Twenty migration).
    # The 'core' schema alone is not reliable: TypeORM creates it on connection
    # before any table exists, producing false positives that skip the init.
    has_core_tables=$(psql -tAc "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'core' AND table_name = 'keyValuePair')" ${PG_DATABASE_URL})
    if [ "$has_core_tables" = "f" ]; then
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
