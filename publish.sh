#!/bin/bash
set -e
npm run build
current_date=$(date "+%Y-%m-%d %H:%M:%S")
commit_hash=$(git rev-parse HEAD)
echo "{\"date\": \"$current_date\", \"commit\": \"$commit_hash\"}" > html/version.json

ssh -t marioslab.io "mkdir -p skychat.social/docker/data/postgres"
# Create .env file locally in docker directory
cat > docker/.env << EOF
SKYCHAT_DB_PASSWORD=$SKYCHAT_DB_PASSWORD
EOF

rsync -avz --exclude node_modules --exclude .git --exclude data --exclude docker/data --exclude repos.json ./ badlogic@marioslab.io:/home/badlogic/skychat.social

if [ "$1" == "server" ]; then
    echo "Publishing client & server"
    ssh -t marioslab.io "cd skychat.social && ./docker/control.sh stop && ./docker/control.sh start && ./docker/control.sh logs"
else
    echo "Publishing client only"
fi