#ifndef SEMTOOLS_H
#define SEMTOOLS_H

#include "esphome.h"
#include "esphome/core/component.h"
#include "esphome/components/sensor/sensor.h"
#include "esphome/components/font/font.h"
#include <cmath>

#include <iostream>
#include <sstream>
#include <vector>

class semTools
{
public:
  semTools(esphome::display::Display &display, esphome::font::Font *symbolFont, esphome::font::Font *labelFont)
      : display_(display), symbolFont_(symbolFont), labelFont_(labelFont) {}

  void BatterySymbol(esphome::homeassistant::HomeassistantTextSensor *&sensor, int x1, int y1, std::string label)
  {
    ESP_LOGD("render battery", "start");

    std::string symbol = "U";
    if (sensor->has_state() && sensor->state != "unavailable")
    {
      ESP_LOGD("render battery", "has_state: %s", sensor->state.c_str());

      int battery = std::stoi(sensor->state.c_str());

      const std::string symbols[] = {
          "\U000F007A", "\U000F007B", "\U000F007C", "\U000F007D", "\U000F007E",
          "\U000F007F", "\U000F0080", "\U000F0081", "\U000F0082", "\U000F0079"};

      int index = battery / 10;
      if (index < 0)
        index = 0;
      if (index > 9)
        index = 9;
      symbol = symbols[index];
    }
    else
    {
      ESP_LOGD("render battery", "sensor value undefined");
      symbol = "\U000F125E";
    }

    ESP_LOGD("render battery", "printing");
    display_.print(x1, y1, symbolFont_, symbol.c_str());
    display_.print(x1 + 5, y1 + 22, labelFont_, label.c_str());
    ESP_LOGD("render battery", "done");
  }

  void RenderDiagram(esphome::homeassistant::HomeassistantTextSensor *&sensor, int x1, int y1, int dx, int dy)
  {
    display_.start_clipping(x1 - 2, y1 - dy - 2, x1 + dx + 2, y1 + 2);

    display_.line(x1, y1 - dy, x1, y1);
    display_.line(x1, y1, x1 + dx, y1);

    if (
        sensor->has_state() &&
        !sensor->state.empty() &&
        sensor->state != "unknown")
    {
      std::string csv = sensor->state;

      if (csv.c_str() == "unavailable")
      {
        ESP_LOGD("render csv", "sensor is unavailable => std value '10;12;14'");
        csv = "10;12;14";
      }

      ESP_LOGD("render csv", csv.c_str());

      char delim = ';';
      std::vector<std::string> tokens = split(csv, delim);
      auto n = tokens.size();

      ESP_LOGD("render csv", "reserving space for array");
      std::vector<int> values;
      values.reserve(n);

      ESP_LOGD("render csv", "transforming string to int array");
      std::transform(tokens.begin(), tokens.end(), std::back_inserter(values), [](const std::string &str)
                     { return std::stoi(str); });

      ESP_LOGD("render csv", "determine max value in array");
      int max_value = *std::max_element(values.begin(), values.end());
      ESP_LOGD("render csv", "max_value = %d", max_value);

      auto barWidth = dx / (n + 1);
      auto distance = barWidth + (barWidth / n);

      auto i = 0;
      for (int value : values)
      {
        auto rx1 = x1 + (i * distance) + 10;
        auto rdy = value * dy / max_value;
        auto ry1 = y1 - rdy - 1;

        ESP_LOGD("render csv", "value = %d, rx1 = %d, ry1 = %d, barWidth = %d, rdy + 1 = %d", value, rx1, ry1, barWidth, rdy + 1);

        // display_.rectangle(rx1, ry1, barWidth, rdy + 1);
        display_.filled_rectangle(rx1, ry1, barWidth, rdy + 1);

        i++;
      }
    }
    else
    {
      ESP_LOGD("render csv", "sensor has no state");
    }

    display_.end_clipping();
  }

  static std::string extract_and_trim(const std::string &csv, size_t previous, size_t current)
  {
    std::string raw_value = csv.substr(previous, current - previous);
    size_t start = raw_value.find_first_not_of(" \t\r\n");
    size_t end = raw_value.find_last_not_of(" \t\r\n");
    return (start == std::string::npos) ? "" : raw_value.substr(start, end - start + 1);
  }

  static double abshumidity(int temp, int relativeHumidity)
  {
      // calculate the saturation vapor pressure (in hPa)
      double sat_vapor_pressure = 6.112 * exp((17.67 * temp) / (temp + 243.5));

      // calculate the absolute humidity using the formula (in g/m³)
      double abs_humidity = (sat_vapor_pressure * relativeHumidity * 2.1674) / (273.15 + temp) / 100.0;

      return abs_humidity; // convert to g/m³
  }

  static double humiditydifference(int tempOutside, int tempInside, int relativeHumidityOutside, int relativeHumidityInside)
  {
      // calculate the saturation vapor pressure (in hPa)
      double sat_vapor_pressure_out = 6.112 * exp((17.67 * tempOutside) / (tempOutside + 243.5));
      double sat_vapor_pressure_in  = 6.112 * exp((17.67 * tempInside) / (tempInside + 243.5));

      // calculate the absolute humidity using the formula (in g/m³)
      double abs_humidity_out = (sat_vapor_pressure_out * relativeHumidityOutside * 2.1674) / (273.15 + tempOutside) / 100.0;
      double abs_humidity_in  = (sat_vapor_pressure_in  * relativeHumidityInside  * 2.1674) / (273.15 + tempInside) / 100.0;

      // difference outside inside
      double outsideInsideDiff = (abs_humidity_out - abs_humidity_in);

      return outsideInsideDiff;
  }

private:
  esphome::display::Display &display_;

private:
  esphome::font::Font *symbolFont_;

private:
  esphome::font::Font *labelFont_;

  std::vector<std::string> split(const std::string &s, char delimiter)
  {
    std::vector<std::string> tokens;
    std::istringstream ss(s);
    std::string token;
    while (std::getline(ss, token, delimiter))
    {
      tokens.push_back(token);
    }

    return tokens;
  }
};

#endif // SEMTOOLS_H
