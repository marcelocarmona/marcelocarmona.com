#!/usr/bin/env python3
"""Capture the diagnostic firmware's 1-bit framebuffer over USB serial."""

from __future__ import annotations

import argparse
import dataclasses
import datetime as dt
import struct
import time
import zlib
from pathlib import Path

import serial
from serial.tools import list_ports


CAPTURE_COMMAND = b"INKPULSE SCREENSHOT\n"
PROTOCOL_NAME = "INKPULSE_FRAME_V1"
PROTOCOL_END = b"INKPULSE_FRAME_END"
MAX_FRAME_BYTES = 4 * 1024 * 1024


@dataclasses.dataclass(frozen=True)
class FrameHeader:
    width: int
    height: int
    stride: int
    size: int
    crc32: int


def parse_frame_header(line: bytes) -> FrameHeader:
    try:
        parts = line.decode("ascii").strip().split()
    except UnicodeDecodeError as error:
        raise ValueError("frame header is not ASCII") from error
    if len(parts) != 6 or parts[0] != PROTOCOL_NAME:
        raise ValueError("not an InkPulse frame header")

    try:
        header = FrameHeader(
            width=int(parts[1]),
            height=int(parts[2]),
            stride=int(parts[3]),
            size=int(parts[4]),
            crc32=int(parts[5], 16),
        )
    except ValueError as error:
        raise ValueError("frame header contains an invalid number") from error

    expected_stride = (header.width + 7) // 8
    if header.width <= 0 or header.height <= 0:
        raise ValueError("frame dimensions must be positive")
    if header.stride != expected_stride:
        raise ValueError(f"unexpected stride {header.stride}; expected {expected_stride}")
    if header.size != header.stride * header.height:
        raise ValueError("frame byte count does not match its dimensions")
    if header.size > MAX_FRAME_BYTES:
        raise ValueError("frame is larger than the capture safety limit")
    return header


def framebuffer_to_scanlines(framebuffer: bytes, header: FrameHeader) -> bytes:
    if len(framebuffer) != header.size:
        raise ValueError("framebuffer length does not match the header")

    scanlines = bytearray((header.width + 1) * header.height)
    destination = 0
    for y in range(header.height):
        scanlines[destination] = 0  # PNG filter type: None
        destination += 1
        row_offset = y * header.stride
        for x in range(header.width):
            source = framebuffer[row_offset + x // 8]
            scanlines[destination] = 255 if source & (0x80 >> (x % 8)) else 0
            destination += 1
    return bytes(scanlines)


def png_chunk(kind: bytes, payload: bytes) -> bytes:
    checksum = zlib.crc32(kind)
    checksum = zlib.crc32(payload, checksum)
    return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", checksum)


def encode_grayscale_png(framebuffer: bytes, header: FrameHeader) -> bytes:
    ihdr = struct.pack(">IIBBBBB", header.width, header.height, 8, 0, 0, 0, 0)
    pixels = zlib.compress(framebuffer_to_scanlines(framebuffer, header), level=9)
    return b"\x89PNG\r\n\x1a\n" + png_chunk(b"IHDR", ihdr) + png_chunk(b"IDAT", pixels) + png_chunk(b"IEND", b"")


def choose_port(explicit_port: str | None) -> str:
    if explicit_port:
        return explicit_port

    candidates = [
        port.device
        for port in list_ports.comports()
        if port.vid == 0x303A or "usbmodem" in port.device.lower()
    ]
    if not candidates:
        raise RuntimeError("no ESP32-S3 USB serial port was found; pass --port explicitly")
    if len(candidates) > 1:
        ports = ", ".join(candidates)
        raise RuntimeError(f"multiple USB serial ports were found ({ports}); pass --port explicitly")
    return candidates[0]


def read_header(connection: serial.Serial, timeout_seconds: float) -> FrameHeader:
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        line = connection.readline()
        if line.startswith(PROTOCOL_NAME.encode("ascii")):
            return parse_frame_header(line)
        if line.startswith(b"INKPULSE_FRAME_ERROR"):
            raise RuntimeError(line.decode("ascii", errors="replace").strip())
    raise TimeoutError("timed out waiting for the InkPulse frame header")


def read_exact(connection: serial.Serial, size: int, timeout_seconds: float) -> bytes:
    deadline = time.monotonic() + timeout_seconds
    output = bytearray()
    while len(output) < size and time.monotonic() < deadline:
        output.extend(connection.read(size - len(output)))
    if len(output) != size:
        raise TimeoutError(f"received {len(output)} of {size} framebuffer bytes")
    return bytes(output)


def read_end_marker(connection: serial.Serial, timeout_seconds: float) -> None:
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        line = connection.readline().strip()
        if line == PROTOCOL_END:
            return
    raise TimeoutError("timed out waiting for the framebuffer end marker")


def capture(port: str, timeout_seconds: float) -> tuple[FrameHeader, bytes]:
    with serial.Serial(port, 115200, timeout=0.25, write_timeout=5) as connection:
        time.sleep(0.25)
        connection.reset_input_buffer()
        connection.write(CAPTURE_COMMAND)
        connection.flush()
        header = read_header(connection, timeout_seconds)
        framebuffer = read_exact(connection, header.size, timeout_seconds)
        read_end_marker(connection, timeout_seconds)

    checksum = zlib.crc32(framebuffer) & 0xFFFFFFFF
    if checksum != header.crc32:
        raise RuntimeError(f"CRC32 mismatch: device={header.crc32:08X}, local={checksum:08X}")
    return header, framebuffer


def default_output_path() -> Path:
    timestamp = dt.datetime.now().astimezone().strftime("%Y%m%d-%H%M%S")
    return Path("artifacts/screenshots") / f"inkpulse-{timestamp}.png"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", help="USB serial device; auto-detected when omitted")
    parser.add_argument("--output", type=Path, help="PNG destination")
    parser.add_argument("--timeout", type=float, default=15, help="capture timeout in seconds")
    arguments = parser.parse_args()

    port = choose_port(arguments.port)
    output = arguments.output or default_output_path()
    print(f"Capturing InkPulse framebuffer from {port}...")
    header, framebuffer = capture(port, arguments.timeout)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(encode_grayscale_png(framebuffer, header))
    print(f"Saved {header.width}x{header.height} screenshot to {output.resolve()}")
    print(f"Validated {header.size} bytes with CRC32 {header.crc32:08X}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
