#pragma once
//
// Klima-Berechnungen fuer ESPHome-Lambdas.
// Bewusst identisch zu config/custom_templates/climate.jinja gehalten:
// Magnus-Formel, Parameter nach Sonntag (1990), ueber Wasser
//   a = 17.62, b = 243.12 degC   (gueltig ca. -45...+60 degC)
// Wenn dort etwas geaendert wird, hier mitaendern - sonst weichen die
// Werte auf dem ESP von den HA-Template-Sensoren ab.
//
#include <cmath>

namespace sem_climate {

// Saettigungsdampfdruck [hPa] bei Temperatur t [degC]
inline float sat_vapor_pressure(float t) {
  return 6.112f * expf(17.62f * t / (243.12f + t));
}

// Taupunkt [degC] aus Temperatur t [degC] und rel. Feuchte rh [%]
inline float dew_point(float t, float rh) {
  if (std::isnan(t) || std::isnan(rh) || rh <= 0.0f)
    return NAN;
  if (rh > 100.0f)
    rh = 100.0f;
  const float alpha = logf(rh / 100.0f) + 17.62f * t / (243.12f + t);
  return 243.12f * alpha / (17.62f - alpha);
}

// Absolute Feuchte [g/m3] aus t [degC] und rh [%]
inline float abs_humidity(float t, float rh) {
  if (std::isnan(t) || std::isnan(rh))
    return NAN;
  const float e_hpa = rh / 100.0f * sat_vapor_pressure(t);
  return 216.679f * e_hpa / (273.15f + t);
}

// Rel. Feuchte an der Wandoberflaeche [%] aus Raumluft (t_air, rh_air)
// und Wandtemperatur t_wall. >= 80 % ueber laengere Zeit = Schimmelgefahr.
inline float wall_surface_rh(float t_air, float rh_air, float t_wall) {
  if (std::isnan(t_air) || std::isnan(rh_air) || std::isnan(t_wall))
    return NAN;
  return (rh_air / 100.0f * sat_vapor_pressure(t_air)) /
         sat_vapor_pressure(t_wall) * 100.0f;
}

}  // namespace sem_climate
