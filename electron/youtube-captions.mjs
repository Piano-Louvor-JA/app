/** Hide only the selectable YouTube caption layer, never text burned into the video. */
export function youtubeCaptionsScript(hidden) {
  return `(() => {
    const hidden = ${Boolean(hidden)};
    let style = document.getElementById('louvorja-youtube-captions');
    if (hidden && !style) {
      style = document.createElement('style');
      style.id = 'louvorja-youtube-captions';
      style.textContent = '#movie_player .ytp-caption-window-container, #movie_player .caption-window { display: none !important; visibility: hidden !important; }';
      document.head.appendChild(style);
    } else if (!hidden && style) style.remove();
    return { captionsHidden: hidden };
  })()`
}
