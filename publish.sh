#!/bin/bash
set -e
npm run build
rsync -avz --exclude node_modules --exclude .git ./ badlogic@marioslab.io:/home/badlogic/skychat.social/app

if [ "$1" == "server" ]; then
    echo "Publishing client & server"
    ssh -t marioslab.io "cd skychat.social && ./reload.sh && docker-compose logs -f"
else
    echo "Publishing client only"
fi