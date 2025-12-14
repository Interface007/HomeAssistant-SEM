# Generate SVG using pure PowerShell (no PSSVG dependency)

$pinsProReihe   = 12
$pinAbstandMil  = 100
$rowAbstandMil  = 300
$modulBreiteMil = 1000
$modulHoeheMil  = 709

# Build SVG content as string
$svgContent = @"
<?xml version="1.0" encoding="UTF-8"?>
<svg viewBox="0 0 $modulBreiteMil $modulHoeheMil" xmlns="http://www.w3.org/2000/svg">
  <!-- Border rectangle -->
  <rect x="10" y="10" width="$($modulBreiteMil-20)" height="$($modulHoeheMil-20)" stroke="black" stroke-width="2" fill="none"/>
  
  <!-- First row pins -->
"@

# Add first row pins
for ($i=0; $i -lt $pinsProReihe; $i++) {
    $x = 20 + $i * $pinAbstandMil
    $svgContent += "`n  <rect id=`"connector${i}pin`" x=`"$x`" y=`"20`" width=`"40`" height=`"60`" fill=`"#FFD700`" stroke=`"#FFD700`"/>"
}

$svgContent += "`n`n  <!-- Second row pins -->"

# Add second row pins
for ($i=0; $i -lt $pinsProReihe; $i++) {
    $x  = 20 + $i * $pinAbstandMil
    $id = $pinsProReihe + $i
    $y = $rowAbstandMil - 80
    $svgContent += "`n  <rect id=`"connector${id}pin`" x=`"$x`" y=`"$y`" width=`"40`" height=`"60`" fill=`"#FFD700`" stroke=`"#FFD700`"/>"
}

$svgContent += "`n</svg>"

# Write to file
Set-Content -Path "ESP32_PCB.svg" -Value $svgContent -Encoding UTF8

Write-Host "SVG geschrieben nach ESP32_PCB.svg"