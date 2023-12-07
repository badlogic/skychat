#!/bin/sh
set -e
scp marioslab.io:/home/badlogic/skychat.social/docker/data/logs/npmaccess.log access.log
goaccess --keep-last=30 -f access.log -o report.html --log-format=COMBINED
rm access.log
open report.html