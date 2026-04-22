$path = 'c:\Users\Castel Technologies\Videos\ProfithubApril21\profithubapril-master\src\pages\smart-trading\components\signal-centre-tab.tsx'
$lines = Get-Content $path
$stack = @()
$lineNum = 0

foreach ($line in $lines) {
    $lineNum++
    $opens = [regex]::Matches($line, "<div(?![^>]*/>)")
    foreach ($o in $opens) {
        $stack += "${lineNum}: $line"
    }
    
    $closes = [regex]::Matches($line, "</div>")
    foreach ($c in $closes) {
        if ($stack.Count -gt 0) {
            $stack = $stack[0..($stack.Count-2)]
        } else {
            Write-Output "Extra </div> at line ${lineNum}: $line"
        }
    }
}

Write-Output "Remaining unclosed divs:"
if ($stack.Count -eq 0) {
    Write-Output "None"
} else {
    foreach ($item in $stack) {
        Write-Output $item
    }
}
