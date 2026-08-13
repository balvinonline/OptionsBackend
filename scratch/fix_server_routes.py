with open('backend/server.py', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix the stray dashboard and index routes placed inside fyers_history / fyers_quote
old_fyers_block = """    return jsonify(fetch_fyers_history(history_symbol, resolution=resolution, lookback_minutes=lookback))


@app.route("/api/dashboard")
def dashboard():
    symbol = (request.args.get("symbol") or request.args.get("index") or "NIFTY").strip().upper()
    if symbol not in INDEX_MAP:
        symbol = "NIFTY"

    try:
        data = build_dashboard(symbol)
        return jsonify(data)
    except Exception as e:
        print("dashboard error:", e)
        return jsonify({
            "error": str(e),
            "symbol": symbol,
            "timestamp": datetime.now().strftime("%d-%m-%Y %H:%M:%S")
        }), 500


@app.route("/api/index/<symbol>")
def api_index_legacy(symbol):
    sym = (symbol or "NIFTY").strip().upper()
    if sym not in INDEX_MAP:
        sym = "NIFTY"
    try:
        data = build_dashboard(sym)
        return jsonify(data)
    except Exception as e:
        print("index legacy error:", e)
        return jsonify({
            "error": str(e),
            "symbol": sym,
            "timestamp": datetime.now().strftime("%d-%m-%Y %H:%M:%S")
        }), 500


@app.route("/api/option-chain")
def option_chain():
    symbol = (request.args.get("symbol") or request.args.get("index") or "NIFTY").strip().upper()
    if symbol not in INDEX_MAP:
        symbol = "NIFTY"

    raw_symbol = sanitize_fyers_history_symbol(request.args.get("rawSymbol", ""))"""

clean_fyers_block = """    return jsonify(fetch_fyers_history(history_symbol, resolution=resolution, lookback_minutes=lookback))


@app.route("/api/fyers/quote")
def fyers_quote():
    symbol = request.args.get("symbol", "NIFTY").strip().upper()
    if symbol not in INDEX_MAP:
        symbol = "NIFTY"

    raw_symbol = sanitize_fyers_history_symbol(request.args.get("rawSymbol", ""))"""

if old_fyers_block in content:
    content = content.replace(old_fyers_block, clean_fyers_block)
    print("Cleaned up fyers block")
else:
    print("Warning: old_fyers_block not found directly")

# Fix the dashboard empty route at the bottom
old_bottom_block = """@app.route("/api/dashboard")
def dashboard():


@app.route("/api/option-chain")
def option_chain():
    symbol = request.args.get("symbol", "NIFTY").strip().upper()
    if symbol not in INDEX_MAP:
        symbol = "NIFTY\""""

clean_bottom_block = """@app.route("/api/dashboard")
def dashboard():
    symbol = (request.args.get("symbol") or request.args.get("index") or "NIFTY").strip().upper()
    if symbol not in INDEX_MAP:
        symbol = "NIFTY"

    try:
        data = build_dashboard(symbol)
        return jsonify(data)
    except Exception as e:
        print("dashboard error:", e)
        return jsonify({
            "error": str(e),
            "symbol": symbol,
            "timestamp": datetime.now().strftime("%d-%m-%Y %H:%M:%S")
        }), 500


@app.route("/api/index/<symbol>")
def api_index_legacy(symbol):
    sym = (symbol or "NIFTY").strip().upper()
    if sym not in INDEX_MAP:
        sym = "NIFTY"
    try:
        data = build_dashboard(sym)
        return jsonify(data)
    except Exception as e:
        print("index legacy error:", e)
        return jsonify({
            "error": str(e),
            "symbol": sym,
            "timestamp": datetime.now().strftime("%d-%m-%Y %H:%M:%S")
        }), 500


@app.route("/api/option-chain")
def option_chain():
    symbol = (request.args.get("symbol") or request.args.get("index") or "NIFTY").strip().upper()
    if symbol not in INDEX_MAP:
        symbol = "NIFTY\""""

if old_bottom_block in content:
    content = content.replace(old_bottom_block, clean_bottom_block)
    print("Cleaned up bottom dashboard block")
else:
    print("Warning: old_bottom_block not found directly")

with open('backend/server.py', 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated backend/server.py")
