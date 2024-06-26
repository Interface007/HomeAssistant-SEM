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
DEFAULT_MODE = "difference"
DEFAULT_AGGREGATE = "max"
DEFAULT_AGGREGATE_KEY = "day"
DEFAULT_INTERVAL = 1

SCAN_INTERVAL = timedelta(hours = 1)

CONF_DAYS = "days"
CONF_FACTOR = "factor"
CONF_TOKEN = "bearertoken"
CONF_MODE = "mode"
CONF_AGGREGATE = "aggregate"
CONF_AGGREGATE_KEY = "aggregate_key"

PLATFORM_SCHEMA = PLATFORM_SCHEMA.extend({
    vol.Required(CONF_ENTITY_ID): cv.entity_id,
    vol.Required(CONF_TOKEN): cv.string,
    vol.Optional(CONF_NAME, default=DEFAULT_NAME): cv.string,
    vol.Optional(CONF_DAYS, default=DEFAULT_DAYS): vol.All(vol.Coerce(int), vol.Range(min=1)),
    vol.Optional(CONF_FACTOR, default=DEFAULT_FACTOR): vol.All(vol.Coerce(int), vol.Range(min=1)),
    vol.Optional(CONF_MODE, default=DEFAULT_MODE): vol.In(["difference", "absolute"]),
    vol.Optional(CONF_AGGREGATE, default=DEFAULT_AGGREGATE): vol.In(["max", "sum"]),
    vol.Optional(CONF_AGGREGATE_KEY, default=DEFAULT_AGGREGATE_KEY): vol.In(["day", "month", "year", "week", "hour", "minute"]),
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
    mode = config.get(CONF_MODE)
    token = config.get(CONF_TOKEN)
    aggregate = config.get(CONF_AGGREGATE)
    aggregate_key = config.get(CONF_AGGREGATE_KEY)
    async_add_entities([SensorHistory(hass, name, entity_id, days, factor, token, mode, aggregate, aggregate_key)], True)

class SensorHistory(Entity):
    def __init__(self, hass, name, entity_id, days, factor, token, mode, aggregate, aggregate_key):
        self._hass = hass
        self._name = name
        self._days = days
        self._factor = factor
        self._entity_id = entity_id
        self._state = None
        self._token = token
        self._mode = mode
        self._aggregate = aggregate
        self._aggregate_key = aggregate_key

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
        if not response or len(response[0]) < 1:
            self.info(f"Not enough data points in history for {self._entity_id}")
            return
        
        history = response[0]
        values = [(float(item['state']), item['last_changed']) for item in history if is_float(item['state'])]
        if len(values) < 2:
            self.info(f"Not enough numeric data points in history for {self._entity_id}")
            return
        
        self.debug("Processing %d values for %s", len(values), self._entity_id)

        match self._aggregate_key:
            case "day":
                key_length = 10
            case "month":
                key_length = 7
            case "year":
                key_length = 4
            case "week":
                key_length = 10
            case "hour":
                key_length = 13
            case "minute":
                key_length = 16
                    
        # Group by date and find daily maxima
        aggregated = {}
        for value, timestamp in values:
            key = timestamp[:key_length] # just the date
            if key in aggregated: # the date is already sortable, so we don't need to convert it to a datetime object
                match self._aggregate:
                    case "max":
                        aggregated[key] = max(aggregated[key], value) 
                    case "sum":
                        aggregated[key] += value
            else:
                aggregated[key] = value
        
        aggregatedValues = list(aggregated.values())
        
        match self._mode:
            case "absolute":
                self._state = ";".join(f"{value:.0f}" for value in aggregatedValues[-30:])
            case "difference":
                diff2 = [round(aggregatedValues[i + 1] - aggregatedValues[i], 4) * self._factor for i in range(len(aggregatedValues) - 1)][-30:]
                self._state = ";".join(f"{dif2:.0f}" for dif2 in diff2)
                
        self.debug("State updated with mode %s: %s", self._mode, self._state)
        
    async def get_sensor_history(self, entity_id):
        session = async_get_clientsession(self._hass)
        current_datetime = datetime.now()
        start_datetime = current_datetime - timedelta(days=self._days)
        formatted_start_datetime = start_datetime.strftime("%Y-%m-%dT%H:%M:%S")
        formatted_end_datetime = current_datetime.strftime("%Y-%m-%dT%H:%M:%S")

        url = f"http://homeassistant:8123/api/history/period/{formatted_start_datetime}"
        headers = {
            "Authorization": f"Bearer {self._token}",
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
            self.debug("Problem while requesting data: %s - mostly not a problem, but simply the history not yet ready", str(e))
            return None
