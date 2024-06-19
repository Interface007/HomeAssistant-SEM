# /config/custom_components/sensor_history/__init__.py

import logging
import aiohttp
from homeassistant.helpers.aiohttp_client import async_get_clientsession

DOMAIN = "sensor_history"
PLATFORMS = ["sensor"]

async def async_setup(hass, config):
    return True

async def async_setup_entry(hass, config_entry, async_add_entities):
    await hass.async_add_executor_job(
        async_load_platform, hass, "sensor", DOMAIN, {}, config
    )
