#!/bin/bash

cd /app/backend/agent-core
node dist/main.js > agent.log 2>&1 &

cd /app/backend/skill-gateway/target
nohup java -jar skill-gateway-0.0.1-SNAPSHOT.jar > skill.log 2>&1 &

nginx