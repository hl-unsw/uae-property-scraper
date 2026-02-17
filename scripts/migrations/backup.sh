#!/bin/bash
#
# Database Backup & Restore Utility
#
# Usage:
#   ./scripts/migrations/backup.sh dump              # Create backup
#   ./scripts/migrations/backup.sh dump my_tag        # Create tagged backup
#   ./scripts/migrations/backup.sh restore <path>     # Restore from backup
#   ./scripts/migrations/backup.sh list               # List all backups
#
# Backups are stored in ~/uae_spider_data/backups/

set -euo pipefail

MONGO_URI="${MONGO_URI:-mongodb://127.0.0.1:27017}"
DB_NAME="${MONGO_DB_NAME:-uae_real_estate}"
BACKUP_ROOT="$HOME/uae_spider_data/backups"

mkdir -p "$BACKUP_ROOT"

case "${1:-help}" in
  dump)
    TAG="${2:-$(date +%Y%m%d_%H%M%S)}"
    DEST="$BACKUP_ROOT/${DB_NAME}_${TAG}"
    echo "Backing up $DB_NAME to $DEST ..."

    docker exec uae-spider-mongo mongodump \
      --db "$DB_NAME" \
      --out "/tmp/mongodump_${TAG}"

    docker cp "uae-spider-mongo:/tmp/mongodump_${TAG}/${DB_NAME}" "$DEST"
    docker exec uae-spider-mongo rm -rf "/tmp/mongodump_${TAG}"

    # Count documents per collection
    echo ""
    echo "Backup complete: $DEST"
    du -sh "$DEST"
    echo ""
    ls -la "$DEST/"
    ;;

  restore)
    SRC="${2:?Usage: backup.sh restore <backup_path>}"
    if [ ! -d "$SRC" ]; then
      echo "Error: $SRC not found"
      exit 1
    fi

    echo "WARNING: This will overwrite the current $DB_NAME database."
    read -p "Continue? [y/N] " confirm
    if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
      echo "Aborted."
      exit 0
    fi

    CONTAINER_PATH="/tmp/mongorestore_$(date +%s)"
    docker cp "$SRC" "uae-spider-mongo:${CONTAINER_PATH}"

    docker exec uae-spider-mongo mongorestore \
      --db "$DB_NAME" \
      --drop \
      "${CONTAINER_PATH}"

    docker exec uae-spider-mongo rm -rf "${CONTAINER_PATH}"

    echo ""
    echo "Restore complete from: $SRC"
    ;;

  list)
    echo ""
    echo "Available backups in $BACKUP_ROOT:"
    echo ""
    if [ -d "$BACKUP_ROOT" ] && [ "$(ls -A "$BACKUP_ROOT" 2>/dev/null)" ]; then
      for dir in "$BACKUP_ROOT"/*/; do
        [ -d "$dir" ] || continue
        size=$(du -sh "$dir" | cut -f1)
        name=$(basename "$dir")
        echo "  $name  ($size)"
      done
    else
      echo "  (none)"
    fi
    echo ""
    ;;

  *)
    echo "Usage:"
    echo "  $0 dump [tag]         Create a backup"
    echo "  $0 restore <path>     Restore from backup"
    echo "  $0 list               List all backups"
    ;;
esac
