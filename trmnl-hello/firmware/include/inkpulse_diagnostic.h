#pragma once

// Offline hardware validation entry points. This mode never starts Wi-Fi or
// contacts the InkPulse server.
void inkpulse_diagnostic_setup();
void inkpulse_diagnostic_loop();
