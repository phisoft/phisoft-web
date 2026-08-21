#!/usr/bin/env python3
"""Static-site sanity checker for the Phisoft website.

Verifies, across every HTML file in the repo:
  1. Every local asset reference (img/src, link/href, CSS url()) resolves to a file.
  2. Every internal .html link resolves to a page (no broken pages, no duplicated
     link targets, no stray markup inside hrefs).
  3. Every page closes the tags it opens (div/section/main/body/table/etc.).
  4. Every page has exactly one <h1>, a meta description, a canonical link,
     a theme-color meta, and a title.
  5. No accidental references back to external CDNs for assets we now self-host.

Exit code is non-zero when any check fails — intended to run in CI
(.github/workflows/check.yml) and locally via `python3 scripts/check-site.py`.

Usage:
    python3 scripts/check-site.py [path-to-site-root]
"""

import os
import re
import sys

ROOT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else ".")

HTML_FILES = []
for base, _dirs, files in os.walk(ROOT):
    if ".git" in base:
        continue
    for name in files:
        if name.endswith(".html"):
            HTML_FILES.append(os.path.join(base, name))
HTML_FILES.sort()

SELF_HOSTED = (
    "cdn.jsdelivr.net",
    "unpkg.com",
    "fonts.googleapis.com",
    "fonts.gstatic.com",
    "cdnjs.cloudflare.com",
)

# Balanced-tag checks (void/singleton tags excluded)
TAG_PAIRS = ["div", "section", "main", "body", "html", "table", "ul", "ol",
             "nav", "header", "footer", "aside", "article", "form", "select"]
VOID_TAGS = {"br", "img", "input", "meta", "link", "hr", "source", "area",
             "base", "col", "embed", "param", "track", "wbr"}


def find_local_refs(html, base_dir):
    """Yield (reference, kind) for local asset + page references."""
    for m in re.finditer(r'(?:src|href)="([^"]+)"', html):
        ref = m.group(1)
        if ref.startswith(("http:", "https:", "mailto:", "tel:", "data:", "//", "#")):
            continue
        yield ref, "link"
    for m in re.finditer(r'url\(["\']?([^"\')\s]+)["\']?\)', html):
        ref = m.group(1)
        if ref.startswith(("http:", "https:", "data:", "//")):
            continue
        yield ref, "css-url"


def main():
    errors = []
    warnings = []

    for path in HTML_FILES:
        rel = os.path.relpath(path, ROOT)
        base_dir = os.path.dirname(path)
        html = open(path, encoding="utf-8", errors="replace").read()

        # 1. local refs resolve
        for ref, kind in find_local_refs(html, base_dir):
            clean = ref.split("#", 1)[0].split("?", 1)[0]
            if not clean:
                continue
            target = os.path.normpath(os.path.join(base_dir, clean))
            if not os.path.exists(target):
                errors.append(f"{rel}: broken {kind} reference -> {ref}")
            if kind == "link" and clean.lower().endswith((".css", ".js")):
                for host in SELF_HOSTED:
                    if host in html and ref.startswith("http"):
                        pass  # caught by check 5 below

        # 2. no external CDN refs for self-hosted assets
        for host in SELF_HOSTED:
            if host in html:
                errors.append(f"{rel}: still references external CDN ({host})")

        # 3. tag balance
        for tag in TAG_PAIRS:
            opens = len(re.findall(rf"<{tag}[\s>]", html))
            closes = len(re.findall(rf"</{tag}>", html))
            if opens != closes:
                errors.append(f"{rel}: <{tag}> opens {opens} but closes {closes}")

        # 4. required head elements
        h1_count = len(re.findall(r"<h1[\s>]", html))
        if h1_count != 1:
            errors.append(f"{rel}: expected exactly one <h1>, found {h1_count}")
        if 'name="description"' not in html:
            errors.append(f"{rel}: missing meta description")
        if 'rel="canonical"' not in html:
            errors.append(f"{rel}: missing canonical link")
        if 'name="theme-color"' not in html:
            errors.append(f"{rel}: missing theme-color meta")
        if not re.search(r"<title>[^<]+</title>", html):
            errors.append(f"{rel}: missing or empty <title>")

        # 5. stray markup inside hrefs (e.g. "</title>" corruption)
        for m in re.finditer(r'href="([^"]*<[^>]*>[^"]*)"', html):
            errors.append(f"{rel}: markup inside href attribute -> {m.group(1)}")

    # 6. every page is reachable from somewhere (rough orphan-page check)
    all_refs = set()
    for path in HTML_FILES:
        html = open(path, encoding="utf-8", errors="replace").read()
        for ref, _kind in find_local_refs(html, os.path.dirname(path)):
            if ref.lower().endswith(".html"):
                all_refs.add(os.path.normpath(os.path.join(os.path.dirname(path), ref.split("#")[0])))
    # 404.html is a special page — browsers land on it directly; exclude from orphan check
    for path in HTML_FILES:
        if path.endswith("404.html"):
            continue
        if os.path.abspath(path) not in all_refs:
            warnings.append(f"{os.path.relpath(path, ROOT)}: not linked from any page")

    if errors:
        print(f"FAIL: {len(errors)} problem(s)")
        for e in errors:
            print("  -", e)
        if warnings:
            print(f"WARN: {len(warnings)}")
            for w in warnings:
                print("  !", w)
        sys.exit(1)

    print(f"OK: checked {len(HTML_FILES)} pages — no broken refs, balanced tags, "
          f"required head elements present, no external CDN refs.")
    if warnings:
        print("WARNINGS:")
        for w in warnings:
            print("  !", w)
    sys.exit(0)


if __name__ == "__main__":
    main()
