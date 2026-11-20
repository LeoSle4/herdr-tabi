"""Tests for tabi_hooks.py. Run from the repo root: python3 -m unittest discover -s tools"""
import json
import os
import tempfile
import unittest

import tabi_hooks as ts


def read(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def text(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


class Tmp(unittest.TestCase):
    def setUp(self):
        self._dir = tempfile.TemporaryDirectory()
        self.addCleanup(self._dir.cleanup)
        self.root = self._dir.name


class Settings(Tmp):
    def settings(self):
        return os.path.join(self.root, "settings.json")

    def write(self, data):
        with open(self.settings(), "w", encoding="utf-8") as f:
            json.dump(data, f)

    def test_install_into_a_missing_settings_file(self):
        self.assertEqual(ts.install(self.root), list(ts.EVENTS))
        hooks = read(self.settings())["hooks"]
        for event in ts.EVENTS:
            entry = hooks[event][0]
            self.assertEqual(entry["matcher"], "")
            self.assertEqual(entry["hooks"][0]["type"], "command")
            self.assertTrue(entry["hooks"][0]["async"])
            self.assertIn(ts.MARK, entry["hooks"][0]["command"])

    def test_install_twice_changes_nothing_the_second_time(self):
        ts.install(self.root)
        before = text(self.settings())
        self.assertEqual(ts.install(self.root), [])
        self.assertEqual(text(self.settings()), before)

    def test_install_keeps_everything_else_and_makes_one_backup(self):
        other = {"matcher": "", "hooks": [{"type": "command", "command": "gentle-ai telemetry runtime claude --json", "timeout": 5, "async": True}]}
        self.write({"model": "opus", "hooks": {"SubagentStop": [other], "Stop": [other]}})
        ts.install(self.root)
        data = read(self.settings())
        self.assertEqual(data["model"], "opus")
        self.assertEqual(data["hooks"]["Stop"], [other])
        self.assertEqual(data["hooks"]["SubagentStop"][0], other)
        self.assertEqual(len(data["hooks"]["SubagentStop"]), 2)
        self.assertEqual(read(self.settings() + ".tabi-backup")["model"], "opus")
        ts.uninstall(self.root)
        ts.install(self.root)
        self.assertEqual(read(self.settings() + ".tabi-backup")["model"], "opus")  # the first backup is never replaced

    def test_install_replaces_a_hook_that_points_somewhere_else(self):
        stale = {"matcher": "", "hooks": [{"type": "command", "command": '"/old/python" "/old/tabi_subagents.py"', "timeout": 5, "async": True}]}
        self.write({"hooks": {event: [stale] for event in ts.EVENTS}})
        self.assertEqual(ts.install(self.root), list(ts.EVENTS))
        for event in ts.EVENTS:
            entries = read(self.settings())["hooks"][event]
            self.assertEqual(len(entries), 1)
            self.assertNotIn("/old/", entries[0]["hooks"][0]["command"])

    def test_uninstall_removes_only_ours(self):
        other = {"matcher": "", "hooks": [{"type": "command", "command": "gentle-ai telemetry runtime claude --json"}]}
        self.write({"hooks": {"SubagentStop": [other]}})
        ts.install(self.root)
        self.assertEqual(ts.uninstall(self.root), list(ts.EVENTS))
        data = read(self.settings())
        self.assertEqual(data["hooks"], {"SubagentStop": [other]})
        self.assertEqual(ts.uninstall(self.root), [])

    def test_uninstall_drops_an_empty_hooks_section(self):
        ts.install(self.root)
        ts.uninstall(self.root)
        self.assertNotIn("hooks", read(self.settings()))

    def test_status_tells_missing_from_in_place(self):
        self.assertFalse(any(ts.status(self.root).values()))
        ts.install(self.root)
        self.assertTrue(all(ts.status(self.root).values()))
        data = read(self.settings())
        del data["hooks"]["SessionEnd"]
        self.write(data)
        self.assertEqual(ts.status(self.root), {"SubagentStart": True, "SubagentStop": True, "SessionEnd": False})

    def test_a_settings_file_that_is_not_an_object_is_refused(self):
        with open(self.settings(), "w", encoding="utf-8") as f:
            f.write("[]")
        with self.assertRaises(ValueError):
            ts.install(self.root)
        self.assertEqual(text(self.settings()), "[]")


if __name__ == "__main__":
    unittest.main()
