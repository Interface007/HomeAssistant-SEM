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

  // FIX 2026-07: std::stoi("unknown"/"unavailable") warf eine Exception und
  // brachte den ESP in eine Reboot-Schleife. Jetzt: strikte Validierung,
  // nicht-numerische Zustände zeigen das "?"-Symbol (F125E).
  static bool is_numeric(const std::string &value)
  {
    if (value.empty())
      return false;
    std::size_t start = (value[0] == '-' || value[0] == '+') ? 1 : 0;
    if (start >= value.size())
      return false;
    bool digit_seen = false;
    for (std::size_t i = start; i < value.size(); i++)
    {
      char c = value[i];
      if (c >= '0' && c <= '9')
      {
        digit_seen = true;
      }
      else if (c != '.' && c != ',')
      {
        return false;
      }
    }
    return digit_seen;
  }

  void BatterySymbol(const esphome::homeassistant::HomeassistantTextSensor *sensor, int x1, int y1, std::string label)
  {
    ESP_LOGD("render battery", "start");

    std::string symbol = "U";
    if (sensor->has_state() && is_numeric(sensor->state))
    {
      ESP_LOGD("render battery", "has_state: %s", sensor->state.c_str());

      int battery = atoi(sensor->state.c_str());

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
      ESP_LOGD("render battery", "sensor value undefined or not numeric");
      symbol = "\U000F125E";
    }

    ESP_LOGD("render battery", "printing");
    display_.print(x1, y1, symbolFont_, symbol.c_str());
    display_.print(x1 + 5, y1 + 22, labelFont_, label.c_str());
    ESP_LOGD("render battery", "done");
  }

  void RenderDiagram(const esphome::homeassistant::HomeassistantTextSensor *sensor, int x1, int y1, int dx, int dy)
  {
    display_.start_clipping(x1 - 2, y1 - dy - 2, x1 + dx + 2, y1 + 2);

    display_.line(x1, y1 - dy, x1, y1);
    display_.line(x1, y1, x1 + dx, y1);

    // FIX 2026-07: vorher Zeigervergleich (csv.c_str() == "unavailable") statt
    // Inhaltsvergleich; außerdem crashte std::stoi bei nicht-numerischen Tokens.
    if (
        sensor->has_state() &&
        !sensor->state.empty() &&
        sensor->state != "unknown" &&
        sensor->state != "unavailable")
    {
      std::string csv = sensor->state;

      ESP_LOGD("render csv", csv.c_str());

      char delim = ';';
      std::vector<std::string> tokens = split(csv, delim);

      ESP_LOGD("render csv", "transforming string to int array (numeric tokens only)");
      std::vector<int> values;
      values.reserve(tokens.size());
      for (const std::string &token : tokens)
      {
        if (is_numeric(token))
        {
          values.push_back(atoi(token.c_str()));
        }
      }

      if (!values.empty())
      {
        auto n = values.size();

        ESP_LOGD("render csv", "determine max value in array");
        int max_value = *std::max_element(values.begin(), values.end());
        ESP_LOGD("render csv", "max_value = %d", max_value);

        if (max_value > 0)
        {
          auto barWidth = dx / (n + 1);
          auto distance = barWidth + (barWidth / n);

          auto i = 0;
          for (int value : values)
          {
            auto rx1 = x1 + (i * distance) + 10;
            auto rdy = value * dy / max_value;
            auto ry1 = y1 - rdy - 1;

            ESP_LOGD("render csv", "value = %d, rx1 = %d, ry1 = %d, barWidth = %d, rdy + 1 = %d", value, rx1, ry1, barWidth, rdy + 1);

            display_.filled_rectangle(rx1, ry1, barWidth, rdy + 1);

            i++;
          }
        }
      }
      else
      {
        ESP_LOGD("render csv", "no numeric tokens in state");
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
