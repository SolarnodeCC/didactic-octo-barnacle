"""Shared helpers for the tests of the check scripts.

The check scripts keep their state in module globals and read paths relative to the
working directory (or to their own location), so the tests run each script as a
subprocess on a copy of the real inputs in a temporary directory. A test breaks one
rule in the copy and asserts the script's exit code and message.
"""

from __future__ import annotations

import pathlib
import shutil
import subprocess
import sys
import tempfile
import unittest

REPO = pathlib.Path(__file__).resolve().parents[2]


class ScriptTestCase(unittest.TestCase):
    """Copies `PATHS` from the repository and runs `SCRIPT` on the copy."""

    SCRIPT: str = ""
    PATHS: tuple[str, ...] = ()

    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self._tmp.name)
        for relative in self.PATHS:
            source = REPO / relative
            target = self.root / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            if source.is_dir():
                shutil.copytree(source, target)
            else:
                shutil.copy2(source, target)
        script = self.root / "scripts" / self.SCRIPT
        script.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(REPO / "scripts" / self.SCRIPT, script)

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def path(self, relative: str) -> pathlib.Path:
        return self.root / relative

    def read(self, relative: str) -> str:
        return self.path(relative).read_text()

    def write(self, relative: str, text: str) -> None:
        target = self.path(relative)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text)

    def replace(self, relative: str, old: str, new: str) -> None:
        text = self.read(relative)
        self.assertIn(old, text, f"{relative} no longer contains {old!r}; update the test")
        self.write(relative, text.replace(old, new, 1))

    def run_script(self) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(self.root / "scripts" / self.SCRIPT)],
            cwd=self.root,
            capture_output=True,
            text=True,
            timeout=120,
        )

    def assert_passes(self) -> subprocess.CompletedProcess[str]:
        result = self.run_script()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        return result

    def assert_fails_with(self, message: str) -> subprocess.CompletedProcess[str]:
        result = self.run_script()
        output = result.stdout + result.stderr
        self.assertNotEqual(result.returncode, 0, output)
        self.assertIn(message, output)
        return result
