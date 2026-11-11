#include <inkpulse_diagnostic_state.h>
#include <unity.h>

using inkpulse::DiagnosticState;
using inkpulse::RefreshMode;

static bool press(DiagnosticState &state, uint32_t start_ms) {
  state.updateButton(true, start_ms);
  return state.updateButton(true, start_ms + DiagnosticState::debounce_ms);
}

static void release(DiagnosticState &state, uint32_t start_ms) {
  state.updateButton(false, start_ms);
  state.updateButton(false, start_ms + DiagnosticState::debounce_ms);
}

void test_bounce_does_not_count_early() {
  DiagnosticState state;
  TEST_ASSERT_FALSE(state.updateButton(true, 10));
  TEST_ASSERT_FALSE(state.updateButton(false, 20));
  TEST_ASSERT_FALSE(state.updateButton(true, 25));
  TEST_ASSERT_FALSE(state.updateButton(true, 54));
  TEST_ASSERT_EQUAL_UINT32(0, state.pressCount());
  TEST_ASSERT_TRUE(state.updateButton(true, 55));
  TEST_ASSERT_EQUAL_UINT32(1, state.pressCount());
}

void test_held_button_counts_once() {
  DiagnosticState state;
  TEST_ASSERT_TRUE(press(state, 100));
  TEST_ASSERT_FALSE(state.updateButton(true, 500));
  TEST_ASSERT_FALSE(state.updateButton(true, 1000));
  TEST_ASSERT_EQUAL_UINT32(1, state.pressCount());
}

void test_release_allows_the_next_press() {
  DiagnosticState state;
  TEST_ASSERT_TRUE(press(state, 100));
  release(state, 200);
  TEST_ASSERT_TRUE(press(state, 300));
  TEST_ASSERT_EQUAL_UINT32(2, state.pressCount());
}

void test_eighth_press_uses_full_refresh() {
  DiagnosticState state;
  uint32_t now = 100;
  for (uint32_t i = 1; i <= DiagnosticState::partials_before_full; i++) {
    TEST_ASSERT_TRUE(press(state, now));
    TEST_ASSERT_EQUAL(i == DiagnosticState::partials_before_full ? RefreshMode::Full : RefreshMode::Partial,
                      state.refreshMode());
    release(state, now + 50);
    now += 100;
  }
}

void test_refresh_duration_is_recorded() {
  DiagnosticState state;
  state.recordRefresh(1234);
  TEST_ASSERT_EQUAL_UINT32(1234, state.lastRefreshMs());
}

int main(int argc, char **argv) {
  UNITY_BEGIN();
  RUN_TEST(test_bounce_does_not_count_early);
  RUN_TEST(test_held_button_counts_once);
  RUN_TEST(test_release_allows_the_next_press);
  RUN_TEST(test_eighth_press_uses_full_refresh);
  RUN_TEST(test_refresh_duration_is_recorded);
  return UNITY_END();
}
