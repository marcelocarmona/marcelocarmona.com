<a href="https://www.espressif.com">
    <img src="https://www.espressif.com/sites/all/themes/espressif/logo-black.svg" align="right" height="20" />
</a>

# CHANGELOG

> All notable changes to this project are documented in this file.
> This list is not exhaustive - only important changes, fixes, and new features in the code are reflected here.

<div align="center">
    <a href="https://keepachangelog.com/en/1.1.0/">
        <img alt="Static Badge" src="https://img.shields.io/badge/Keep%20a%20Changelog-v1.1.0-salmon?logo=keepachangelog&logoColor=black&labelColor=white&link=https%3A%2F%2Fkeepachangelog.com%2Fen%2F1.1.0%2F">
    </a>
    <a href="https://www.conventionalcommits.org/en/v1.0.0/">
        <img alt="Static Badge" src="https://img.shields.io/badge/Conventional%20Commits-v1.0.0-pink?logo=conventionalcommits&logoColor=black&labelColor=white&link=https%3A%2F%2Fwww.conventionalcommits.org%2Fen%2Fv1.0.0%2F">
    </a>
    <a href="https://semver.org/spec/v2.0.0.html">
        <img alt="Static Badge" src="https://img.shields.io/badge/Semantic%20Versioning-v2.0.0-grey?logo=semanticrelease&logoColor=black&labelColor=white&link=https%3A%2F%2Fsemver.org%2Fspec%2Fv2.0.0.html">
    </a>
</div>
<hr>

## v1.11.0 (2025-12-05)

### ✨ New Features

- Add SDIO support for ESP32-C5 as a target _(Jaroslav Burian - 4591799)_
- Add support for 1-bit SDIO _(Jaroslav Burian - 4d54095)_

### 🐛 Bug Fixes

- Correct flash boundary check for read/verify operations _(RevK - bdf7b62)_

## v1.10.0 (2025-09-25)

### ✨ New Features

- Add support for communication via CP210x and CH34x serial converters _(Jaroslav Burian - 8c67fdc)_
- Add support for USB CDC ACM for ESP32-P4 as a host _(Jaroslav Burian - e6e5282)_

### 🐛 Bug Fixes

- **esp32c2**: Fix transmission rate change for ESP32-C2 with 26 MHz crystal _(Jaroslav Burian - bb5bc52)_
- **esp32c2**: Add missing magic value of new ECO4 _(Jaroslav Burian - 468221a)_

### 📖 Documentation

- Better unify example README files and remove explicit references to ESP32 as a target _(Jaroslav Burian - a70404c)_
- Create new strucured documentation with separated files for each topic _(Jaroslav Burian - 86e49eb)_

### 🔧 Code Refactoring

- Update driver dependency _(Chen Chen - 610873b)_

## v1.9.0 (2025-07-21)

### ✨ New Features

- add erase function _(Jaroslav Burian - 1c36d0a)_
- add esp32_sdio_example to demonstrate SDIO flashing _(Jaroslav Burian - bb41a06)_
- add support for SDIO flashing _(Jaroslav Burian - e5ae852)_
- add support for ESP32-P4 _(Jaroslav Burian - e475fe5)_
- Add ESP32-C5 support without stub _(Jaroslav Burian - f82b1a4)_

### 🐛 Bug Fixes

- ensure stubs for targets are stored in flash to save RAM space _(Jaroslav Burian - e3572f3)_
- flash error log indentation _(Jaroslav Burian - 8d6504d)_
- add missing stub error codes _(Jaroslav Burian - f452b3b)_
- properly check flash size when verifying flash _(Jaroslav Burian - cf1ca67)_
- writing above 0x200000 in SDM _(Jaroslav Burian - 34d27fe)_
- use correct image header size for ESP8266 _(Jaroslav Burian - 3f7a78f)_
- esp8266 bootloader offset address _(Jaroslav Burian - 4858e98)_

### 📖 Documentation

- **zephyr**: improve description of how to use the Zephyr example _(Jaroslav Burian - 08f5f41)_
- fix Markdown syntax and improve notes _(Jaroslav Burian - 52c064e)_
- mention tested SDK and toolchain versions for each port _(Jaroslav Burian - 4b556cd)_
- add link to devcon talk _(Jaroslav Burian - 8869652)_

### 🔧 Code Refactoring

- change chip magic values to variable-length pointer array _(Jaroslav Burian - 2b2066c)_

## v1.8.0 (2025-01-27)

### ✨ New Features

- **examples**: Add ESP32 fast reflash example with MD5 check _(Jaroslav Burian - e0b9b05)_
- Add a function to check flash regions against a known MD5 _(Djordje Nedic - dd480bc)_
- Add the SDIO interface and the corresponding esp port _(Djordje Nedic - b74194b)_

### 🐛 Bug Fixes

- **esp32s3**: Ensure electric current capabilities allowing to flash devkits with UART converters _(Jaroslav Burian - 05d78a4)_
- Print MD5 debug as hex string when using stub _(Jaroslav Burian - ab0ce64)_
- Unify debug prints of all ports _(Jaroslav Burian - ccfd42c)_
- Set default flash size when detection fails _(Jaroslav Burian - adbe6ab)_
- INVALID_ARG error when ESP32P4 used as a host _(Jaroslav Burian - b42d1d8)_
- Return when SDIO connection not initialized _(Jaroslav Burian - 3ee2b25)_
- esp32c2 incorrect SPI flash config detection _(Jaroslav Burian - ed43e0a)_
- Add missing definition for Zephyr debug trace _(Jaroslav Burian - 86effb2)_
- Update USB reset sequence _(Jaroslav Burian - f64cf7c)_

