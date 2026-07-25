#pragma once
//
// Climate calculations for ESPHome lambdas.
// Intentionally kept identical to config/custom_templates/climate.jinja:
// Magnus formula, parameters after Sonntag (1990), over water
//   a = 17.62, b = 243.12 degC   (valid approx. -45...+60 degC)
// If changed there, update here as well - otherwise values
// on the ESP will diverge from HA template sensors.
//
#include <cmath>

namespace sem_climate {

// Saturation vapor pressure [hPa] at temperature t [degC]
inline float sat_vapor_pressure(float t) {
  return 6.112f * expf(17.62f * t / (243.12f + t));
}

// Dew point [degC] from temperature t [degC] and rel. humidity rh [%]
inline float dew_point(float t, float rh) {
  if (std::isnan(t) || std::isnan(rh) || rh <= 0.0f)
    return NAN;
  if (rh > 100.0f)
    rh = 100.0f;
  const float alpha = logf(rh / 100.0f) + 17.62f * t / (243.12f + t);
  return 243.12f * alpha / (17.62f - alpha);
}

// Absolute humidity [g/m3] from t [degC] and rh [%]
inline float abs_humidity(float t, float rh) {
  if (std::isnan(t) || std::isnan(rh))
    return NAN;
  const float e_hpa = rh / 100.0f * sat_vapor_pressure(t);
  return 216.679f * e_hpa / (273.15f + t);
}

// Relative humidity at the wall surface [%] from room air (t_air, rh_air)
// and wall temperature t_wall. >= 80% over longer periods = mold risk.
inline float wall_surface_rh(float t_air, float rh_air, float t_wall) {
  if (std::isnan(t_air) || std::isnan(rh_air) || std::isnan(t_wall))
    return NAN;
  return (rh_air / 100.0f * sat_vapor_pressure(t_air)) /
         sat_vapor_pressure(t_wall) * 100.0f;
}

}  // namespace sem_climate
