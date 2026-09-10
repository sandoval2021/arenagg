from pathlib import Path
import re
import sys

PATTERN = re.compile(r"<img\b[^>]*?/?>", re.S)


def patch_tag(tag: str) -> str:
    attrs: list[str] = []
    if not re.search(r"\bloading\s*=", tag):
        attrs.append('loading="lazy"')
    if not re.search(r"\bdecoding\s*=", tag):
        attrs.append('decoding="async"')
    if not attrs:
        return tag
    suffix = "/>" if tag.rstrip().endswith("/>") else ">"
    body = tag.rstrip()[: -len(suffix)].rstrip()
    return f"{body} {' '.join(attrs)} {suffix}"


changed: list[str] = []
for path in Path("apps/web/src").rglob("*.tsx"):
    original = path.read_text()
    updated = PATTERN.sub(lambda match: patch_tag(match.group(0)), original)
    if updated != original:
        path.write_text(updated)
        changed.append(str(path))

print(f"updated {len(changed)} files")
for path in changed:
    print(path)

failures: list[tuple[Path, str]] = []
count = 0
for path in Path("apps/web/src").rglob("*.tsx"):
    text = path.read_text()
    for match in PATTERN.finditer(text):
        count += 1
        tag = match.group(0)
        has_lazy = bool(re.search(r'\bloading\s*=\s*["\']lazy["\']', tag))
        has_async = bool(re.search(r'\bdecoding\s*=\s*["\']async["\']', tag))
        if not has_lazy or not has_async:
            failures.append((path, tag[:200]))

print(f"validated {count} img tags")
if failures:
    for path, tag in failures:
        print(f"MISSING {path}: {tag}", file=sys.stderr)
    raise SystemExit(1)
