"""Tests for tabi_subagents.py. Run from the repo root: python3 -m unittest discover -s tools"""
import json
import os
import tempfile
import unittest

import tabi_subagents as ts


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


class Events(Tmp):
    def start(self, terminal="t1d", agent_id="agent-1", kind="Explore", now=1000):
        ts.handle({"hook_event_name": "SubagentStart", "agent_id": agent_id, "agent_type": kind}, terminal, self.root, now)

    def stop(self, terminal="t1d", agent_id="agent-1", message="Done.", now=5000):
        ts.handle({"hook_event_name": "SubagentStop", "agent_id": agent_id, "agent_type": "Explore", "last_assistant_message": message},
                  terminal, self.root, now)

    def path(self, terminal="t1d", agent_id="agent-1"):
        return os.path.join(self.root, terminal, agent_id + ".json")

    def test_start_records_a_running_sub_agent(self):
        self.start()
        self.assertEqual(read(self.path()), {"type": "Explore", "status": "running", "started": 1000, "ended": None, "summary": ""})

    def test_stop_marks_it_done_and_keeps_when_it_started(self):
        self.start()
        self.stop(message="Found 3 files.\nMore detail below.")
        rec = read(self.path())
        self.assertEqual((rec["status"], rec["started"], rec["ended"], rec["summary"]), ("done", 1000, 5000, "Found 3 files."))

    def test_stop_without_a_start_still_records_it(self):
        self.stop()
        self.assertEqual(read(self.path())["status"], "done")

    def test_parallel_sub_agents_do_not_overwrite_each_other(self):
        self.start(agent_id="a")
        self.start(agent_id="b", kind="web-fetch")
        self.stop(agent_id="a")
        self.assertEqual(read(self.path(agent_id="a"))["status"], "done")
        self.assertEqual(read(self.path(agent_id="b"))["status"], "running")

    def test_summary_is_one_short_line(self):
        self.assertEqual(ts.summarize("\n\n  hello    world \nsecond"), "hello world")
        long = ts.summarize("x" * 300)
        self.assertEqual(len(long), ts.MAX_SUMMARY)
        self.assertTrue(long.endswith("…"))
        self.assertEqual(ts.summarize(None), "")

    def test_session_end_removes_the_terminals_folder_only(self):
        self.start(terminal="t1d")
        self.start(terminal="t2")
        ts.handle({"hook_event_name": "SessionEnd"}, "t1d", self.root, 9000)
        self.assertFalse(os.path.exists(os.path.join(self.root, "t1d")))
        self.assertTrue(os.path.exists(self.path("t2")))

    def test_nothing_happens_outside_herdr_or_without_an_id(self):
        ts.handle({"hook_event_name": "SubagentStart", "agent_id": "a"}, None, self.root, 1)
        ts.handle({"hook_event_name": "SubagentStart", "agent_id": "a"}, "", self.root, 1)
        ts.handle({"hook_event_name": "SubagentStart"}, "t1d", self.root, 1)
        ts.handle({"hook_event_name": "Stop", "agent_id": "a"}, "t1d", self.root, 1)
        ts.handle("not a dict", "t1d", self.root, 1)
        self.assertEqual(os.listdir(self.root), [])

    def test_ids_can_never_escape_the_state_folder(self):
        self.start(terminal="../../etc", agent_id="../../x")
        for dirpath, _, files in os.walk(self.root):
            self.assertTrue(os.path.abspath(dirpath).startswith(os.path.abspath(self.root)))
        self.assertEqual(ts.safe(".."), "")
        self.assertEqual(ts.safe("msi-casa/t5"), "msi-casa_t5")

    def test_old_finished_and_stale_running_files_are_pruned(self):
        self.start(agent_id="old-done", now=0)
        self.stop(agent_id="old-done", now=1000)
        self.start(agent_id="stale", now=0)
        self.start(agent_id="fresh", now=(ts.STALE_S + 100) * 1000)  # this event prunes the other two
        names = sorted(os.listdir(os.path.join(self.root, "t1d")))
        self.assertEqual(names, ["fresh.json"])

    def test_only_the_newest_files_are_kept(self):
        for i in range(ts.MAX_FILES + 5):
            self.start(agent_id=f"a{i:03d}", now=1000 + i)
        self.assertEqual(len(os.listdir(os.path.join(self.root, "t1d"))), ts.MAX_FILES)
        self.assertTrue(os.path.exists(self.path(agent_id=f"a{ts.MAX_FILES + 4:03d}")))


if __name__ == "__main__":
    unittest.main()
