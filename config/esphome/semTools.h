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
    if (sensor->has_state())
    {
      std::string csv = sensor->state;

      if (csv.c_str() == "unavailable")
      {
        ESP_LOGI("render csv", "sensor is unavailable => std value '10;12;14'");
        csv = "10;12;14";
      }

      ESP_LOGI("render csv", csv.c_str());

      char delim = ';';
      std::vector<std::string> tokens = split(csv, delim);
      auto n = tokens.size();

      ESP_LOGI("render csv", "reserving space for array");
      std::vector<int> values;
      values.reserve(n);

      ESP_LOGI("render csv", "transforming string to int array");
      std::transform(tokens.begin(), tokens.end(), std::back_inserter(values), [](const std::string &str)
                     { return std::stoi(str); });

      ESP_LOGI("render csv", "determine max value in array");
      int max_value = *std::max_element(values.begin(), values.end());
      ESP_LOGI("render csv", "max_value = %d", max_value);

      auto barWidth = dx / n;
      
      auto devider = 1;
      auto i = 1;
      for (int value : values)
      {
        auto rx1 = x1 + i * barWidth;
        auto rdy = value * dy / max_value;
        auto ry1 = y1 - rdy - 1;

        ESP_LOGI("render csv", "value = %d, rx1 = %d, ry1 = %d, barWidth = %d, rdy + 1 = %d", value, rx1, ry1, barWidth, rdy + 1);

        // display_.rectangle(rx1, ry1, barWidth, rdy + 1);
        display_.filled_rectangle(rx1, ry1, barWidth, rdy + 1);

        i++;
      }
    }
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
