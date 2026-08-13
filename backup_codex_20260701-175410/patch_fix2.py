import re

jsx_file = "src/ProfessionalDashboard.jsx"
with open(jsx_file, "r", encoding="utf-8") as f:
    content = f.read()

# The leftover is right after copySignal:
#              };
#
#              
#                  ))}
#                </div>

leftover_pattern = r'(\s*\}\);\s*\n\s*\}\)\}\s*</div>)'

if re.search(leftover_pattern, content):
    content = re.sub(leftover_pattern, r'\n              };\n', content, count=1)
else:
    print("WARNING: Could not find leftover pattern")

# Let's be safe and search for the exact block around copySignal:
bad_block = """              const copySignal = (event) => {
                event?.stopPropagation?.();
                const text = `BUY ${row.symbol} ${formatPrice(displayOption?.strike)} ${displayOption?.side || ""} @ ${formatPremium(plan.entry)} | SL ${formatPremium(plan.stoploss)} | TGT ${formatPremium(plan.target)}`;
                navigator.clipboard?.writeText(text);
                notification.success({ message: "Signal copied", duration: 2 });
              };

              
                  ))}
                </div>
              </div>
            );
          })}"""

good_block = """              const copySignal = (event) => {
                event?.stopPropagation?.();
                const text = `BUY ${row.symbol} ${formatPrice(displayOption?.strike)} ${displayOption?.side || ""} @ ${formatPremium(plan.entry)} | SL ${formatPremium(plan.stoploss)} | TGT ${formatPremium(plan.target)}`;
                navigator.clipboard?.writeText(text);
                notification.success({ message: "Signal copied", duration: 2 });
              };
              
              return (
                  <div className="fast-action-wrapper" key={`fast-${row.symbol}`} style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
                  <div className={`fast-action-card ${tone}`}>
                    <div className="fast-action-head">
                      <div className="fast-price-block">
                        <div className="metric-label" style={{ display: 'flex', alignItems: 'center' }}>
                          {row.rank ? `#${row.rank} ` : ""}{row.label}
                          <Sparkline tone={tone} data={row.sparklineData} symbol={row.symbol} resolution={sparklineRes} />
                        </div>
                        <div className={`index-price price-tone ${toneBySign(row.changePct ?? row.change)}`}>{formatPrice(row.price)}</div>
                        <div className="index-change"><ChangeText change={row.change} changePct={row.changePct} price={row.price} /></div>
                        <div className="index-sr-levels" style={{ marginTop: '4px', fontSize: '11px', color: '#526177' }}>
                          <div style={{ display: 'flex', gap: '4px' }}><span>S:</span><b style={{ color: '#52c41a' }}>{formatLevelList(row.levels?.supports)}</b></div>
                          <div style={{ display: 'flex', gap: '4px' }}><span>R:</span><b style={{ color: '#ff4d4f' }}>{formatLevelList(row.levels?.resistances)}</b></div>
                        </div>
                      </div>
                      <div className="fast-score-block">
                        <div className="metric-label">Command</div>
                        <div className={`score-value ${tone}`}>
                          {setup?.trigger?.invalidated ? "Invalid" : row.command}
                        </div>
                        <div className="score-sub">{readiness.label}</div>
                      </div>
                    </div>
                    
                    <div className="fast-action-body">
                      <div className="metric-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                        <div className={`clickable-card pcr-signal-card ${pcrCard.tone}`} onClick={(event) => openDetail(event, "PCR")}>
                          <span>PCR Track</span>
                          <b className="actionable-number">{pcrCard.label}</b>
                        </div>
                        <div className="clickable-card signal-sequence-card" onClick={(event) => openDetail(event, "Signal Count")}>
                          <span>Flow</span>
                          <b className="actionable-number">{signalStep}/3</b>
                        </div>
                        <div className="clickable-card" onClick={(event) => openDetail(event, "Option Volume")}>
                          <span>Vol</span>
                          <b className="actionable-number">{formatNum(displayOption?.volume, 0)}</b>
                        </div>
                        <div className="clickable-card" onClick={(event) => openDetail(event, "Option OI Change")}>
                          <span>OI Change</span>
                          <b className="actionable-number" style={{ color: displayOption?.oiChange > 0 ? '#52c41a' : '#ff4d4f' }}>{formatInt(displayOption?.oiChange)}</b>
                        </div>
                      </div>
                      
                      <div className="mini-plan-grid" style={{ gridTemplateColumns: '1.5fr 1fr 1fr 1fr 1fr', alignItems: 'center' }}>
                        <div className="clickable-card" onClick={(event) => openDetail(event, "Signal")}>
                          <span style={{ display: 'flex', justifyContent: 'space-between' }}>
                            Contract
                            <CopyOutlined 
                              onClick={(e) => { 
                                e.stopPropagation(); 
                                navigator.clipboard.writeText(`BUY ${row.symbol} ${displayOption?.strike} ${displayOption?.side} @ ${plan.entry} | SL: ${plan.stoploss} | Tgt: ${plan.target}`); 
                                notification.success({message: 'Signal Copied!', duration: 2});
                              }} 
                              style={{ color: '#1890ff', cursor: 'pointer' }}
                              title="Copy Signal"
                            />
                          </span>
                          <b className="actionable-number">{displayOption ? `${formatPrice(displayOption.strike)} ${displayOption.side}` : "No Strike"}</b>
                        </div>
                        <div className="clickable-card" onClick={(event) => openDetail(event, "Signal")}><span>Entry</span><b className="actionable-number">{formatPremium(plan.entry)}</b></div>
                        <div className="clickable-card" onClick={(event) => openDetail(event, "Target")}><span>Target</span><b className="actionable-number">{formatPremium(plan.target)}</b></div>
                        <div className="clickable-card" onClick={(event) => openDetail(event, "Stop Loss")}><span>SL</span><b className="actionable-number">{formatPremium(plan.stoploss)}</b></div>
                        <div className="clickable-card" onClick={(event) => openDetail(event, "Risk Reward")}><span>R:R</span><b className="actionable-number">{formatNum(plan.riskReward, 2)}</b></div>
                      </div>
                    </div>
                  </div>
                  </div>
              );
            })}"""

if bad_block in content:
    content = content.replace(bad_block, good_block)
else:
    print("WARNING: Could not find exact bad block")


with open(jsx_file, "w", encoding="utf-8") as f:
    f.write(content)

print("Applied fix 2")
