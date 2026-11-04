#!/bin/zsh
set -eu
cd '/Users/mahualexandru/Documents/Codex/2026-11-01/vre/outputs/bayshop-mobile'
export PATH="/Users/mahualexandru/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH"
print 'BayShop Demo — înregistrarea iPhone-ului pentru testare'
print 'Autentificarea se face prin utilitarul oficial Expo. Nu trimite parola în chat.'
print 'Folosește organizația air-post-srl și echipa ta Apple Developer.'
npx --yes eas-cli@latest device:create
