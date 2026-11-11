#include <inkpulse_canvas.h>
#include <inkpulse_diagnostic_renderer.h>
#include <inkpulse_dirty_region.h>
#include <inkpulse_frame_protocol.h>
#include <unity.h>

#include <string>
#include <vector>

namespace {

struct TextCommand {
  std::string text;
  int x;
  int y;
  inkpulse::TextStyle style;
  inkpulse::TextAlign align;
};

class RecordingCanvas final : public inkpulse::Canvas {
public:
  void clear() override { clear_count++; }

  void drawText(const char *text, int x, int y, inkpulse::TextStyle style,
                inkpulse::TextAlign align) override {
    texts.push_back({text, x, y, style, align});
  }

  void drawHorizontalLine(int, int, int, int) override { line_count++; }
  void drawRoundRect(int, int, int, int, int) override { card_count++; }

  const TextCommand *find(const char *text) const {
    for (const auto &command : texts) {
      if (command.text == text) {
        return &command;
      }
    }
    return nullptr;
  }

  int clear_count = 0;
  int line_count = 0;
  int card_count = 0;
  std::vector<TextCommand> texts;
};

} // namespace

void test_renderer_emits_complete_frame() {
  RecordingCanvas canvas;
  const inkpulse::DiagnosticScreenModel screen = {12, 1708, inkpulse::RefreshMode::Partial};

  inkpulse::renderDiagnosticScreen(canvas, screen);

  TEST_ASSERT_EQUAL_INT(1, canvas.clear_count);
  TEST_ASSERT_EQUAL_INT(2, canvas.line_count);
  TEST_ASSERT_EQUAL_INT(2, canvas.card_count);
  TEST_ASSERT_NOT_NULL(canvas.find("INKPULSE"));
  TEST_ASSERT_NOT_NULL(canvas.find("12"));
  TEST_ASSERT_NOT_NULL(canvas.find("1708 ms"));
  TEST_ASSERT_NOT_NULL(canvas.find("PARTIAL"));
  TEST_ASSERT_NOT_NULL(canvas.find("REFRESH"));
  TEST_ASSERT_NOT_NULL(canvas.find("MODE"));
  TEST_ASSERT_NOT_NULL(canvas.find("KEY3: GO"));
  TEST_ASSERT_EQUAL_INT(752, canvas.find("OFFLINE")->x);
  TEST_ASSERT_TRUE(canvas.find("OFFLINE")->align == inkpulse::TextAlign::Right);
  TEST_ASSERT_EQUAL_INT(524, canvas.find("1708 ms")->x);
  TEST_ASSERT_EQUAL_INT(524, canvas.find("PARTIAL")->x);
  TEST_ASSERT_EQUAL_INT(752, canvas.find("KEY3: GO")->x);
  TEST_ASSERT_TRUE(canvas.find("KEY3: GO")->align == inkpulse::TextAlign::Right);
}

void test_renderer_uses_waiting_before_first_measurement() {
  RecordingCanvas canvas;
  const inkpulse::DiagnosticScreenModel screen = {0, 0, inkpulse::RefreshMode::Full};

  inkpulse::renderDiagnosticScreen(canvas, screen);

  TEST_ASSERT_NOT_NULL(canvas.find("WAITING"));
  TEST_ASSERT_NOT_NULL(canvas.find("FULL"));
}

void test_frame_crc_matches_standard_vector() {
  const uint8_t data[] = {'1', '2', '3', '4', '5', '6', '7', '8', '9'};
  TEST_ASSERT_EQUAL_HEX32(0xcbf43926, inkpulse::frameCrc32(data, sizeof(data)));
}

void test_frame_size_uses_stride_and_height() {
  TEST_ASSERT_EQUAL_UINT32(48000, inkpulse::frameByteCount(100, 480));
}

void test_dirty_region_is_clipped_and_byte_aligned() {
  const inkpulse::DirtyRegion prepared =
      inkpulse::prepareDirtyRegion({13, 470, 800, 20}, {800, 480});

  TEST_ASSERT_EQUAL_UINT16(8, prepared.x);
  TEST_ASSERT_EQUAL_UINT16(470, prepared.y);
  TEST_ASSERT_EQUAL_UINT16(792, prepared.width);
  TEST_ASSERT_EQUAL_UINT16(10, prepared.height);
  TEST_ASSERT_EQUAL_UINT32(990, inkpulse::dirtyRegionByteCount(prepared));
}

void test_dirty_region_outside_display_becomes_empty() {
  const inkpulse::DirtyRegion prepared =
      inkpulse::prepareDirtyRegion({800, 10, 16, 16}, {800, 480});

  TEST_ASSERT_TRUE(inkpulse::isEmpty(prepared));
  TEST_ASSERT_EQUAL_UINT32(0, inkpulse::dirtyRegionByteCount(prepared));
}

void test_dirty_region_preserves_aligned_geometry() {
  const inkpulse::DirtyRegion prepared =
      inkpulse::prepareDirtyRegion({64, 224, 384, 104}, {800, 480});

  TEST_ASSERT_EQUAL_UINT16(64, prepared.x);
  TEST_ASSERT_EQUAL_UINT16(224, prepared.y);
  TEST_ASSERT_EQUAL_UINT16(384, prepared.width);
  TEST_ASSERT_EQUAL_UINT16(104, prepared.height);
  TEST_ASSERT_EQUAL_UINT32(4992, inkpulse::dirtyRegionByteCount(prepared));
}

int main(int argc, char **argv) {
  UNITY_BEGIN();
  RUN_TEST(test_renderer_emits_complete_frame);
  RUN_TEST(test_renderer_uses_waiting_before_first_measurement);
  RUN_TEST(test_frame_crc_matches_standard_vector);
  RUN_TEST(test_frame_size_uses_stride_and_height);
  RUN_TEST(test_dirty_region_is_clipped_and_byte_aligned);
  RUN_TEST(test_dirty_region_outside_display_becomes_empty);
  RUN_TEST(test_dirty_region_preserves_aligned_geometry);
  return UNITY_END();
}
