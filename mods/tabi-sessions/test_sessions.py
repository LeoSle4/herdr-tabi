#   python -X utf8 -m unittest test_sessions.py     (run from this folder)
import datetime
import unittest

import sessions


class CodexTitle(unittest.TestCase):
    def test_name_wins_then_title_then_first_message_then_preview(self):
        self.assertEqual(sessions.codex_title("Mi nombre", "Titulo", "Hola", "Vista", 1), "Mi nombre")
        self.assertEqual(sessions.codex_title("", "Titulo", "Hola", "Vista", 1), "Titulo")
        self.assertEqual(sessions.codex_title(None, None, "Hola", "Vista", 1), "Hola")
        self.assertEqual(sessions.codex_title(None, None, None, "Vista", 1), "Vista")

    def test_first_message_is_one_line_and_truncated(self):
        text = sessions.codex_title(None, "", "linea uno\n\n  linea dos " + "x" * 300, None, 1)
        self.assertNotIn("\n", text)
        self.assertEqual(len(text), 140)
        self.assertTrue(text.endswith("…"))

    def test_untitled_shows_the_date(self):
        ms = int(datetime.datetime(2026, 11, 19, 12, 0).timestamp() * 1000)
        self.assertEqual(sessions.codex_title(None, "", "  ", None, ms), "Sin título · 2026-11-19")

    def test_untitled_without_a_date(self):
        self.assertEqual(sessions.codex_title(None, None, None, None, 0), "Sin título")


if __name__ == "__main__":
    unittest.main()
