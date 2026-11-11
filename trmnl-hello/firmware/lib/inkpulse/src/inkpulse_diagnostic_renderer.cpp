#include "inkpulse_diagnostic_renderer.h"

#include <stdio.h>

namespace inkpulse {
namespace {

const char *refreshName(RefreshMode refresh) {
  return refresh == RefreshMode::Full ? "FULL" : "PARTIAL";
}

} // namespace

void renderDiagnosticScreen(Canvas &canvas, const DiagnosticScreenModel &screen) {
  char press_count[16];
  char refresh_time[24];
  snprintf(press_count, sizeof(press_count), "%lu", static_cast<unsigned long>(screen.press_count));
  if (screen.last_refresh_ms == 0) {
    snprintf(refresh_time, sizeof(refresh_time), "WAITING");
  } else {
    snprintf(refresh_time, sizeof(refresh_time), "%lu ms", static_cast<unsigned long>(screen.last_refresh_ms));
  }

  canvas.clear();
  canvas.drawText("INKPULSE", 48, 62, TextStyle::Value);
  canvas.drawText("DISPLAY RESPONSE LAB", 48, 100, TextStyle::Label);
  canvas.drawText("OFFLINE", 654, 82, TextStyle::Label);
  canvas.drawHorizontalLine(48, 124, 704, 3);

  canvas.drawRoundRect(48, 158, 440, 220, 18);
  canvas.drawText("KEY3 INPUT", 78, 204, TextStyle::Label);
  canvas.drawText(press_count, 78, 286, TextStyle::Value);
  canvas.drawText("PRESS COUNT", 78, 342, TextStyle::Label);

  canvas.drawRoundRect(520, 158, 232, 220, 18);
  canvas.drawText("REFRESH", 546, 204, TextStyle::Label);
  canvas.drawText(refresh_time, 546, 256, TextStyle::Value);
  canvas.drawText("MODE", 546, 314, TextStyle::Label);
  canvas.drawText(refreshName(screen.refresh), 546, 354, TextStyle::Value);

  canvas.drawHorizontalLine(48, 408, 704, 2);
  canvas.drawText("LOCAL TEST  |  WI-FI OFF", 48, 446, TextStyle::Label);
  canvas.drawText("KEY3: GO", 626, 446, TextStyle::Label);
}

} // namespace inkpulse
