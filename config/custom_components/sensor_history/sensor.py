# /config/custom_components/sensor_history/sensor.py

import logging
from datetime import timedelta
from datetime import datetime
import aiohttp
import async_timeout
from homeassistant.components.sensor import PLATFORM_SCHEMA
from homeassistant.const import CONF_NAME, CONF_ENTITY_ID
from homeassistant.helpers.entity import Entity
from homeassistant.helpers.aiohttp_client import async_get_clientsession
import homeassistant.helpers.config_validation as cv
import voluptuous as vol

_LOGGER = logging.getLogger(__name__)

DEFAULT_NAME = "Watermeter History"
SCAN_INTERVAL = timedelta(minutes=5)

PLATFORM_SCHEMA = PLATFORM_SCHEMA.extend({
    vol.Required(CONF_ENTITY_ID): cv.entity_id,
    vol.Optional(CONF_NAME, default=DEFAULT_NAME): cv.string,
})

def is_float(value):
    try:
        float(value)
        return True
    except ValueError:
        return False
    
async def async_setup_platform(hass, config, async_add_entities, discovery_info=None):
    name = config.get(CONF_NAME)
    entity_id = config.get(CONF_ENTITY_ID)
    async_add_entities([SensorHistory(hass, name, entity_id)], True)

class SensorHistory(Entity):
    def __init__(self, hass, name, entity_id):
        self._hass = hass
        self._name = name
        self._entity_id = entity_id
        self._state = None

    @property
    def name(self):
        return self._name

    @property
    def state(self):
        return self._state

    async def async_update(self):
        history = await self.get_sensor_history(self._entity_id)
        if not history or len(history[0]) < 21:
            _LOGGER.error(f"Not enough data points in history for {self._entity_id}")
            return
        
        last_values = [float(state['state']) for state in history[0] if is_float(state['state'])][-21:]
        if len(last_values) < 21:
            _LOGGER.error(f"Not enough numeric data points in history for {self._entity_id}")
            return

        diffs = [round(last_values[i + 1] - last_values[i], 4) * 1000 for i in range(len(last_values) - 1)]
        self._state = ";".join(f"{diff:.0f}" for diff in diffs)
        
    async def get_sensor_history(self, entity_id):
        session = async_get_clientsession(self._hass)
        current_datetime = datetime.now()
        start_datetime = current_datetime - timedelta(days=10)
        formatted_start_datetime = start_datetime.strftime("%Y-%m-%dT%H:%M:%S")
        formatted_end_datetime = current_datetime.strftime("%Y-%m-%dT%H:%M:%S")

        url = f"http://homeassistant:8123/api/history/period/{formatted_start_datetime}"
        headers = {
            "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJjOWZmOGU4M2FlMDQ0YzI4OWQ3NGZmYTkxMDhjN2Y0MiIsImlhdCI6MTcxODMwMzAzMSwiZXhwIjoyMDMzNjYzMDMxfQ.7CJ8VbMAOGRECKV_3cDd1OKNtS4ViEhE33sbs3E3K_A",
            "content-type": "application/json",
        }
        params = {
            "filter_entity_id": entity_id,
            "end_time": formatted_end_datetime,
            "minimal_response": "true",
        }

        try:
            async with async_timeout.timeout(10):
                async with session.get(url, headers=headers, params=params) as response:
                    return await response.json()
        except:
            return "[[{\"state\":\"0.0000\",\"state\":\"0.0000\",\"state\":\"0.0000\",\"state\":\"0.0000\",\"state\":\"0.0000\"}]]"
