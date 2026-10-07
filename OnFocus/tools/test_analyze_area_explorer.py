import contextlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest


spec = importlib.util.spec_from_file_location("analyzer", Path(__file__).with_name("analyze-area-explorer.py"))
analyzer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(analyzer)


class AnalyzerTests(unittest.TestCase):
    def test_rotation_order_and_partial_lines(self):
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory) / "area-explorer-diagnostics.jsonl"
            for suffix, run in ((".3", "first"), (".2", "second"), (".1", "third"), ("", "latest")):
                Path(str(file) + suffix).write_text(json.dumps({"run": run, "event": "flight-start"}) + "\n", encoding="utf-8")
            with file.open("a", encoding="utf-8") as stream:
                stream.write('[]\n{"truncated":\n')
            events, invalid = analyzer.load_events(Path(directory))
            self.assertEqual([e["run"] for e in events], ["first", "second", "third", "latest"])
            self.assertEqual(invalid, 2)

    def test_finish_before_deactivation_and_run_selection(self):
        events = [
            {"run": "earlier", "event": "finish", "missing": 20, "reason": "pass limit"},
            {"run": "latest", "event": "flight-start", "missing": 100},
            {"run": "latest", "event": "finish", "missing": 3, "reason": "pass limit"},
            {"run": "latest", "event": "deactivate"},
        ]
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            analyzer.summarize(events)
        self.assertIn("Run: latest", output.getvalue())
        self.assertIn("missing chunks: 3", output.getvalue())
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            analyzer.summarize(events, "earlier")
        self.assertIn("missing chunks: 20", output.getvalue())

    def test_missing_run(self):
        with self.assertRaises(ValueError):
            analyzer.summarize([])
        with self.assertRaises(ValueError):
            analyzer.summarize([{"run": "known"}], "missing")


if __name__ == "__main__":
    unittest.main()
