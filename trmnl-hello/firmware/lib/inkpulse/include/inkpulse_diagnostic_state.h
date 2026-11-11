#pragma once

#include <inkpulse_refresh_mode.h>
#include <stdint.h>

namespace inkpulse {

class DiagnosticState {
public:
  static constexpr uint32_t debounce_ms = 30;
  static constexpr uint32_t partials_before_full = 8;

  // Returns true once for each debounced transition into the pressed state.
  bool updateButton(bool raw_pressed, uint32_t now_ms);

  RefreshMode refreshMode() const;
  void recordRefresh(uint32_t duration_ms);

  uint32_t pressCount() const { return press_count_; }
  uint32_t lastRefreshMs() const { return last_refresh_ms_; }

private:
  bool candidate_pressed_ = false;
  bool stable_pressed_ = false;
  uint32_t candidate_since_ms_ = 0;
  uint32_t press_count_ = 0;
  uint32_t partials_since_full_ = 0;
  uint32_t last_refresh_ms_ = 0;
  RefreshMode refresh_mode_ = RefreshMode::Full;
};

} // namespace inkpulse
