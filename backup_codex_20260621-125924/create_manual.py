from docx import Document
from docx.shared import Pt, RGBColor, Inches
from docx.enum.text import WD_ALIGN_PARAGRAPH

doc = Document()

# Title
title = doc.add_heading('Trading Dashboard User Manual: Setup Check Modal', 0)
title.alignment = WD_ALIGN_PARAGRAPH.CENTER

doc.add_paragraph(
    "This document explains how to read and interpret the 'Setup Check' modal in your trading dashboard. "
    "The Setup Check modal acts as a pre-trade checklist, summarizing all conditions to ensure you "
    "are taking a high-probability trade."
)

# 1. Header Information
doc.add_heading('1. Header Information', level=1)
doc.add_paragraph("The top section provides a high-level summary of the trade signal.")
ul = doc.add_paragraph(style='List Bullet')
ul.add_run("Signal (e.g., 73,900 PE): ").bold = True
ul.add_run("The recommended strike price and option type (Call or Put).")
ul = doc.add_paragraph(style='List Bullet')
ul.add_run("Score: ").bold = True
ul.add_run("A numerical score out of 100 rating the overall quality of the setup.")
ul = doc.add_paragraph(style='List Bullet')
ul.add_run("Plan: ").bold = True
ul.add_run("Provides the suggested Entry Price / Target Price / Stop Loss levels.")

# 2. Summary Cards
doc.add_heading('2. Summary Cards', level=1)
doc.add_paragraph("These three cards give you the ultimate 'Go' or 'No-Go' decision.")
ul = doc.add_paragraph(style='List Bullet')
ul.add_run("Final Gate: ").bold = True
ul.add_run("The final verdict (e.g., AVOID, ENTER). It aggregates all conditions to give a definitive answer.")
ul = doc.add_paragraph(style='List Bullet')
ul.add_run("Professional: ").bold = True
ul.add_run("An assessment from a professional trader's algorithmic perspective.")
ul = doc.add_paragraph(style='List Bullet')
ul.add_run("Trade Reason: ").bold = True
ul.add_run("A quick summary text explaining exactly why the trade is being recommended or avoided (e.g., 'Avoid: VWAP conflict, Stale candle data').")

# 3. Primary Blockers & Risks
doc.add_heading('3. Primary Blockers & Risks', level=1)
doc.add_paragraph("These are the critical conditions that can immediately block a trade if they are unfavorable.")
ul = doc.add_paragraph(style='List Bullet')
ul.add_run("Session: ").bold = True
ul.add_run("Checks if the market time is safe for trading. It will block trades during the first 5 minutes (9:15-9:20) and near market close (after 15:15) due to high volatility and lack of fresh setups.")
ul = doc.add_paragraph(style='List Bullet')
ul.add_run("Entry Timing: ").bold = True
ul.add_run("Aggregates micro-factors like 5m candle, gap, volume, and spread.")
ul = doc.add_paragraph(style='List Bullet')
ul.add_run("Event Risk: ").bold = True
ul.add_run("Warns if there is a major news event or macro data release that could cause unpredictable spikes.")
ul = doc.add_paragraph(style='List Bullet')
ul.add_run("F&O Breadth: ").bold = True
ul.add_run("Analyzes the broader Futures and Options market activity to see if it supports the trade direction.")
ul = doc.add_paragraph(style='List Bullet')
ul.add_run("Heavyweights: ").bold = True
ul.add_run("Checks if the major stocks driving the index (e.g., HDFC Bank, ICICI Bank for BankNifty) are moving in your favor.")
ul = doc.add_paragraph(style='List Bullet')
ul.add_run("Setup Quality: ").bold = True
ul.add_run("A fraction score (e.g., 9/11) showing how many of the core strategy conditions are met.")

# 4. Trend & Momentum Checks
doc.add_heading('4. Trend & Momentum Checks', level=1)
doc.add_paragraph("This section ensures you are trading with the trend across multiple timeframes.")
ul = doc.add_paragraph(style='List Bullet')
ul.add_run("Gap / First 15m: ").bold = True
ul.add_run("Evaluates the morning gap. If it's a 'Gap Wait', it means you should wait for the gap to sustain or the 15-minute high/low to be broken.")
ul = doc.add_paragraph(style='List Bullet')
ul.add_run("Momentum: ").bold = True
ul.add_run("Checks if price action momentum is building up or fading away.")
ul = doc.add_paragraph(style='List Bullet')
ul.add_run("VWAP: ").bold = True
ul.add_run("Checks the index price relative to the Volume Weighted Average Price. Buying Calls below VWAP or Puts above VWAP is generally avoided.")
ul = doc.add_paragraph(style='List Bullet')
ul.add_run("Timeframe Trends (Daily, 60m, 15m, 5m): ").bold = True
ul.add_run("Checks the EMA 20/50 crossovers on different timeframes. Green indicates the trend supports your trade, while Red/Yellow indicates a conflict.")

