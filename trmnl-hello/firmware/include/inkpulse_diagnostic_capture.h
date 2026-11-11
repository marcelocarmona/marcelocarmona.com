#pragma once

#include <inkpulse_diagnostic_screen.h>
#include <stddef.h>

class InkPulseDiagnosticCapture {
public:
  void poll(const InkPulseFramebufferView &framebuffer);

private:
  static constexpr size_t command_capacity = 32;
  char command_[command_capacity] = {};
  size_t command_length_ = 0;

  void finishCommand(const InkPulseFramebufferView &framebuffer);
  void sendFrame(const InkPulseFramebufferView &framebuffer);
};
