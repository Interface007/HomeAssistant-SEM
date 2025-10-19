Write-Host "ESPHome Build und OTA Upload starten..."

# Firmware bauen
# esphome compile "$($PSScriptRoot)/test.yaml"
esphome compile "$($PSScriptRoot)/screen-01.yaml"
# esphome compile "$($PSScriptRoot)/display-livingroom-01.yaml"
# esphome compile "$($PSScriptRoot)/temp-sensor-wall-01.yaml"

# OTA Upload (Hostname oder IP)
# esphome upload "$($PSScriptRoot)/test.yaml"                --device screen-01
esphome upload "$($PSScriptRoot)/screen-01.yaml"                --device screen-01
# esphome upload "$($PSScriptRoot)/display-livingroom-01.yaml"    --device display-livingroom-01
# esphome upload "$($PSScriptRoot)/temp-sensor-wall-01.yaml"      --device esphome-web-e866d8

Write-Host "Fertig!" -ForegroundColor Green
