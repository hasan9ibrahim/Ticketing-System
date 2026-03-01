#!/bin/bash

BACKUP_DIR="/opt/backups/mongo"
DATE=$(date +"%Y-%m-%d_%H-%M-%S")
ARCHIVE="$BACKUP_DIR/mongo_$DATE.gz"

mkdir -p $BACKUP_DIR

# Dump from Mongo container
docker exec ticketing_mongo \
  mongodump \
  -u hasan1ibrahim_db_user \
  -p PhGPrfp3hGotMnVM \
  --authenticationDatabase admin \
  --archive | gzip > $ARCHIVE

# Keep only last 14 days
find $BACKUP_DIR -type f -name "*.gz" -mtime +60 -delete
