import struct
import unittest
import zlib

from tools.capture_screen import FrameHeader, encode_grayscale_png, framebuffer_to_scanlines, parse_frame_header


class CaptureScreenTests(unittest.TestCase):
    def test_parses_and_validates_header(self):
        header = parse_frame_header(b"INKPULSE_FRAME_V1 800 480 100 48000 CBF43926\n")
        self.assertEqual(header.width, 800)
        self.assertEqual(header.height, 480)
        self.assertEqual(header.size, 48000)
        self.assertEqual(header.crc32, 0xCBF43926)

    def test_rejects_inconsistent_stride(self):
        with self.assertRaisesRegex(ValueError, "unexpected stride"):
            parse_frame_header(b"INKPULSE_FRAME_V1 800 480 99 47520 00000000\n")

    def test_expands_most_significant_bit_first(self):
        header = FrameHeader(width=8, height=1, stride=1, size=1, crc32=0)
        scanlines = framebuffer_to_scanlines(bytes([0b10100101]), header)
        self.assertEqual(scanlines, bytes([0, 255, 0, 255, 0, 0, 255, 0, 255]))

    def test_encodes_png_dimensions_and_valid_chunks(self):
        header = FrameHeader(width=8, height=1, stride=1, size=1, crc32=zlib.crc32(b"\xff"))
        png = encode_grayscale_png(b"\xff", header)
        self.assertEqual(png[:8], b"\x89PNG\r\n\x1a\n")
        self.assertEqual(png[12:16], b"IHDR")
        self.assertEqual(struct.unpack(">II", png[16:24]), (8, 1))
        self.assertTrue(png.endswith(b"IEND\xaeB`\x82"))


if __name__ == "__main__":
    unittest.main()
