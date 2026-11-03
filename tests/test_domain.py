# SPDX-License-Identifier: GPL-3.0-only

import pytest

from services.processor.domain import identificar_link, parsear_lrc


@pytest.mark.parametrize(
    ("url", "expected"),
    [
        ("https://www.youtube.com/watch?v=abc123", ("youtube", "abc123")),
        ("https://youtube.com/shorts/short123", ("youtube", "short123")),
        ("https://youtube.com/live/live123", ("youtube", "live123")),
        ("https://youtu.be/xyz789", ("youtube", "xyz789")),
        ("https://open.spotify.com/track/track123", ("spotify", "track123")),
    ],
)
def test_identificar_link_supported_urls(url, expected):
    assert identificar_link(url) == expected


def test_identificar_link_rejects_playlist_and_unknown_provider():
    with pytest.raises(ValueError):
        identificar_link("https://open.spotify.com/playlist/playlist123")
    with pytest.raises(ValueError):
        identificar_link("https://example.com/music/123")


def test_parsear_lrc_sorts_lines_and_expands_multiple_timestamps():
    result = parsear_lrc("""[00:05.50]Second line
[00:01.20][00:02.40]Repeated line
[00:08.00]
not a timestamp
""")

    assert result == [
        {"t": 1.2, "text": "Repeated line"},
        {"t": 2.4, "text": "Repeated line"},
        {"t": 5.5, "text": "Second line"},
    ]
