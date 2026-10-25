# One picture of the whole primary screen, as PNG. The Windows counterpart of
# `import -window root` (Linux) and `screencapture` (macOS), for scripts/drive-desktop-app.mjs.
param([Parameter(Mandatory = $true)][string]$File)
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
$bitmap.Save($File, [System.Drawing.Imaging.ImageFormat]::Png)
