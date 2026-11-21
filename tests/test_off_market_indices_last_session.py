"""
Tests for off-market / weekend indices last session data fallback.
Ensures NIFTY, BANKNIFTY, SENSEX, FINNIFTY, MIDCPNIFTY, BANKEX, and INDIAVIX
reliably retain real market session closing metrics even when live quotes are idle.
"""

import unittest
from unittest.mock import patch
import sys
import os

sys.path.insert(0, os.path.abspath("backend"))
import server


class TestOffMarketIndicesLastSession(unittest.TestCase):

    def test_strip_labels_coverage(self):
        """All major indices should have comprehensive matching labels."""
        for sym in ["NIFTY", "BANKNIFTY", "SENSEX", "FINNIFTY", "MIDCPNIFTY", "BANKEX"]:
            labels = server.strip_labels_for_symbol(sym)
            self.assertTrue(len(labels) >= 2, f"Symbol {sym} missing expected label variants")
            self.assertIn(sym, labels)

    def test_market_strip_symbols_includes_midcap_and_bankex(self):
        """MARKET_STRIP_SYMBOLS must include MIDCPNIFTY and BANKEX."""
        self.assertIn("MIDCAP SELECT", server.MARKET_STRIP_SYMBOLS)
        self.assertIn("BSE BANKEX", server.MARKET_STRIP_SYMBOLS)

    def test_build_fast_home_index_quote_card_handles_missing_future_cfg(self):
        """Indices without a futures contract in INDEX_MAP must not raise KeyError or crash."""
        card = server.build_fast_home_index_quote_card("FINNIFTY", market_strip=[])
        self.assertEqual(card.get("symbol"), "FINNIFTY")
        self.assertIn("spot", card)
        self.assertIn("future", card)

    def test_get_intraday_history_snapshot_extracts_last_session(self):
        """When given synthetic multi-session candles, extracts latest session and prev close."""
        synthetic_candles = [
            # Day 1: 2026-11-19
            {"ts": 1795059900, "open": 100.0, "high": 105.0, "low": 98.0, "close": 102.0, "volume": 500},
            {"ts": 1795082400, "open": 102.0, "high": 106.0, "low": 101.0, "close": 104.0, "volume": 600},
            # Day 2: 2026-11-20
            {"ts": 1795146300, "open": 105.0, "high": 110.0, "low": 104.0, "close": 108.0, "volume": 700},
            {"ts": 1795168800, "open": 108.0, "high": 112.0, "low": 107.0, "close": 110.0, "volume": 800},
        ]
        with patch.object(server, "fetch_fyers_history", return_value={"ok": True, "candles": synthetic_candles}):
            snap = server.get_intraday_history_snapshot("TEST_SYM")
            self.assertEqual(snap.get("ltp"), 110.0)
            self.assertEqual(snap.get("todayOpen"), 105.0)
            self.assertEqual(snap.get("high"), 112.0)
            self.assertEqual(snap.get("low"), 104.0)
            self.assertEqual(snap.get("prev_close"), 104.0)
            self.assertEqual(snap.get("change"), 6.0)
            self.assertEqual(snap.get("change_pct"), 5.77)

    def test_home_index_quotes_payload_contains_all_six_indices(self):
        """home_index_quotes route must return quote cards for all 6 indices."""
        client = server.app.test_client()
        server._CACHE.pop("home_index_quotes", None)

        mock_snap = {
            "ltp": 25000.0,
            "todayOpen": 24900.0,
            "high": 25100.0,
            "low": 24850.0,
            "prev_close": 24800.0,
            "change": 200.0,
            "change_pct": 0.81,
            "vwap": 24950.0,
            "source": "history_5m",
        }
        with patch.object(server, "get_intraday_history_snapshot", return_value=mock_snap):
            resp = client.get("/api/home-index-quotes")
            self.assertEqual(resp.status_code, 200)
            data = resp.get_json()
            indices = data.get("indices", {})
            for expected in ["NIFTY", "BANKNIFTY", "SENSEX", "FINNIFTY", "MIDCPNIFTY", "BANKEX"]:
                self.assertIn(expected, indices, f"Missing index {expected} from home_index_quotes")
                self.assertIsNotNone(indices[expected].get("spot", {}).get("ltp"))


if __name__ == "__main__":
    unittest.main()
