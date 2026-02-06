# VJ Image Optimizer

VJ Image Optimizer is a small, client-side tool to convert heavy PNGs into JPG, WEBP, and optimized PNG. It runs entirely in the browser, with no uploads or server processing.

I built this for fun because I had to create a lot of images for a WooCommerce store. I wanted something fast and easy for me and my friends, so I'm sharing it in case it helps anyone.

## Features

- Batch convert images to JPG/WEBP/PNG
- Optional max output size (KB) with auto quality adjustment
- In-app prompt to allow lower quality when needed
- Low-power mode for older devices (one-by-one processing)
- Local ZIP download for all outputs
- File validation and clear skip reasons
- Client-side only (no uploads)

## Browser Compatibility

VJ Image Optimizer works best on modern browsers with good support for:

- Canvas API (toBlob)
- createImageBitmap (for performance)
- Blob & FileReader APIs

## How it works

The browser loads each image into memory, draws it to a canvas, and re-encodes it to the selected formats. The outputs are generated in-memory and downloaded to your device when you click download.

## Security / Privacy

- Images never leave your device
- No server uploads or storage
- Processing happens locally in the browser

## Usage

1. Open `index.html` in your browser.
2. Select up to 10 images (max 20 MB each).
3. Choose output formats and quality.
4. (Optional) Enable max output size for auto-adjusted quality. If 40% cannot hit the target, you can allow lower quality down to 20%.
5. Convert and download individual files or a ZIP.

## Analytics (optional)

This tool supports Google Analytics and Google Ads. To enable them, open `index.html` and set the IDs in:

```
window.vjAnalytics = {
  ga4Id: "G-XXXXXXX",
  adsId: "AW-XXXXXXX",
};
```

If both values are empty, no tracking scripts are loaded.

## Notes

- Max output size works only for lossy formats (JPG/WEBP).
- PNG is lossless and will not shrink unless you resize (not used here).
- Low-power mode processes one image at a time for smoother performance.
- You can allow lower quality (down to 20%) to reach smaller KB targets.

## License

MIT License. See `LICENSE` for details.
