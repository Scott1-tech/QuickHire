"""File decode/save + the path-traversal guard in resolve_file (regression)."""
import os

import app.config as cfg
from app.files import decode_and_save, resolve_file


def _use_uploads(tmp_path, monkeypatch):
    base = tmp_path / "uploads"
    base.mkdir()
    monkeypatch.setattr(cfg, "UPLOAD_DIR", str(base))
    return base


def test_resolve_file_blocks_sibling_directory(tmp_path, monkeypatch):
    base = _use_uploads(tmp_path, monkeypatch)
    sibling = tmp_path / "uploads-evil"
    sibling.mkdir()
    (sibling / "x.txt").write_text("secret")
    # "<base>-evil" shares a prefix with the base dir but is NOT inside it.
    assert resolve_file("../uploads-evil/x.txt") is None


def test_resolve_file_blocks_parent_traversal(tmp_path, monkeypatch):
    _use_uploads(tmp_path, monkeypatch)
    assert resolve_file("../../etc/passwd") is None


def test_resolve_file_allows_path_inside_base(tmp_path, monkeypatch):
    base = _use_uploads(tmp_path, monkeypatch)
    sub = base / "p1"
    sub.mkdir()
    target = sub / "cdlFront.png"
    target.write_bytes(b"img")
    assert resolve_file("p1/cdlFront.png") == os.path.normpath(str(target))


def test_resolve_file_none_for_empty_or_missing(tmp_path, monkeypatch):
    _use_uploads(tmp_path, monkeypatch)
    assert resolve_file(None) is None
    assert resolve_file("") is None
    assert resolve_file("p1/does-not-exist.png") is None


def test_decode_and_save_writes_decoded_bytes(tmp_path, monkeypatch):
    base = _use_uploads(tmp_path, monkeypatch)
    out = decode_and_save("p1", "cdlFront", {"dataUrl": "data:image/png;base64,aGVsbG8="})  # "hello"
    assert out["stored"] == os.path.join("p1", "cdlFront.png")
    assert out["mime"] == "image/png"
    assert (base / "p1" / "cdlFront.png").read_bytes() == b"hello"


def test_decode_and_save_rejects_bad_input(tmp_path, monkeypatch):
    _use_uploads(tmp_path, monkeypatch)
    assert decode_and_save("p1", "x", None) is None
    assert decode_and_save("p1", "x", {"dataUrl": "not-a-data-url"}) is None
