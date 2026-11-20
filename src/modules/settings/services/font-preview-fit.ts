/** Fit the complete sample, including padding/reference, without changing the user's font size. */
export function fitFontPreview(screen: HTMLElement | null, content: HTMLElement | null, verse: HTMLElement | null): void {
  if (!screen || !content || !verse || !screen.clientWidth || !screen.clientHeight) return
  let size = Math.min(32, Math.max(14, screen.clientWidth * 0.045))
  verse.style.fontSize = `${size}px`
  for (let attempt = 0; attempt < 24; attempt++) {
    if (content.offsetHeight <= screen.clientHeight && content.scrollWidth <= screen.clientWidth) return
    size *= 0.9
    verse.style.fontSize = `${size}px`
  }
}
