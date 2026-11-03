# SPDX-License-Identifier: GPL-3.0-only
"""Backward-compatible entry point for the original Musician CLI."""

from services.processor.main import main, remover_warnings


if __name__ == "__main__":
    remover_warnings()
    main()
