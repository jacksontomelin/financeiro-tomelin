#!/usr/bin/env python3
"""Gera app/version.py com o hash do commit — rode durante o build Docker."""
import subprocess, os, datetime

def git(cmd):
    try:
        return subprocess.check_output(cmd.split(), stderr=subprocess.DEVNULL).decode().strip()
    except:
        return ""

hash_ = git("git rev-parse --short HEAD") or os.environ.get("GIT_COMMIT","dev")[:7]
count = git("git rev-list --count HEAD") or "0"
date_ = git("git log -1 --format=%cd --date=format:%d/%m/%Y") or datetime.date.today().strftime("%d/%m/%Y")
version = f"2.{count}.0"

os.makedirs("app", exist_ok=True)
with open("app/version.py","w") as f:
    f.write(f'# Auto-gerado durante o build Docker\n')
    f.write(f'VERSION = "{version}"\n')
    f.write(f'BUILD   = "{hash_}"\n')
    f.write(f'BUILD_DATE = "{date_}"\n')

print(f"✓ versão: {version} · build: {hash_} · {date_}")
