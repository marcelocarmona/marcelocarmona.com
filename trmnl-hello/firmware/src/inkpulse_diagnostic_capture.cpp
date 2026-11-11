#ifdef INKPULSE_DIAGNOSTIC

#include "inkpulse_diagnostic_capture.h"

#include <Arduino.h>
#include <inkpulse_frame_protocol.h>
#include <string.h>

void InkPulseDiagnosticCapture::poll(const InkPulseFramebufferView &framebuffer) {
  while (Serial.available() > 0) {
    const char value = static_cast<char>(Serial.read());
    if (value == '\r') {
      continue;
    }
    if (value == '\n') {
      finishCommand(framebuffer);
      continue;
    }
    if (command_length_ + 1 >= command_capacity) {
      command_length_ = 0;
      continue;
    }
    command_[command_length_++] = value;
  }
}

void InkPulseDiagnosticCapture::finishCommand(const InkPulseFramebufferView &framebuffer) {
  command_[command_length_] = '\0';
  if (strcmp(command_, inkpulse::frame_capture_command) == 0) {
    sendFrame(framebuffer);
  }
  command_length_ = 0;
}

void InkPulseDiagnosticCapture::sendFrame(const InkPulseFramebufferView &framebuffer) {
  if (framebuffer.data == nullptr || framebuffer.size == 0) {
    Serial.println("INKPULSE_FRAME_ERROR framebuffer_unavailable");
    return;
  }

  const uint32_t checksum = inkpulse::frameCrc32(framebuffer.data, framebuffer.size);
  Serial.printf("%s %u %u %u %lu %08lX\n", inkpulse::frame_protocol_name, framebuffer.width,
                framebuffer.height, framebuffer.stride, static_cast<unsigned long>(framebuffer.size),
                static_cast<unsigned long>(checksum));
  const size_t written = Serial.write(framebuffer.data, framebuffer.size);
  Serial.printf("\n%s\n", inkpulse::frame_protocol_end);
  Serial.flush();

  if (written != framebuffer.size) {
    Serial.printf("[InkPulse] Screenshot write was incomplete: %lu of %lu bytes\n",
                  static_cast<unsigned long>(written), static_cast<unsigned long>(framebuffer.size));
  }
}

#endif // INKPULSE_DIAGNOSTIC
