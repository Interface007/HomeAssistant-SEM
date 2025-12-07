# Components and Devices I use

Sometimes the selection of components for ESP32 devices can be difficult, because many of the components are only offered for a short time compared to commercial devices. Here is therefore my list of devices and components used for them:

- Camera and ESP32-device for intepreting the water meter
  - diymore ESP32-CAM: <https://www.amazon.de/dp/B08X3GRK22>
  - firmware project: <https://github.com/jomjol/AI-on-the-edge-device>
  - the casing is simply a cardboard tube and some gaffer tape
- OpenEPaperLink "Spaghetti AP" Access Point:
  - ESP32 S3-Module HMI 8M PSRAM 16M: <https://de.aliexpress.com/item/1005005755597419.html>
  - ESP32 C6-Module: <https://www.amazon.de/dp/B0DYD147MG>
  - see: <https://github.com/OpenEPaperLink/OpenEPaperLink/wiki/Beginners-Guide-for-an-easy-to-build-Access-Point-(aka-spaghetti-AP)>
- Wall thermo sensor for measuring the termperature of the most problematic wall area
  - AZDelivery 2 x DS18B20 sensor: <https://www.amazon.de/dp/B07CZ1G29V>
  - AZDelivery 1 x ESP32 D1 Mini NodeMCU: <https://www.amazon.de/dp/B08BTRQNB3>
  - Glue 2W/mK: <https://www.amazon.de/dp/B00XQ9AZ8Y>
    - I milled a small groove in the wall that fits the sensor and glued the sensor into the wall using this paste. This way, I get the correct temperature.
- ePaper display for my living room
  - 7.5 Inch E-Paper Display HAT Module 800x480 E-Ink Three-Color Paper Screen with WiFi/Bluetooth ESP32 Driver Board : <https://www.amazon.de/dp/B0CN97M9WY>
    - I don't use red as a third color, because using the 3-color mode would cause the screen update to be about 20 seconds instead of 2 seconds.
  - IKEA RÖDALM 13x18 cm: <https://www.ikea.com/de/de/p/roedalm-rahmen-eichenachbildung-10566390/>
  - Micro-USB to USB 2.0 cable: <https://www.amazon.de/dp/B0BG5XPLYH>
    - buy as short as possible, but as long as needed
    - 2m are working fine, longer than 5m might reduce the voltage too much
- dual screen info-terminal
  - ARCELI ESP32 2640: <https://www.amazon.de/dp/B0CP7SJ4P2>
  - Jumper Wire Kabel: <https://www.amazon.de/dp/B0CX5MD4HM>
  - TCA9548A I2C IIC Multiplexer Breakout Board: <https://de.aliexpress.com/item/1005004996004241.html>
  - 0.96 inch IIC Seriell blue/yellow OLED screen module 128X64 I2C SSD1306 12864: <https://de.aliexpress.com/item/1005009170035050.html>

Many components don't have the pin headers preassembled, so you have to solder them by yourself. I am using "Kellyshun KL-652" flux - adding some professional flux does make soldering a lot easier.

Another interesting point is the power supply. For most ESP32 I use USB power adapters or an active USB hub - for me, that work fine. I'm currently thinking about using a dedicated [15 W, 5 V, 3 A switching power supply](https://www.reichelt.de/de/de/shop/produkt/schaltnetzteil_geschlossen_15_w_5_v_3_a-137080) directly connected to the "5 V in"- and the GND-pins of some ESP32, but I didn't test it yet.