# 5. Options & Smart Money Data
doc.add_heading('5. Options & Smart Money Data', level=1)
doc.add_paragraph("This analyzes what institutional traders and Option Writers are doing.")
ul = doc.add_paragraph(style='List Bullet')
ul.add_run("Smart Money: ").bold = True
ul.add_run("Tracks heavy Put or Call writing at specific strikes. If Put writers are aggressively adding positions, it acts as strong support.")
ul = doc.add_paragraph(style='List Bullet')
ul.add_run("Premium Mo: ").bold = True
ul.add_run("Checks if the option premium is actually expanding. Flat premium momentum means the option price isn't moving even if the index is.")
ul = doc.add_paragraph(style='List Bullet')
ul.add_run("OI / PCR: ").bold = True
ul.add_run("Put-Call Ratio support. A PCR above 1.0 supports bullish trades, below 1.0 supports bearish trades.")
ul = doc.add_paragraph(style='List Bullet')
ul.add_run("Max Pain Shift: ").bold = True
ul.add_run("Tracks if the Max Pain strike is shifting up or down, indicating the path of least resistance.")

# 6. Execution & Liquidity
doc.add_heading('6. Execution & Liquidity', level=1)
doc.add_paragraph("Ensures you can enter and exit the trade safely without massive slippage.")
ul = doc.add_paragraph(style='List Bullet')
ul.add_run("Volume Spike: ").bold = True
ul.add_run("Checks if the breakout is supported by higher than average trading volume.")
ul = doc.add_paragraph(style='List Bullet')
ul.add_run("Data Freshness: ").bold = True
ul.add_run("Critical check. If data is 'Stale', it means the data feed is delayed or disconnected, and the trade should be avoided.")
ul = doc.add_paragraph(style='List Bullet')
ul.add_run("Bid-Ask Spread: ").bold = True
ul.add_run("Checks the gap between buyers and sellers. A wide spread causes immediate losses (slippage) upon entry.")
ul = doc.add_paragraph(style='List Bullet')
ul.add_run("Trap / S-R: ").bold = True
ul.add_run("Measures distance to the nearest Support or Resistance. If resistance is only 30 points away, the reward might not be worth the risk.")
ul = doc.add_paragraph(style='List Bullet')
ul.add_run("VIX: ").bold = True
ul.add_run("Volatility Index check. If VIX is crashing, option buying is risky due to premium decay (Theta).")

# 7. Raw Option Greeks
doc.add_heading('7. Raw Option Data', level=1)
doc.add_paragraph("Displays the raw option chain data for the selected strike:")
ul = doc.add_paragraph(style='List Bullet')
ul.add_run("PCR: ").bold = True
ul.add_run("Put-Call Ratio.")
ul = doc.add_paragraph(style='List Bullet')
ul.add_run("OI & OI Chg: ").bold = True
ul.add_run("Total Open Interest and the Change in Open Interest today.")
ul = doc.add_paragraph(style='List Bullet')
ul.add_run("IV: ").bold = True
ul.add_run("Implied Volatility.")
ul = doc.add_paragraph(style='List Bullet')
ul.add_run("Delta & Theta: ").bold = True
ul.add_run("Delta shows how much the option moves per 1-point move in the index. Theta shows how much value the option loses every day due to time decay.")

# Color Coding Guide
doc.add_heading('8. Color Coding Guide', level=1)
ul = doc.add_paragraph(style='List Bullet')
ul.add_run("Green / 'OK' / 'Confirmed': ").bold = True
ul.add_run("Condition is fully met and supports the trade.")
ul = doc.add_paragraph(style='List Bullet')
ul.add_run("Yellow / 'Wait' / 'Flat': ").bold = True
ul.add_run("Neutral or caution. Wait for confirmation before entering.")
ul = doc.add_paragraph(style='List Bullet')
ul.add_run("Red / 'Avoid' / 'Stale': ").bold = True
ul.add_run("Danger. A hard blocker preventing the trade.")

doc.save('Setup_Check_User_Manual.docx')
