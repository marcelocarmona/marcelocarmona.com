#pragma once

namespace inkpulse {

enum class TextStyle { Label, Value };

class Canvas {
public:
  virtual ~Canvas() = default;

  virtual void clear() = 0;
  virtual void drawText(const char *text, int x, int y, TextStyle style) = 0;
  virtual void drawHorizontalLine(int x, int y, int width, int thickness) = 0;
  virtual void drawRoundRect(int x, int y, int width, int height, int radius) = 0;
};

} // namespace inkpulse
