"""Serve the site locally with the headers from site/_headers, so CSP problems show up
in the browser console before they reach production.

    python -I tools/serve.py site 8137

upgrade-insecure-requests is dropped from the CSP, since the local server is plain http,
and every response is sent with Cache-Control: no-store.
"""
import fnmatch
import functools
import http.server
import os
import sys


def parse_headers(path):
    rules, cur = [], None
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            if not line.strip():
                continue
            if not line[0].isspace():
                cur = (line.strip(), [])
                rules.append(cur)
            else:
                key, value = line.strip().split(":", 1)
                value = value.strip()
                if key.strip().lower() == "content-security-policy":
                    value = "; ".join(d for d in value.split("; ") if d != "upgrade-insecure-requests")
                cur[1].append((key.strip(), value))
    return rules


def main():
    root, port = sys.argv[1], int(sys.argv[2])
    rules = parse_headers(os.path.join(root, "_headers"))

    class Handler(http.server.SimpleHTTPRequestHandler):
        def end_headers(self):
            path = self.path.split("?", 1)[0]
            for pattern, headers in rules:
                if fnmatch.fnmatch(path, pattern):
                    for key, value in headers:
                        self.send_header(key, value)
            self.send_header("Cache-Control", "no-store")
            super().end_headers()

    handler = functools.partial(Handler, directory=root)
    print(f"serving {root} on http://127.0.0.1:{port}")
    http.server.ThreadingHTTPServer(("127.0.0.1", port), handler).serve_forever()


if __name__ == "__main__":
    main()
