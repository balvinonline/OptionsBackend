import re

jsx_file = "src/ProfessionalDashboard.jsx"
with open(jsx_file, "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace("setPcrHistoryModal(true)", "openPcrDetail(\"ALL\")")

bad_consts = """              const writerShift = getWriterShiftSignal(setup);
              const levelShift = getLevelShiftSignal(optionSignalHistory, row.symbol, row.levels, setup.analytics || row.analytics || {});
              const readiness = getTradeReadiness({ setup, displayOption, pcrTrack, optionTrack });
              const signalStep = Math.min(3, Math.max(1, asNum(signalMeta?.count, 0) || 1));
              const actionKey = getFastActionKey(row, displayOption, plan);
              const actionMark = fastActionMarks?.[actionKey];
              const actionLabel = actionMark?.status === "TAKEN" ? "Taken" : actionMark?.status === "SKIPPED" ? "Skipped" : "Pending";
              const decisionText = setup?.noTradeGate?.blocked ? "AVOID" : readiness?.tone === "success" ? "READY" : setup?.priceOverride?.active ? "SCALP" : "WAIT";
              const displayDecisionText = decisionText === "READY" || decisionText === "SCALP" ? "TAKE ENTRY" : decisionText;
              const tagStyles = {
                AVOID: { background: "#ff4d4f", color: "#fff", fontWeight: "bold", border: "none" },
                WAIT: { background: "#faad14", color: "#000", fontWeight: "bold", border: "none" },
                READY: { background: "#52c41a", color: "#fff", fontWeight: "bold", border: "none" },
                SCALP: { background: "#52c41a", color: "#fff", fontWeight: "bold", border: "none" }
              };
              const decisionStyle = tagStyles[decisionText] || {};
              const copySignal = (event) => {
                event?.stopPropagation?.();
                const text = `BUY ${row.symbol} ${formatPrice(displayOption?.strike)} ${displayOption?.side || ""} @ ${formatPremium(plan.entry)} | SL ${formatPremium(plan.stoploss)} | TGT ${formatPremium(plan.target)}`;
                navigator.clipboard?.writeText(text);
                notification.success({ message: "Signal copied", duration: 2 });
              };"""

good_consts = """              const readiness = getTradeReadiness({ setup, displayOption, pcrTrack, optionTrack });
              const signalStep = Math.min(3, Math.max(1, asNum(signalMeta?.count, 0) || 1));
              const pcrCard = getPcrCardState(pcrTrack, displayOption?.side);
              const openDetail = (event, focus = "Signal") => {
                event?.stopPropagation?.();
                onOpen?.(row.symbol, "signal", focus);
              };"""

if bad_consts in content:
    content = content.replace(bad_consts, good_consts)
else:
    print("WARNING: bad_consts not found")
    
with open(jsx_file, "w", encoding="utf-8") as f:
    f.write(content)
print("Fix 5 applied.")
