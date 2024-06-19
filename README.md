# HomeAssistant-SEM

My project started with the idea of a custom ePaper display as a weather station. The first one I found was ["Home Assistant – 7,5″ E-Paper Display (Waveshare) mit ESPHome ansteuern"](https://www.it-adviser.net/home-assistant-75-e-paper-display-waveshare-mit-esphome-ansteuern-wetterstation/), so I started with Home Assistant and ESPHome. I already had some Shelly devices (Shelly TRV and Door Window 2), so I wanted to display the status of those devices as well. Later, I added 2x SONOFF SNZB-02P to measure the temperature and humidity for the garden and the living room. I found the project idea ["AI-on-the-edge-device"](https://github.com/jomjol/AI-on-the-edge-device) simply cool - having an AI read the water meter in my own basement for little money was something I couldn't resist. Later, I included a web cam for the garden using an ESP32-Cam. The newest integrated device is a Shelly 3EM Pro to measure the electricity consumption in the house.

I didn't find a way to render the history of a sensor (water meter and power consumption) to the display, so I started to implement one by myself. That's currently under development, so: don't expect too much.

This entire repo is a work-in-progress... anything but "finished," but maybe it will inspire someone to similar projects.
