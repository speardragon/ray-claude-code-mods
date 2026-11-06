// A host's favicon as a PNG the terminal can draw: a rounded square two cells wide and one tall (a
// cell is twice as tall as it is wide), like an app's icon. `$.http.fetch` hands bodies back as
// text, so curl fetches the bytes: the site's /favicon.ico, else the icon its home page names in a
// <link rel="…icon…">; sips (or ImageMagick) reads it. AppKit, through osascript, lays it on a light
// rounded tile (most icons are drawn for a light browser tab), or, for a site with no icon to fetch,
// draws the host's letter on a tile of its color. Only the linked host is contacted, once a session.
import type { EngineInterface } from 'claude-code'

import type { Favicon } from '../types'

// The tile, drawn by AppKit: `icon <png>` on the light color, or `letter <L>` on the badge color.
export const TILE = `ObjC.import('AppKit')
function run(argv) {
  const [mode, src, out, bgHex, fgHex] = argv
  const S = 128, RADIUS = 30, PAD = 18
  const color = hex => {
    const n = parseInt(hex, 16)
    return $.NSColor.colorWithSRGBRedGreenBlueAlpha(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1)
  }
  const icon = mode === 'icon' ? $.NSImage.alloc.initWithContentsOfFile(src) : null
  if (icon && icon.isNil()) return 'no image'
  const rep = $.NSBitmapImageRep.alloc.initWithBitmapDataPlanesPixelsWidePixelsHighBitsPerSampleSamplesPerPixelHasAlphaIsPlanarColorSpaceNameBytesPerRowBitsPerPixel(null, S, S, 8, 4, true, false, $.NSDeviceRGBColorSpace, 0, 0)
  $.NSGraphicsContext.saveGraphicsState
  $.NSGraphicsContext.setCurrentContext($.NSGraphicsContext.graphicsContextWithBitmapImageRep(rep))
  color(bgHex).setFill
  $.NSBezierPath.bezierPathWithRoundedRectXRadiusYRadius($.NSMakeRect(0, 0, S, S), RADIUS, RADIUS).fill
  if (icon) {
    icon.drawInRectFromRectOperationFraction($.NSMakeRect(PAD, PAD, S - 2 * PAD, S - 2 * PAD), $.NSZeroRect, $.NSCompositingOperationSourceOver, 1)
  } else {
    const attrs = $.NSMutableDictionary.alloc.init
    attrs.setObjectForKey($.NSFont.boldSystemFontOfSize(78), 'NSFont')
    attrs.setObjectForKey(color(fgHex), 'NSColor')
    const text = $.NSString.alloc.initWithUTF8String(src)
    const size = text.sizeWithAttributes(attrs)
    text.drawAtPointWithAttributes($.NSMakePoint((S - size.width) / 2, (S - size.height) / 2), attrs)
  }
  $.NSGraphicsContext.restoreGraphicsState
  const png = rep.representationUsingTypeProperties($.NSBitmapImageFileTypePNG, $({}))
  return png.writeToFileAtomically(out, true) ? 'ok' : 'write failed'
}`

