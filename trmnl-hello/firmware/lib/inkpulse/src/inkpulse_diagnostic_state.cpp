#include "inkpulse_diagnostic_state.h"

namespace inkpulse {

bool DiagnosticState::updateButton(bool raw_pressed, uint32_t now_ms) {
  if (raw_pressed != candidate_pressed_) {
    candidate_pressed_ = raw_pressed;
    candidate_since_ms_ = now_ms;
    return false;
  }

  if (candidate_pressed_ == stable_pressed_ || now_ms - candidate_since_ms_ < debounce_ms) {
    return false;
  }

  stable_pressed_ = candidate_pressed_;
  if (!stable_pressed_) {
    return false;
  }

  press_count_++;
  partials_since_full_++;
  if (partials_since_full_ >= partials_before_full) {
    refresh_mode_ = RefreshMode::Full;
    partials_since_full_ = 0;
  } else {
    refresh_mode_ = RefreshMode::Partial;
  }
  return true;
}

RefreshMode DiagnosticState::refreshMode() const { return refresh_mode_; }

void DiagnosticState::recordRefresh(uint32_t duration_ms) { last_refresh_ms_ = duration_ms; }

} // namespace inkpulse
