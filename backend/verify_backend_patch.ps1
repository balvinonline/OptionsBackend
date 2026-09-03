param(
    [string]$BaseUrl = "https://optionsbackend.onrender.com",
    [string]$Symbol = "SENSEX"
)

$ErrorActionPreference = "Stop"
$BaseUrl = $BaseUrl.TrimEnd('/')
$Symbol = $Symbol.ToUpper()

Write-Host "1) Expiry catalog: $Symbol"
$exp = Invoke-RestMethod "$BaseUrl/api/option-expiries?symbol=$Symbol"
$exp | Select-Object symbol, selectedExpiry, selectedExpiryTimestamp, dte
Write-Host "Expiries:" ($exp.expiries -join ", ")

Write-Host "`n2) Current option chain"
$oc = Invoke-RestMethod "$BaseUrl/api/option-chain?symbol=$Symbol"
$oc | Select-Object symbol, selectedExpiry, dte, referencePrice, referenceSource, signalCalculatedAt
Write-Host "Spot LTP:" $oc.spot.ltp
Write-Host "Future LTP:" $oc.future.ltp
Write-Host "Breakout reference:" $oc.analytics.breakoutBreakdown.referencePrice
Write-Host "Structure:" $oc.analytics.breakoutBreakdown.signal
Write-Host "Trade zone:" $oc.analytics.tradeZones.zone $oc.analytics.tradeZones.side

if ($oc.expiries.Count -gt 1) {
    $next = $oc.expiries[1]
    Write-Host "`n3) Next expiry: $next"
    $oc2 = Invoke-RestMethod "$BaseUrl/api/option-chain?symbol=$Symbol&expiry=$next"
    $oc2 | Select-Object symbol, selectedExpiry, dte, referencePrice, referenceSource
    $oc2.data | Select-Object -First 3 strike, expiry, expiryTimestamp, ce_symbol, pe_symbol
} else {
    Write-Host "`n3) No second expiry was returned by FYERS."
}
