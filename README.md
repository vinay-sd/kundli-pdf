# kundli-pdf

    npm i
    npx tsx scripts/generate-kundli-pdf.ts --name "Vinay" --date 2004-02-28 --time 09:16 --place Mumbai

Options: `--lat --lon --tz` (default Mumbai, 5.5) · `--gochar "YYYY-MM-DD HH:MM"` (default: now) · `--out file.pdf` · `--tzname` (default Asia/Kolkata)

## Using your real kundli.ts
`src/kundli.ts` is your uploaded file and `src/insights/*` are empty stubs, so the sandbox runs standalone.
In your repo, delete `src/` and change the single `import ... from '../src/kundli'` line at the top of the script.

## assets/
- frame_natal.png / frame_gochar.png – chart frames, RGB + soft mask merged to RGBA
- logo.png – Astrochitra logo, transparent, 800 dpi (rendered from the PDF's vector shading)
- cell_mask.json – the 12 house cells of the frame as a mask; planets are packed inside it
- fonts/ – Baloo 2 ExtraBold (matches the sample's Baloo), Poppins, Noto Sans (for the ᴿ mark); OFL-licensed
