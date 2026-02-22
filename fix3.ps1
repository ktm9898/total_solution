$idxContent = [System.IO.File]::ReadAllText("index.html", [System.Text.Encoding]::UTF8)
$admContent = [System.IO.File]::ReadAllText("admin.html", [System.Text.Encoding]::UTF8)

# Extract CSS from index.html
$idxStart = $idxContent.IndexOf("        .print-only {")
$idxEnd = $idxContent.IndexOf("    </style>", $idxStart)
$idxCss = $idxContent.Substring($idxStart, $idxEnd - $idxStart)

# Extract CSS from admin.html
# Since admin.html was already modified, I need to find the start of the CSS block.
$admStart = $admContent.IndexOf("        .print-only {")
$admEnd = $admContent.IndexOf("    </style>", $admStart)

if ($admStart -ge 0 -and $admEnd -gt $admStart) {
    $admContent = $admContent.Substring(0, $admStart) + $idxCss + $admContent.Substring($admEnd)
}

[System.IO.File]::WriteAllText("admin.html", $admContent, [System.Text.Encoding]::UTF8)
Write-Output "Done"