// sh -c FETCH sh <host> <TILE> <chip hex> <badge hex> <letter> <letter hex>: prints the PNG to draw,
// the tile where AppKit made one, else the plain icon; exits non-zero with neither.
export const FETCH = [
  'host="$1"; d="${TMPDIR:-/tmp}/link-list"; mkdir -p "$d" || exit 3',
  'tile="$d/$host.tile.png"; if [ -s "$tile" ]; then printf %s "$tile"; exit 0; fi',
  'out="$d/$host.png"; raw="$d/$host.icon"; page="$d/$host.html"; js="$d/tile.$$.js"',
  'rm -f "$raw" "$page"; trap \'rm -f "$raw" "$page" "$js"\' EXIT',
  'printf %s "$2" > "$js"',
  // tiled <mode> <src> <bg> [fg]: the tile, as TILE's run(mode, src, out, bg, fg) draws it.
  'tiled() { command -v osascript >/dev/null 2>&1 && osascript -l JavaScript "$js" "$1" "$2" "$tile" "$3" "${4:-000000}" >/dev/null 2>&1 && [ -s "$tile" ]; }',
  // An HTML page served for a missing file is no icon.
  'get() { curl -sfL --max-time 5 -A "link-list" -o "$raw" "$1" && [ -s "$raw" ] && ! head -c 512 "$raw" | grep -qi "<html\\|<!doctype"; }',
  'fetch() {',
  '  if [ -s "$out" ]; then return 0; fi',
  '  if ! get "https://$host/favicon.ico"; then',
  // The home page may redirect (docs.claude.com to platform.claude.com): its icon is the final page's.
  '    final=$(curl -sfL --max-time 5 -A "link-list" -o "$page" -w "%{url_effective}" "https://$host/") || return 6',
  '    base=$(printf %s "$final" | sed -E "s#^(https?://[^/]+).*#\\1#")',
  `    tag=$(tr '\\n' ' ' < "$page" | grep -oiE '<link[^>]*rel=["'"'"']?[^>]*icon[^>]*>' | head -1)`,
  `    href=$(printf %s "$tag" | grep -oiE 'href=["'"'"'][^"'"'"']*' | head -1 | sed -E 's/^[hH][rR][eE][fF]=.//; s/&amp;/\\&/g')`,
  '    case "$href" in',
  '      "" | data:*) return 7 ;;',
  '      //*) url="https:$href" ;;',
  '      http://* | https://*) url="$href" ;;',
  '      /*) url="$base$href" ;;',
  '      *) url="$base/$href" ;;',
  '    esac',
  '    get "$url" || return 7',
  '  fi',
  '  if command -v sips >/dev/null 2>&1; then sips -s format png -Z 128 "$raw" --out "$out" >/dev/null 2>&1',
  '  elif command -v magick >/dev/null 2>&1; then magick "$raw[0]" -resize 128x128 "$out" 2>/dev/null',
  '  elif command -v convert >/dev/null 2>&1; then convert "$raw[0]" -resize 128x128 "$out" 2>/dev/null',
  '  else return 5; fi',
  '  [ -s "$out" ] || return 4', // sips exits 0 on a file it could not read
  '}',
  'fetch; code=$?',
  'if [ "$code" = 0 ]; then',
  '  if tiled icon "$out" "$3"; then printf %s "$tile"; else printf %s "$out"; fi',
  '  exit 0',
  'fi',
  // No icon: the host's letter on a tile of its color, where AppKit can draw one.
  'if tiled letter "$5" "$4" "$6"; then printf %s "$tile"; exit 0; fi',
  'exit "$code"',
].join('\n')

const PROBLEMS: Record<number, string> = {
  4: 'the icon could not be turned into a PNG',
  5: 'no converter (sips or ImageMagick)',
  6: 'the site did not answer',
  7: 'the site names no icon',
}

// A host the script may be given: letters, digits, dots and dashes, nothing a shell would read.
export const isSafeHost = (host: string) => /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host)

// The letter badge that stands for a host without a picture, its color fixed by the host's name.
const BADGES = ['#2f81f7', '#a371f7', '#3fb950', '#d29922', '#f85149', '#db61a2', '#39c5cf', '#f0883e']

export function badgeOf(host: string): { letter: string; color: string } {
  const name = host.split('.').slice(-2, -1)[0] ?? host
  const letter = (name.match(/[a-z0-9]/i)?.[0] ?? '?').toUpperCase()
  const hash = [...host].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) >>> 0, 7)
  return { letter, color: BADGES[hash % BADGES.length]! }
}

const hex = (color: string) => color.replace(/^#/, '')

export async function fetchFavicon($: EngineInterface, host: string, colors: { chip: string; letter: string }): Promise<Favicon> {
  if (!isSafeHost(host)) return { state: 'none', problem: 'not a host name' }
  const badge = badgeOf(host)
  try {
    const argv = ['/bin/sh', '-c', FETCH, 'sh', host, TILE, hex(colors.chip), hex(badge.color), badge.letter, hex(colors.letter)]
    const r = await $.process.run(argv, { timeoutMs: 15_000 })
    const png = r.stdout.trim()
    if (r.exitCode === 0 && png) return { state: 'ready', png, isTile: png.endsWith('.tile.png') }
    return { state: 'none', problem: PROBLEMS[r.exitCode] ?? 'no icon was found' }
  } catch {
    return { state: 'none', problem: 'the icon could not be fetched' }
  }
}
