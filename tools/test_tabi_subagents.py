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


class Said(Tmp):
    def stop(self, message, terminal="t1d", now=7000):
        ts.handle({"hook_event_name": "Stop", "last_assistant_message": message}, terminal, self.root, now)

    def notify(self, message, kind="permission_prompt", terminal="t1d", now=8000):
        ts.handle({"hook_event_name": "Notification", "message": message, "notification_type": kind}, terminal, self.root, now)

    def file(self, name, terminal="t1d"):
        return os.path.join(self.root, terminal, name)

    def test_stop_records_the_first_line_of_the_final_answer(self):
        self.stop("\nListo: arreglé el CI.\nDetalle largo...")
        self.assertEqual(read(self.file("_stop.json")), {"text": "Listo: arreglé el CI.", "at": 7000})

    def test_a_long_first_line_is_cut_for_the_card(self):
        self.stop("x" * 500)
        text = read(self.file("_stop.json"))["text"]
        self.assertEqual(len(text), ts.MAX_SAID)
        self.assertTrue(text.endswith("…"))

    def test_a_newer_stop_replaces_the_older_one(self):
        self.stop("first", now=1000)
        self.stop("second", now=9000)
        self.assertEqual(read(self.file("_stop.json")), {"text": "second", "at": 9000})

    def test_notifications_that_wait_for_the_person_are_recorded(self):
        for kind in ts.WAITING:
            self.notify(f"needs {kind}", kind=kind)
            self.assertEqual(read(self.file("_notification.json"))["text"], f"needs {kind}")

    def test_other_notifications_are_not(self):
        self.notify("Claude is waiting for your input", kind="idle_prompt")
        self.notify("logged in", kind="auth_success")
        self.notify("no type at all", kind=None)
        self.assertFalse(os.path.exists(self.file("_notification.json")))

    def test_empty_text_records_nothing(self):
        self.stop("")
        self.stop(None)
        self.stop("   \n  ")
        self.assertFalse(os.path.exists(self.file("_stop.json")))

    def test_what_was_said_is_not_a_sub_agent_and_is_never_pruned_as_one(self):
        self.stop("hello", now=1000)
        for i in range(ts.MAX_FILES + 5):
            ts.handle({"hook_event_name": "SubagentStart", "agent_id": f"a{i:03d}", "agent_type": "x"}, "t1d", self.root, 2000 + i)
        self.assertTrue(os.path.exists(self.file("_stop.json")))

    def test_a_very_old_one_is_dropped_by_the_next_event(self):
        self.stop("ancient", now=0)
        self.stop("recent", terminal="t1d", now=(ts.STALE_S + 10) * 1000)
        self.assertEqual(read(self.file("_stop.json"))["text"], "recent")
        self.notify("ancient too", now=0)
        self.stop("later", now=(ts.STALE_S + 20) * 1000)
        self.assertFalse(os.path.exists(self.file("_notification.json")))

    def test_session_end_removes_it_too(self):
        self.stop("bye")
        ts.handle({"hook_event_name": "SessionEnd"}, "t1d", self.root, 9000)
        self.assertFalse(os.path.exists(os.path.join(self.root, "t1d")))


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

    def test_a_typed_stop_without_a_start_is_still_recorded(self):
        # a quick sub-agent: its stop can be handled before its start has been written
        self.stop()
        self.assertEqual(read(self.path())["status"], "done")

    def test_a_bare_stop_is_an_internal_agent_and_is_ignored(self):
        # Claude Code runs agents of its own (the suggestion of what you may type next) and reports a SubagentStop with
        # no start and no agent_type: they are not work the person asked for
        ts.handle({"hook_event_name": "SubagentStop", "agent_id": "a6716", "last_assistant_message": "ya lo ejecuté"}, "t1d", self.root, 1)
        ts.handle({"hook_event_name": "SubagentStop", "agent_id": "a6717", "agent_type": "", "last_assistant_message": "x"}, "t1d", self.root, 1)
        self.assertEqual(os.listdir(self.root), [])

    def test_a_late_start_does_not_bring_a_finished_one_back(self):
        self.stop(now=2000)
        self.start(now=3000)
        self.assertEqual(read(self.path())["status"], "done")

    def test_a_stop_of_a_started_sub_agent_without_a_type_still_closes_it(self):
        self.start()
        ts.handle({"hook_event_name": "SubagentStop", "agent_id": "agent-1", "last_assistant_message": "ok"}, "t1d", self.root, 5000)
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
