"""Searches lyric sites and YouTube for songs, using Leihu Singsing's own code.

Run with Leihu's bundled Python (server/link-finder.js does this):
    <leihu>/python/python.exe tools/find-videos.py <leihu install folder>

Reads one JSON object per line on stdin: {"key", "title", "artist"}.
Writes one JSON object per line on stdout:
    {"ready": true}                       once Leihu's modules loaded
    {"fatal": "..."}                      Leihu missing or unsupported, then exits
    {"key", "lyrics": [...], "videos": [...], "errors": [...]}   per song
Text fields ending in _n are normalized with Leihu's _norm (simplified Chinese,
lowercase, letters and digits only) so the server can compare them directly.
Nothing is downloaded: lyric text is dropped, YouTube results are metadata only.
"""
import json
import sys
import time
from concurrent.futures import ThreadPoolExecutor

NEEDED = ("search_lrclib", "search_netease", "search_kugou", "to_simplified", "_norm")
LYRIC_BUDGET_S = 20     # stop waiting for slow lyric sites after this long
PAUSE_S = 1.0           # pause between songs, to stay polite to the sites
VIDEOS_PER_SEARCH = 10


def emit(obj):
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def search_lyrics(P, title, artist, errors):
    queries = [f"{title} {artist}".strip()]
    simp = P.to_simplified(queries[0])
    if simp != queries[0]:
        queries.append(simp)
    sites = [P.search_lrclib, P.search_netease, P.search_kugou]
    found = {}
    deadline = time.time() + LYRIC_BUDGET_S
    with ThreadPoolExecutor(max_workers=3) as pool:
        for q in queries:
            futs = [(fn, pool.submit(fn, q)) for fn in sites]
            for fn, f in futs:
                try:
                    for c in f.result(timeout=max(0.1, deadline - time.time())):
                        found.setdefault(c["id"], c)
                except Exception as e:
                    errors.append(f"{fn.__name__}: {type(e).__name__}")
    return [{
        "source": c.get("source"), "track": c.get("track") or "", "artist": c.get("artist") or "",
        "duration": c.get("duration"), "synced": bool(c.get("synced")),
        "track_n": P._norm(c.get("track") or ""), "artist_n": P._norm(c.get("artist") or ""),
    } for c in found.values()]


def video_queries(P, title, artist):
    # YouTube sometimes returns nothing for an exact "title artist" search that works when
    # reordered, simplified or shortened, so these are tried in turn until one has results
    queries = [f"{title} {artist}", f"{artist} {title}", P.to_simplified(f"{title} {artist}"), title]
    out = []
    for q in queries:
        q = q.strip()
        if q and q not in out:
            out.append(q)
    return out


def search_videos(P, ydl, title, artist, errors):
    entries = []
    for query in video_queries(P, title, artist):
        try:
            info = ydl.extract_info(f"ytsearch{VIDEOS_PER_SEARCH}:{query}", download=False)
        except Exception as e:
            errors.append(f"youtube: {type(e).__name__}: {e}"[:300])
            continue
        entries = (info or {}).get("entries") or []
        if entries:
            break
    out = []
    for e in entries:
        if not e or not e.get("id"):
            continue
        channel = e.get("channel") or e.get("uploader") or ""
        out.append({
            "id": e["id"], "title": e.get("title") or "", "channel": channel,
            "duration": e.get("duration"), "views": e.get("view_count"),
            "title_n": P._norm(e.get("title") or ""), "channel_n": P._norm(channel),
        })
    return out


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stdin.reconfigure(encoding="utf-8")
    except Exception:
        pass
    if len(sys.argv) < 2:
        emit({"fatal": "usage: find-videos.py <leihu install folder>"})
        return
    sys.path.insert(0, sys.argv[1])
    try:
        import pipeline as P
        import yt_dlp
    except Exception as e:
        emit({"fatal": f"could not load Leihu Singsing: {type(e).__name__}: {e}"})
        return
    missing = [n for n in NEEDED if not hasattr(P, n)]
    if missing:
        emit({"fatal": "Leihu Singsing version not supported (missing " + ", ".join(missing) + ")"})
        return
    ydl = yt_dlp.YoutubeDL({"quiet": True, "no_warnings": True, "extract_flat": "in_playlist",
                            "skip_download": True, "noprogress": True})
    emit({"ready": True})

    first = True
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        song = json.loads(line)
        if not first:
            time.sleep(PAUSE_S)
        first = False
        title, artist = song.get("title") or "", song.get("artist") or ""
        errors = []
        lyrics = search_lyrics(P, title, artist, errors)
        videos = search_videos(P, ydl, title, artist, errors)
        emit({"key": song.get("key"), "title_n": P._norm(title), "artist_n": P._norm(artist),
              "lyrics": lyrics, "videos": videos, "errors": errors})


if __name__ == "__main__":
    main()
