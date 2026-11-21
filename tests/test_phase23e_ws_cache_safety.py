"""
MarketMantra - Phase 23E WebSocket Cache Safety Regression Tests
Comprehensive tests verifying:
1. Inactive entries evicted when capacity is exceeded in _FYERS_WS_TICKS.
2. Active subscribed symbols survive capacity-based eviction in _FYERS_WS_TICKS.
3. Active symbols survive even when their count alone exceeds capacity in _FYERS_WS_TICKS.
4. Inactive entries evicted when capacity is exceeded in _PREV_TICK_VOLUMES.
5. Active subscribed symbols survive capacity-based eviction in _PREV_TICK_VOLUMES.
6. Active symbols survive even when their count alone exceeds capacity in _PREV_TICK_VOLUMES.
7. Original and normalized symbol representations protected in both caches.
8. Warning logging is throttled (60s) and does not flood logs.
9. Existing cache behaviour and whale tracker remain compatible.
10. Independent locking with zero deadlocks under concurrent operations.
"""

import unittest
import time
import io
import sys
import os
import threading
from unittest.mock import patch

# Ensure paths can import backend modules
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend')))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import server


class TestPhase23EWsCacheSafety(unittest.TestCase):

    def setUp(self):
        with server._FYERS_WS_LOCK:
            server._FYERS_WS_TICKS.clear()
            server._PREV_TICK_VOLUMES.clear()
            server._FYERS_WS_SYMBOLS.clear()
            server._LAST_FYERS_WS_TICKS_CAPACITY_WARN = 0.0
            server._LAST_PREV_TICK_VOLUMES_CAPACITY_WARN = 0.0

    def tearDown(self):
        with server._FYERS_WS_LOCK:
            server._FYERS_WS_TICKS.clear()
            server._PREV_TICK_VOLUMES.clear()
            server._FYERS_WS_SYMBOLS.clear()

    # =========================================================================
    # SUITE 1: FYERS WebSocket Tick Cache Tests (1, 2, 3)
    # =========================================================================

    def test_01_fyers_ws_ticks_inactive_evicted_when_capacity_exceeded(self):
        """1. Inactive entries are evicted when capacity is exceeded in _FYERS_WS_TICKS."""
        with server._FYERS_WS_LOCK:
            # Set up 2,200 inactive symbols (no active symbols)
            now = time.time()
            for i in range(2200):
                sym = f"NSE:INACTIVE_TICK_{i}"
                server._FYERS_WS_TICKS[sym] = {"symbol": sym, "ltp": 100.0 + i, "ts": now - (2200 - i)}

            self.assertEqual(len(server._FYERS_WS_TICKS), 2200)

            # Prune
            server._prune_fyers_ws_ticks_locked()

            # Capacity should be enforced to FYERS_WS_TICKS_MAX_KEYS (2000) or lower (all inactive)
            # In Phase 1, all inactive entries are removed
            self.assertEqual(len(server._FYERS_WS_TICKS), 0)

    def test_02_fyers_ws_ticks_active_survive_capacity_eviction(self):
        """2. Active subscribed symbols survive capacity-based eviction in _FYERS_WS_TICKS."""
        with server._FYERS_WS_LOCK:
            # 500 active symbols
            active_symbols = [f"NSE:ACTIVE_TICK_{i}" for i in range(500)]
            server._FYERS_WS_SYMBOLS.update(active_symbols)

            now = time.time()
            # Populate active ticks (older timestamps)
            for sym in active_symbols:
                server._FYERS_WS_TICKS[sym] = {"symbol": sym, "ltp": 250.0, "ts": now - 300}

            # Populate 2,000 inactive ticks (newer timestamps)
            for i in range(2000):
                sym = f"NSE:INACTIVE_TICK_{i}"
                server._FYERS_WS_TICKS[sym] = {"symbol": sym, "ltp": 50.0, "ts": now}

            self.assertEqual(len(server._FYERS_WS_TICKS), 2500)

            # Prune
            server._prune_fyers_ws_ticks_locked()

            # Verify that 100% of active subscribed symbols survive
            for sym in active_symbols:
                self.assertIn(sym, server._FYERS_WS_TICKS, f"Active symbol {sym} was evicted!")

            # Verify all inactive entries were evicted
            for i in range(2000):
                self.assertNotIn(f"NSE:INACTIVE_TICK_{i}", server._FYERS_WS_TICKS)

            self.assertEqual(len(server._FYERS_WS_TICKS), 500)

    def test_03_fyers_ws_ticks_active_survive_when_count_exceeds_capacity(self):
        """3. Active symbols survive even when their count alone exceeds capacity."""
        with server._FYERS_WS_LOCK:
            orig_max = server.FYERS_WS_TICKS_MAX_KEYS
            try:
                # Set small capacity limit for test
                server.FYERS_WS_TICKS_MAX_KEYS = 20

                # Create 30 active subscribed symbols (exceeding capacity of 20)
                active_symbols = [f"NSE:HEAVY_ACTIVE_{i}" for i in range(30)]
                server._FYERS_WS_SYMBOLS.update(active_symbols)

                now = time.time()
                for sym in active_symbols:
                    server._FYERS_WS_TICKS[sym] = {"symbol": sym, "ltp": 100.0, "ts": now}

                # Also add 10 inactive symbols (total 40 items)
                for i in range(10):
                    sym = f"NSE:EXTRA_INACTIVE_{i}"
                    server._FYERS_WS_TICKS[sym] = {"symbol": sym, "ltp": 10.0, "ts": now}

                self.assertEqual(len(server._FYERS_WS_TICKS), 40)

                # Capture warning log
                captured_out = io.StringIO()
                with patch('sys.stdout', captured_out):
                    server._prune_fyers_ws_ticks_locked()

                # Verify: ALL 30 active symbols MUST survive! None evicted!
                for sym in active_symbols:
                    self.assertIn(sym, server._FYERS_WS_TICKS, f"Active symbol {sym} was evicted!")

                # Verify: Inactive symbols MUST be evicted
                for i in range(10):
                    self.assertNotIn(f"NSE:EXTRA_INACTIVE_{i}", server._FYERS_WS_TICKS)

                # Total items remaining should be exactly 30 (all active preserved)
                self.assertEqual(len(server._FYERS_WS_TICKS), 30)

                # Warning output must report capacity exceeded and preserving all active
                log_text = captured_out.getvalue()
                self.assertIn("[FyersWsTicks]", log_text)
                self.assertIn("exceed configured capacity", log_text)
                self.assertIn("Preserving all active symbols", log_text)

            finally:
                server.FYERS_WS_TICKS_MAX_KEYS = orig_max

    # =========================================================================
    # SUITE 2: Previous Tick Volume Cache Tests (4, 5, 6)
    # =========================================================================

    def test_04_prev_tick_volumes_inactive_evicted_when_capacity_exceeded(self):
        """4. Inactive entries are evicted when capacity is exceeded in _PREV_TICK_VOLUMES."""
        with server._FYERS_WS_LOCK:
            # Add 1,800 inactive volume entries
            for i in range(1800):
                sym = f"NSE:INACTIVE_VOL_{i}CE"
                server._PREV_TICK_VOLUMES[sym] = 1000.0 + i

            self.assertEqual(len(server._PREV_TICK_VOLUMES), 1800)

            # Prune
            server._prune_prev_tick_volumes_locked()

            # All inactive entries removed
            self.assertEqual(len(server._PREV_TICK_VOLUMES), 0)

    def test_05_prev_tick_volumes_active_survive_capacity_eviction(self):
        """5. Active subscribed symbols survive capacity-based eviction in _PREV_TICK_VOLUMES."""
        with server._FYERS_WS_LOCK:
            # 600 active symbols
            active_symbols = [f"NSE:ACTIVE_VOL_{i}CE" for i in range(600)]
            server._FYERS_WS_SYMBOLS.update(active_symbols)

            # Populate active volumes
            for sym in active_symbols:
                server._PREV_TICK_VOLUMES[sym] = 50000.0

            # Populate 1,200 inactive volumes (total 1,800 > 1,500)
            for i in range(1200):
                sym = f"NSE:INACTIVE_VOL_{i}PE"
                server._PREV_TICK_VOLUMES[sym] = 10000.0

            self.assertEqual(len(server._PREV_TICK_VOLUMES), 1800)

            # Prune
            server._prune_prev_tick_volumes_locked()

            # Verify that 100% of active symbols survive
            for sym in active_symbols:
                self.assertIn(sym, server._PREV_TICK_VOLUMES, f"Active volume tracking for {sym} was evicted!")

            # Verify inactive entries are evicted
            for i in range(1200):
                self.assertNotIn(f"NSE:INACTIVE_VOL_{i}PE", server._PREV_TICK_VOLUMES)

            self.assertEqual(len(server._PREV_TICK_VOLUMES), 600)

    def test_06_prev_tick_volumes_active_survive_when_count_exceeds_capacity(self):
        """6. Active symbols survive even when their count alone exceeds capacity in _PREV_TICK_VOLUMES."""
        with server._FYERS_WS_LOCK:
            orig_max = server.PREV_TICK_VOLUMES_MAX_KEYS
            try:
                # Set small capacity limit for test
                server.PREV_TICK_VOLUMES_MAX_KEYS = 15

                # 25 active symbols (exceeding capacity of 15)
                active_symbols = [f"NSE:HEAVY_VOL_{i}CE" for i in range(25)]
                server._FYERS_WS_SYMBOLS.update(active_symbols)

                for sym in active_symbols:
                    server._PREV_TICK_VOLUMES[sym] = 25000.0

                # 10 inactive symbols (total 35)
                for i in range(10):
                    sym = f"NSE:EXTRA_VOL_{i}PE"
                    server._PREV_TICK_VOLUMES[sym] = 5000.0

                self.assertEqual(len(server._PREV_TICK_VOLUMES), 35)

                captured_out = io.StringIO()
                with patch('sys.stdout', captured_out):
                    server._prune_prev_tick_volumes_locked()

                # Verify: ALL 25 active symbols survive! None evicted!
                for sym in active_symbols:
                    self.assertIn(sym, server._PREV_TICK_VOLUMES, f"Active volume tracking for {sym} was evicted!")

                # Verify: Inactive symbols evicted
                for i in range(10):
                    self.assertNotIn(f"NSE:EXTRA_VOL_{i}PE", server._PREV_TICK_VOLUMES)

                self.assertEqual(len(server._PREV_TICK_VOLUMES), 25)

                log_text = captured_out.getvalue()
                self.assertIn("[PrevTickVolumes]", log_text)
                self.assertIn("exceed configured capacity", log_text)
                self.assertIn("Preserving all active tracking", log_text)

            finally:
                server.PREV_TICK_VOLUMES_MAX_KEYS = orig_max

    # =========================================================================
    # SUITE 3: Symbol Normalization & Warning Throttling (7, 8)
    # =========================================================================

    def test_07_original_and_normalized_symbol_representations_protected(self):
        """7. Original and normalized symbol representations are protected where applicable."""
        with server._FYERS_WS_LOCK:
            raw_sym = "nse:nifty26nov25000ce"
            norm_sym = server.normalize_symbol_key(raw_sym)  # "NSE:NIFTY26NOV25000CE"

            # Register raw symbol in active set
            server._FYERS_WS_SYMBOLS.add(raw_sym)

            # Store both forms in ticks and volume caches
            server._FYERS_WS_TICKS[raw_sym] = {"symbol": raw_sym, "ltp": 400.0, "ts": time.time()}
            server._FYERS_WS_TICKS[norm_sym] = {"symbol": norm_sym, "ltp": 400.0, "ts": time.time()}
            server._PREV_TICK_VOLUMES[raw_sym] = 12000.0
            server._PREV_TICK_VOLUMES[norm_sym] = 12000.0

            # Add inactive keys to force over capacity
            orig_ticks_max = server.FYERS_WS_TICKS_MAX_KEYS
            orig_vols_max = server.PREV_TICK_VOLUMES_MAX_KEYS
            try:
                server.FYERS_WS_TICKS_MAX_KEYS = 1
                server.PREV_TICK_VOLUMES_MAX_KEYS = 1

                server._prune_fyers_ws_ticks_locked()
                server._prune_prev_tick_volumes_locked()

                # Both raw and normalized representations MUST be retained
                self.assertIn(raw_sym, server._FYERS_WS_TICKS)
                self.assertIn(norm_sym, server._FYERS_WS_TICKS)
                self.assertIn(raw_sym, server._PREV_TICK_VOLUMES)
                self.assertIn(norm_sym, server._PREV_TICK_VOLUMES)

            finally:
                server.FYERS_WS_TICKS_MAX_KEYS = orig_ticks_max
                server.PREV_TICK_VOLUMES_MAX_KEYS = orig_vols_max

    def test_08_warning_logging_throttled_across_rapid_calls(self):
        """8. Warning logging is throttled (60s) and does not flood logs."""
        with server._FYERS_WS_LOCK:
            orig_max = server.FYERS_WS_TICKS_MAX_KEYS
            try:
                server.FYERS_WS_TICKS_MAX_KEYS = 5

                # 10 active symbols
                active_symbols = [f"NSE:ACTIVE_{i}" for i in range(10)]
                server._FYERS_WS_SYMBOLS.update(active_symbols)
                for sym in active_symbols:
                    server._FYERS_WS_TICKS[sym] = {"symbol": sym, "ltp": 100.0, "ts": time.time()}

                # Call pruning 20 times consecutively in rapid succession
                captured_out = io.StringIO()
                with patch('sys.stdout', captured_out):
                    for _ in range(20):
                        server._prune_fyers_ws_ticks_locked()

                output = captured_out.getvalue()
                # Count occurrences of warning log
                warn_count = output.count("[FyersWsTicks]")
                # Must be logged exactly once due to 60.0s cooldown
                self.assertEqual(warn_count, 1, f"Expected warning throttled to 1 occurrence, got {warn_count}")

            finally:
                server.FYERS_WS_TICKS_MAX_KEYS = orig_max

    # =========================================================================
    # SUITE 4: Compatibility & Deadlock Freedom (9, 10)
    # =========================================================================

    def test_09_whale_spike_detection_and_on_fyers_ws_message_compatibility(self):
        """9. Whale tracker and on_fyers_ws_message remain fully functional with pruning."""
        symbol = "NSE:NIFTY26NOV25000CE"
        alerts = []

        def mock_emit(evt, payload, *args, **kwargs):
            if evt == "oi_spike_alert":
                alerts.append(payload)

        orig_emit = server.socketio.emit
        try:
            server.socketio.emit = mock_emit
            # Subscribe symbol
            with server._FYERS_WS_LOCK:
                server._FYERS_WS_SYMBOLS.add(symbol)

            # Step 1: Initial volume 20,000
            server.on_fyers_ws_message({"symbol": symbol, "ltp": 400.0, "vol_traded_today": 20000})
            with server._FYERS_WS_LOCK:
                self.assertEqual(server._PREV_TICK_VOLUMES.get(symbol), 20000.0)
            self.assertEqual(len(alerts), 0)

            # Step 2: Jump by 80,000 (20k -> 100k, > 50k threshold)
            server.on_fyers_ws_message({"symbol": symbol, "ltp": 410.0, "vol_traded_today": 100000})
            with server._FYERS_WS_LOCK:
                self.assertEqual(server._PREV_TICK_VOLUMES.get(symbol), 100000.0)
            self.assertEqual(len(alerts), 1)
            self.assertEqual(alerts[0]["value"], 80000.0)
            self.assertEqual(alerts[0]["type"], "VOLUME_SPIKE")

        finally:
            server.socketio.emit = orig_emit

    def test_10_deadlock_freedom_under_concurrent_tick_and_quote_processing(self):
        """10. Independent locking with zero deadlocks under concurrent operations."""
        symbols = [f"NSE:CONC_{i}CE" for i in range(50)]
        with server._FYERS_WS_LOCK:
            server._FYERS_WS_SYMBOLS.update(symbols)

        errors = []
        stop_event = threading.Event()

        def ws_worker():
            try:
                for i in range(100):
                    if stop_event.is_set():
                        break
                    sym = symbols[i % len(symbols)]
                    server.on_fyers_ws_message({"symbol": sym, "ltp": 100.0 + i, "vol_traded_today": 1000 * i})
            except Exception as e:
                errors.append(e)

        def quote_worker():
            try:
                for i in range(100):
                    if stop_event.is_set():
                        break
                    sym = symbols[i % len(symbols)]
                    server.cache_quote_block(sym, {"symbol": sym, "lp": 100.0 + i, "ch": 1.0})
                    _ = server.get_cached_quote_block(sym)
            except Exception as e:
                errors.append(e)

        threads = [
            threading.Thread(target=ws_worker) for _ in range(5)
        ] + [
            threading.Thread(target=quote_worker) for _ in range(5)
        ]

        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=10.0)
            if t.is_alive():
                stop_event.set()
                self.fail("Deadlock detected during concurrent WebSocket and quote cache processing!")

        self.assertEqual(errors, [], f"Encountered thread errors: {errors}")


if __name__ == "__main__":
    unittest.main()
