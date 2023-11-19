#!/bin/bash
set -e
npm run build
current_date=$(date "+%Y-%m-%d %H:%M:%S")
commit_hash=$(git rev-parse HEAD)
echo "{\"date\": \"$current_date\", \"commit\": \"$commit_hash\"}" > html/version.json

rsync -avz --exclude node_modules --exclude .git --exclude data --exclude repos.json ./ badlogic@marioslab.io:/home/badlogic/skychat.social/app

if [ "$1" == "server" ]; then
    echo "Publishing client & server"
    ssh -t marioslab.io "cd skychat.social && ./reload.sh && docker-compose logs -f"
else
    echo "Publishing client only"
fi