### 📖 Documentation

- Update log output for Zephyr example _(Jaroslav Burian - 7abd989)_
- Fix swapped RX and TX in Zephyr example _(Jaroslav Burian - 7855e5e)_

## v1.7.0 (2024-11-25)

### ✨ New Features

- **examples**: Provide more useful error messages _(Djordje Nedic - 663aa35)_
- Add support for reading from target flash _(Djordje Nedic - 0785c94)_
- Add support for inverting reset and boot pins _(shiona - dfb8551)_
- Update zephyr example to v4.0.0 _(Jaroslav Burian - a6a0711)_

### 🐛 Bug Fixes

- Clarify and validate alignment requirements for flashing _(Djordje Nedic - 400d614)_
- ROUNDUP calculation fix _(Djordje Nedic - 6f17bfe)_
- Zephyr example _(Marek Matej - 5d380bd)_
- Handling of USB buffer overflow _(Jaroslav Burian - aa95e24)_
- Callback when USB port is disconnected _(Jaroslav Burian - c966fe6)_

### 📖 Documentation

- Remove experimental note for USB port _(Jaroslav Burian - 53fb930)_

---

## v1.6.2 (2024-10-18)

### 🐛 Bug Fixes

- Fix the ESP USB CDC ACM port read return value _(Djordje Nedic - ce71bff)_

---

## v1.6.1 (2024-10-15)

### 🐛 Bug Fixes

- Fix ESP32-H2 flash detection _(Jaroslav Burian - a8b1ac4)_

---

## v1.6.0 (2024-09-26)

### ✨ New Features

- Add logging from target to rpi pico port _(Jaroslav Burian - 15d34a1)_
- Add support for Secure Download Mode _(Djordje Nedic - 46f3f0b)_
- Add support for getting target security info _(Djordje Nedic - 96d0183)_

### 🐛 Bug Fixes

- Add delay to usb example to ensure connection _(Jaroslav Burian - c0a2069)_
- Do not enable logging if flashing error - STM _(Jaroslav Burian - cc0421f)_
- Add missing esp32c3 chip magic numbers _(Jaroslav Burian - 82c4fc7)_
- Multiple timeout fixes _(Djordje Nedic - 8f54452)_
- Only check if image fits into flash when we know flash size _(Djordje Nedic - 3bc629c)_
- Duplicate word in logging message _(Jaroslav Burian - c19f0bf)_

### 🔧 Code Refactoring

- **protocol**: Rework command and response handling code _(Djordje Nedic - 86efdf9)_
- **protocol**: Add support for receiving variably sized SLIP packets _(Djordje Nedic - e3c332a)_

---

## v1.5.0 (2024-08-13)

### ✨ New Features

- Add the Raspberry Pi Pico port _(Djordje Nedic - c72680c)_

---

## v1.4.1 (2024-07-16)

### 🐛 Bug Fixes

- Add correct MD5 calculation with stub enabled _(Jaroslav Burian - 88352d9)_
- Remove duplicate word in logging _(Jaroslav Burian - 7225889)_

### 📖 Documentation

- Update description in the READMEs _(Jaroslav Burian - 16b16a6)_

---

## v1.4.0 (2024-07-02)

### ✨ New Features

- add stub-support _(Vincent Hamp - ec1fc06)_

### 🐛 Bug Fixes

- Fix MD5 option handling _(Djordje Nedic - 09e1192)_

---

## v1.3.1 (2024-06-26)

### 🐛 Bug Fixes

- Fix ESP SPI port duplicate tracing _(Djordje Nedic - 116900d)_
- SPI interface/esp port alignment requirements fix _(Djordje Nedic - 9706ed6)_
- Upload to RAM examples monitor task priority fix _(Djordje Nedic - fd86bc3)_

---

## v1.3.0 (2024-03-22)

### ✨ New Features

- Add a convenient public API way to read the WIFI MAC _(Djordje Nedic - 8f07704)_

### 🐛 Bug Fixes

- Correctly compare image size with memory size including offset _(Dzarda7 - 2807ab5)_

---

## v1.2.0 (2024-02-28)

### ✨ New Features

- Move flash size detection functionality to the public API _(Djordje Nedic - 6ae5b95)_

### 🐛 Bug Fixes

- **docs**: Fix table in SPI load to RAM example _(Djordje Nedic - edd8a6a)_
- Fix inferring flash size from the flash ID _(Djordje Nedic - 3a1f345)_

---

## v1.1.0 (2024-02-13)

### ✨ New Features

- USB CDC ACM interface support _(Djordje Nedic - 4e26444)_
- Add the ability for ESP ports to not initialize peripherals _(Djordje Nedic - 541fe12)_

### 🐛 Bug Fixes

- **docs**: Remove notes about SPI interface being experimental _(Djordje Nedic - 3ffc189)_
- Document size_id and improve comments in places _(Djordje Nedic - 3a1e818)_

---

## v1.0.2 (2023-12-20)

### 🐛 Bug Fixes

- Fix flash size ID sanity checks _(Djordje Nedic - 01e1618)_

---

## v1.0.1 (2023-12-19)

### 🐛 Bug Fixes

- **ci**: Add more compiler warnings for the flasher in the examples _(Djordje Nedic - eb18fd0)_
- Fix md5 timeout values _(Djordje Nedic - 058156c)_

---

<div align="center">
    <small>
        <b>
            <a href="https://www.github.com/espressif/cz-plugin-espressif">Commitizen Espressif plugin</a>
        </b>
    <br>
        <sup><a href="https://www.espressif.com">Espressif Systems CO LTD. (2025)</a><sup>
    </small>
</div>
