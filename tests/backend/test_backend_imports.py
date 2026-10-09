"""Static import audit for backend/.

AKS runs Linux, where imports are CASE-SENSITIVE. Windows is not, so a wrong-case
import (e.g. ``shared.ADX`` vs ``shared/adx.py``) works locally and breaks in the pod.
These tests parse every backend module and check, without executing anything:

* every local import (apis.*, domains.*, shared.*, main) resolves to a real file with
  the exact case, and every imported name is defined in the target module;
* every third-party import is installed and pinned in requirements.txt.
"""
import ast
import importlib.metadata as md
import importlib.util
import os
import re
import sys
from functools import lru_cache
from pathlib import Path

import pytest

pytestmark = pytest.mark.unit

BACKEND = Path(__file__).resolve().parents[2] / "backend"
LOCAL_ROOTS = {"apis", "domains", "shared", "main"}


def _py_files():
    return sorted(
        p for p in BACKEND.rglob("*.py")
        if "__pycache__" not in p.parts and "static" not in p.relative_to(BACKEND).parts
    )


@lru_cache(maxsize=None)
def _entries(directory: Path):
    return frozenset(os.listdir(directory)) if directory.is_dir() else frozenset()


def _resolve(module: str):
    """Resolve a dotted module to a .py file or package dir using EXACT case, else None."""
    cur = BACKEND
    parts = module.split(".")
    for i, part in enumerate(parts):
        names = _entries(cur)
        if i == len(parts) - 1 and f"{part}.py" in names:
            return cur / f"{part}.py"   # a module beats a namespace package
        if part in names and (cur / part).is_dir():
            cur = cur / part
            continue
        return None
    return cur


@lru_cache(maxsize=None)
def _defined_names(path: Path):
    """Top-level names bound in a module. Returns (names, has_star_import)."""
    tree = ast.parse(path.read_text(encoding="utf-8", errors="replace"))
    names, star = set(), False

    def bind(target):
        for node in ast.walk(target):
            if isinstance(node, ast.Name):
                names.add(node.id)

    def visit(body):
        nonlocal star
        for node in body:
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                names.add(node.name)
                continue  # do not descend into function/class bodies
            if isinstance(node, ast.Assign):
                for t in node.targets:
                    bind(t)
            elif isinstance(node, (ast.AnnAssign, ast.AugAssign)):
                bind(node.target)
            elif isinstance(node, ast.Import):
                for a in node.names:
                    names.add(a.asname or a.name.split(".")[0])
            elif isinstance(node, ast.ImportFrom):
                for a in node.names:
                    if a.name == "*":
                        star = True
                    else:
                        names.add(a.asname or a.name)
            elif isinstance(node, (ast.For, ast.AsyncFor, ast.With, ast.AsyncWith)):
                if hasattr(node, "target"):
                    bind(node.target)
                for item in getattr(node, "items", []):
                    if item.optional_vars is not None:
                        bind(item.optional_vars)
            # descend into module-level control flow (if/try/for/with)
            for field in ("body", "orelse", "finalbody"):
                visit(getattr(node, field, []))
            for handler in getattr(node, "handlers", []):
                visit(handler.body)

    visit(tree.body)
    return frozenset(names), star


def _imports():
    """Yield (file, lineno, module, [names]) for every absolute import in backend/."""
    for path in _py_files():
        tree = ast.parse(path.read_text(encoding="utf-8", errors="replace"), filename=str(path))
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for a in node.names:
                    yield path, node.lineno, a.name, []
            elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
                yield path, node.lineno, node.module, [a.name for a in node.names]


def _where(path, lineno):
    return f"{path.relative_to(BACKEND)}:{lineno}"


def test_backend_has_no_relative_imports():
    """The backend uses absolute namespace-package imports only."""
    bad = []
    for path in _py_files():
        tree = ast.parse(path.read_text(encoding="utf-8", errors="replace"))
        bad += [_where(path, n.lineno) for n in ast.walk(tree)
                if isinstance(n, ast.ImportFrom) and n.level > 0]
    assert not bad, "relative imports found:\n" + "\n".join(bad)


def test_local_imports_resolve_with_exact_case():
    problems = []
    for path, lineno, module, names in _imports():
        if module.split(".")[0] not in LOCAL_ROOTS:
            continue
        target = _resolve(module)
        if target is None:
            problems.append(f"{_where(path, lineno)}  '{module}' not found (exact case)")
            continue
        for name in names:
            if name == "*":
                continue
            if target.is_dir():
                if _resolve(f"{module}.{name}") is None:
                    problems.append(f"{_where(path, lineno)}  '{module}' has no submodule '{name}'")
            else:
                defined, star = _defined_names(target)
                if name not in defined and not star:
                    problems.append(f"{_where(path, lineno)}  '{name}' is not defined in '{module}'")
    assert not problems, "broken local imports:\n" + "\n".join(problems)


def _third_party_tops():
    stdlib = set(sys.stdlib_module_names)
    tops = {}
    for path, lineno, module, _ in _imports():
        top = module.split(".")[0]
        if top in LOCAL_ROOTS or top in stdlib or top == "__future__":
            continue
        tops.setdefault(top, _where(path, lineno))
    return tops


def test_third_party_imports_are_installed():
    missing = [f"{where}  '{top}'" for top, where in sorted(_third_party_tops().items())
               if importlib.util.find_spec(top) is None]
    assert not missing, "third-party modules not installed:\n" + "\n".join(missing)


def _norm(name):
    return re.sub(r"[-_.]+", "-", name).lower()


def test_third_party_imports_are_pinned_in_requirements():
    pinned = set()
    for line in (BACKEND / "requirements.txt").read_text(encoding="utf-8").splitlines():
        line = line.split("#", 1)[0].strip()
        if line:
            pinned.add(_norm(re.split(r"[=<>!~\[; ]", line, 1)[0]))
    dists_by_top = md.packages_distributions()
    unpinned = []
    for top, where in sorted(_third_party_tops().items()):
        dists = {_norm(d) for d in dists_by_top.get(top, [])}
        if dists and not dists & pinned:
            unpinned.append(f"{where}  '{top}' (from {', '.join(sorted(dists))})")
    assert not unpinned, "imported but not pinned in requirements.txt:\n" + "\n".join(unpinned)
