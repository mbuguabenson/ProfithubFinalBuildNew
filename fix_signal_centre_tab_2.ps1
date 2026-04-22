$path = 'c:\Users\Castel Technologies\Videos\ProfithubApril21\profithubapril-master\src\pages\smart-trading\components\signal-centre-tab.tsx'
$content = Get-Content $path

# Fix missing div at sc-scan-phase
$newContent = @()
$foundPhase = $false
foreach ($line in $content) {
    if ($line -match "SCANNING MARKETS") { $foundPhase = $true }
    if ($foundPhase -and $line -match "</div>" -and $line -match "sc-scan-info") {
        # This is where the missing div should go
        $newContent += "                    </div>"
        $newContent += "                </div>"
        $newContent += "                <div class='sc-scan-info'>Markets scanned: All Continuous Indices (120 ticks each)</div>"
        $foundPhase = $false
        continue
    }
    # Fix corrupted emojis on the fly
    $line = $line -replace "A,??A\?", "Scan"
    $line = $line -replace "A\?\?", "Stop"
    $line = $line -replace "dY\?", "dY"
    
    $newContent += $line
}

$newContent | Set-Content $path -Encoding UTF8
