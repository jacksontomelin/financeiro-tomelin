#!/bin/bash
# Sobe dois uvicorn:
# 8000 → tráfego normal (Traefik/HTTPS)
# 8788 → webhook direto (sem proxy, acessível externamente)

uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips "*" --workers 1 &
uvicorn app.main:app --host 0.0.0.0 --port 8788 --proxy-headers --forwarded-allow-ips "*" --workers 1 &

wait
