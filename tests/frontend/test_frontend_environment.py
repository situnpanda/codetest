"""Runs the Node-based frontend tests (environment.test.mjs) under pytest."""
import shutil
import subprocess
from pathlib import Path

import pytest

pytestmark = pytest.mark.unit

NODE = shutil.which("node")
TEST_FILE = Path(__file__).with_name("environment.test.mjs")


@pytest.mark.skipif(NODE is None, reason="node is not installed")
def test_environment_js():
    result = subprocess.run(
        [NODE, "--test", str(TEST_FILE)],
        capture_output=True, text=True, timeout=120, check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr
