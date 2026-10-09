"""Static import audit for frontend/src.

The production image is built on Linux (case-sensitive), while local Windows builds
are not -- so a wrong-case import passes locally and fails in CI/AKS. These tests
parse every JS/JSX module (no Node needed) and check that:

* every relative import resolves to a real file with the EXACT case;
* every named/default import from a local module is actually exported by it;
* every bare (package) import is declared in package.json or aliased in vite.config.js;
* no component hardcodes a backend URL instead of using getUrl() from environment.js.
"""
import json
import os
import re
from functools import lru_cache
from pathlib import Path

import pytest

pytestmark = pytest.mark.unit

FRONTEND = Path(__file__).resolve().parents[2] / "frontend"
SRC = FRONTEND / "src"
CODE_EXTS = (".js", ".jsx", ".ts", ".tsx", ".mjs")
RESOLVE_EXTS = ("",) + CODE_EXTS + (".json",)

_BLOCK_COMMENT = re.compile(r"/\*[\s\S]*?\*/")
_LINE_COMMENT = re.compile(r"(?m)^\s*//.*$")
_IMPORT_FROM = re.compile(
    r"""(?m)^\s*(?:import|export)\s+(?:type\s+)?(?P<clause>[\w\s{},*$]+?)\s+from\s+['"](?P<spec>[^'"]+)['"]""")
_SIDE_EFFECT = re.compile(r"""(?m)^\s*import\s+['"](?P<spec>[^'"]+)['"]""")
_DYNAMIC = re.compile(r"""\b(?:import|require)\(\s*['"](?P<spec>[^'"]+)['"]\s*\)""")


def _strip_comments(text):
    return _LINE_COMMENT.sub("", _BLOCK_COMMENT.sub("", text))


def _source_files():
    return sorted(p for p in SRC.rglob("*") if p.suffix in CODE_EXTS and p.is_file())


@lru_cache(maxsize=None)
def _code(path: Path):
    return _strip_comments(path.read_text(encoding="utf-8", errors="replace"))


@lru_cache(maxsize=None)
def _entries(directory: Path):
    return frozenset(os.listdir(directory)) if directory.is_dir() else frozenset()


def _exists_exact(path: Path):
    """True if every component of path exists with exactly this case."""
    try:
        rel = path.relative_to(FRONTEND)
    except ValueError:
        return False
    cur = FRONTEND
    for part in rel.parts:
        if part not in _entries(cur):
            return False
        cur = cur / part
    return True


def _resolve_relative(importer: Path, spec: str):
    base = Path(os.path.normpath(importer.parent / spec))
    for ext in RESOLVE_EXTS:
        candidate = base.with_name(base.name + ext)
        if candidate.is_file() and _exists_exact(candidate):
            return candidate
    for ext in CODE_EXTS:
        candidate = base / f"index{ext}"
        if candidate.is_file() and _exists_exact(candidate):
            return candidate
    return None


def _imports():
    """Yield (file, line, spec, clause_or_None) for every static/dynamic import."""
    for path in _source_files():
        code = _code(path)
        for rx, has_clause in ((_IMPORT_FROM, True), (_SIDE_EFFECT, False), (_DYNAMIC, False)):
            for m in rx.finditer(code):
                line = code.count("\n", 0, m.start("spec")) + 1
                yield path, line, m.group("spec"), (m.group("clause") if has_clause else None)


def _where(path, line):
    return f"{path.relative_to(FRONTEND).as_posix()}:{line}"


@lru_cache(maxsize=None)
def _exports(path: Path):
    """(named_exports, has_default, has_star_reexport) for a local JS module."""
    code = _code(path)
    named = set(re.findall(
        r"\bexport\s+(?:async\s+)?(?:const|let|var|function\*?|class)\s+([A-Za-z_$][\w$]*)", code))
    has_default = bool(re.search(r"\bexport\s+default\b", code))
    for group in re.findall(r"\bexport\s*\{([^}]*)\}", code):
        for item in filter(None, (s.strip() for s in group.split(","))):
            alias = re.split(r"\s+as\s+", item)[-1].strip()
            if alias == "default":
                has_default = True
            else:
                named.add(alias)
    star = bool(re.search(r"\bexport\s*\*\s*from\b", code))
    return frozenset(named), has_default, star


def _parse_clause(clause):
    """Return (wants_default, [named]) from an import clause like `A, { b, c as d }`."""
    clause = clause.strip()
    if clause.startswith("* as") or re.fullmatch(r"\*\s+as\s+\w+", clause):
        return False, []
    named = []
    brace = re.search(r"\{([^}]*)\}", clause)
    if brace:
        for item in filter(None, (s.strip() for s in brace.group(1).split(","))):
            named.append(re.split(r"\s+as\s+", item)[0].strip())
        clause = (clause[:brace.start()] + clause[brace.end():]).strip(" ,")
    clause = re.sub(r",?\s*\*\s+as\s+\w+", "", clause).strip(" ,")
    return bool(clause), named


def _package_name(spec):
    parts = spec.split("/")
    return "/".join(parts[:2]) if spec.startswith("@") else parts[0]


def _declared_packages():
    pkg = json.loads((FRONTEND / "package.json").read_text(encoding="utf-8"))
    return set(pkg.get("dependencies", {})) | set(pkg.get("devDependencies", {}))


def _vite_aliases():
    config = (FRONTEND / "vite.config.js").read_text(encoding="utf-8")
    return re.findall(r"find:\s*['\"]([^'\"]+)['\"]", config)


def test_relative_imports_resolve_with_exact_case():
    broken = [f"{_where(p, ln)}  '{spec}'" for p, ln, spec, _ in _imports()
              if spec.startswith(".") and _resolve_relative(p, spec) is None]
    assert not broken, "unresolved relative imports (check path + case):\n" + "\n".join(broken)


def test_named_and_default_imports_are_exported():
    problems = []
    for path, line, spec, clause in _imports():
        if clause is None or not spec.startswith("."):
            continue
        target = _resolve_relative(path, spec)
        if target is None or target.suffix not in CODE_EXTS:
            continue
        named, has_default, star = _exports(target)
        wants_default, wanted = _parse_clause(clause)
        if wants_default and not has_default:
            problems.append(f"{_where(path, line)}  default import from '{spec}' but it has no default export")
        if not star:
            for name in wanted:
                if name == "default":
                    if not has_default:
                        problems.append(f"{_where(path, line)}  '{spec}' has no default export")
                elif name not in named:
                    problems.append(f"{_where(path, line)}  '{name}' is not exported by '{spec}'")
    assert not problems, "imports of names that are not exported:\n" + "\n".join(problems)


def test_bare_imports_are_declared_or_aliased():
    declared, aliases = _declared_packages(), _vite_aliases()
    undeclared = []
    for path, line, spec, _ in _imports():
        if spec.startswith((".", "/")) or re.match(r"^[a-z]+:", spec):
            continue
        if any(spec == a or spec.startswith(a + "/") for a in aliases):
            continue
        if _package_name(spec) not in declared:
            undeclared.append(f"{_where(path, line)}  '{spec}'")
    assert not undeclared, "packages imported but not in package.json:\n" + "\n".join(undeclared)


def test_vite_alias_shims_exist():
    config = (FRONTEND / "vite.config.js").read_text(encoding="utf-8")
    missing = [s for s in re.findall(r"shim\(\s*['\"]([^'\"]+)['\"]\s*\)", config)
               if not _exists_exact(SRC / "shims" / s)]
    assert not missing, f"vite.config.js aliases point at missing shims: {missing}"


HARDCODED_BACKEND = re.compile(
    r"https?://(?:127\.0\.0\.1|localhost):5000|https?://itelemetry\.providence\.org/api", re.I)


def test_no_hardcoded_backend_urls_outside_environment_js():
    hits = []
    for path in _source_files():
        if path == SRC / "environment.js":
            continue
        code = _code(path)
        hits += [f"{_where(path, code.count(chr(10), 0, m.start()) + 1)}  {m.group(0)}"
                 for m in HARDCODED_BACKEND.finditer(code)]
    assert not hits, "use getUrl() from environment.js instead of:\n" + "\n".join(hits)
