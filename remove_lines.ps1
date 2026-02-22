$lines = [System.IO.File]::ReadAllLines("admin.html", [System.Text.Encoding]::UTF8)
$newLines = $lines[0..901] + $lines[1034..($lines.Length - 1)]
[System.IO.File]::WriteAllLines("admin.html", $newLines, [System.Text.Encoding]::UTF8)
Write-Output "Done"
