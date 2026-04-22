$path = 'c:\Users\Castel Technologies\Videos\ProfithubApril21\profithubapril-master\src\pages\smart-trading\components\signal-centre-tab.tsx'
$lines = Get-Content $path
$stack = @()
$lineNum = 0

foreach ($line in $lines) {
    $lineNum++
    # Find only div tags
    $tagMatches = [regex]::Matches($line, "<(/div|div\b)|/>")
    foreach ($match in $tagMatches) {
        $tag = $match.Value
        if ($tag -eq "/>") {
            # This parser is not smart enough for self-closing in-line divs without the tag name
            # But we can assume most divs are not self-closing unless they have the name
        } elseif ($tag -eq "</div>") {
            if ($stack.Count -gt 0 -and $stack[-1] -eq "div") {
                $stack = $stack[0..($stack.Count-2)]
            } else {
                Write-Output "Unexpected </div> at line $lineNum"
            }
        } elseif ($tag.StartsWith("<div")) {
            if ($line -match "<div[^>]*/>") {
                # Skip self-closing
            } else {
                $stack += "div"
            }
        }
    }
}

Write-Output "Final stack count: $($stack.Count)"
