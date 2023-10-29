#!/bin/bash
set -e
npm run build
rsync -avz --exclude node_modules --exclude .git ./ badlogic@marioslab.io:/home/badlogic/skychat.social/app
