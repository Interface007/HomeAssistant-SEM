#ifndef SEMTOOLS_H
#define SEMTOOLS_H

#include "esphome.h"
#include "esphome/core/component.h"
#include "esphome/components/sensor/sensor.h"

#include <iostream>
#include <sstream>
#include <vector>

class semTools
{
public:
  semTools(esphome::display::Display &display) : display_(display) {}

  void RenderDiagram(esphome::homeassistant::HomeassistantTextSensor *&sensor, int x1, int y1, int dx, int dy)
  {
    display_.start_clipping(x1 - 2, y1 - dy - 2,x1 + dx + 2, y1 + 2);

    display_.line(x1, y1 - dy, x1, y1);
    display_.line(x1, y1, x1 + dx, y1);

    if (sensor->has_state())
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
    } else {
      ESP_LOGD("render csv", "sensor has no state");
    }

    display_.end_clipping();
  }

private:
  esphome::display::Display &display_;

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
