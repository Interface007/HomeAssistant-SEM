# /config/custom_components/sensor_history/sensor.py

import logging
from datetime import timedelta
from datetime import datetime
import async_timeout
from homeassistant.components.sensor import PLATFORM_SCHEMA
from homeassistant.const import CONF_NAME, CONF_ENTITY_ID
from homeassistant.helpers.entity import Entity
from homeassistant.helpers.aiohttp_client import async_get_clientsession
import homeassistant.helpers.config_validation as cv
import voluptuous as vol
import json

_LOGGER = logging.getLogger(__name__)

DEFAULT_NAME = "Sensor History"
DEFAULT_DAYS = 10
DEFAULT_FACTOR = 1000

SCAN_INTERVAL = timedelta(minutes=1)

CONF_DAYS = "days"
CONF_FACTOR = "factor"

PLATFORM_SCHEMA = PLATFORM_SCHEMA.extend({
    vol.Required(CONF_ENTITY_ID): cv.entity_id,
    vol.Optional(CONF_NAME, default=DEFAULT_NAME): cv.string,
    vol.Optional(CONF_DAYS, default=DEFAULT_DAYS): vol.All(vol.Coerce(int), vol.Range(min=1)),
    vol.Optional(CONF_FACTOR, default=DEFAULT_FACTOR): vol.All(vol.Coerce(int), vol.Range(min=1)),
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
    days = config.get(CONF_DAYS)
    factor = config.get(CONF_FACTOR)
    async_add_entities([SensorHistory(hass, name, entity_id, days, factor)], True)

class SensorHistory(Entity):
    def __init__(self, hass, name, entity_id, days, factor):
        self._hass = hass
        self._name = name
        self._days = days
        self._factor = factor
        self._entity_id = entity_id
        self._state = None

    @property
    def name(self):
        return self._name

    @property
    def state(self):
        return self._state
    
    def debug(self, msg, *args):
        _LOGGER.debug(self._name + " - " + msg, *args)

    def error(self, msg, *args):
        _LOGGER.error(self._name + " - " + msg, *args)
    
    def info(self, msg, *args):
        _LOGGER.info(self._name + " - " + msg, *args)

    async def async_update(self):
        response = await self.get_sensor_history(self._entity_id)
        self.debug(str(response))

        if not response or len(response[0]) < 1:
            self.error(f"Not enough data points in history for {self._entity_id}")
            return
        
        history = response[0]
        self.debug(f"history = {history}")
        historyItem = history[0]
        self.debug(f"item = {historyItem}")
        
        self.debug(f"item.state = {historyItem['state']}")
        
        values = [(float(item['state']), item['last_changed']) for item in history if is_float(item['state'])]
        if len(values) < 2:
            self.error(f"Not enough numeric data points in history for {self._entity_id}")
            return
        
        self.info("Processing %d values for %s", len(values), self._entity_id)

        # Group by date and find daily maxima
        
        diffs = [round(values[i + 1][0] - values[i][0], 4) * 1000 for i in range(len(values) - 1)][-30:]
        self._state = ";".join(f"{diff:.0f}" for diff in diffs)
        
        self.info("State updated: %s", self._state)
        
    async def get_sensor_history(self, entity_id):
        session = async_get_clientsession(self._hass)
        current_datetime = datetime.now()
        start_datetime = current_datetime - timedelta(days=self._days)
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
        except Exception as e:
            self.info("Problem while requesting data: %s", str(e))
            
            return None
