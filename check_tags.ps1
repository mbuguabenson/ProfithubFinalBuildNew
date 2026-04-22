$path = 'c:\Users\Castel Technologies\Videos\ProfithubApril21\profithubapril-master\src\pages\smart-trading\components\signal-centre-tab.tsx'
$text = [IO.File]::ReadAllText($path)
$o = [regex]::Matches($text, "<").Count
$c = [regex]::Matches($text, ">").Count
Write-Output "Angle Open: $o, Close: $c"
