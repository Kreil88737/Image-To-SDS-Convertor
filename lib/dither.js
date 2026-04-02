/**
 * SDSMap Dithering and Merging Library
 */

/**
 * Applies contrast boost and Floyd-Steinberg dithering to an ImageData object.
 * Returns a 2D boolean grid [y][x] where true = black pixel.
 */
export function processImageData(imageData, contrast, invert) {
    const { data, width, height } = imageData;
    const grid = Array.from({ length: height }, () => new Uint8Array(width));
    
    // 1. Grayscale + Contrast
    const gray = new Float32Array(width * height);
    for (let i = 0; i < data.length; i += 4) {
        // Simple grayscale: (R + G + B) / 3
        let val = (data[i] + data[i+1] + data[i+2]) / 3;
        
        // Contrast boost: 128 + factor * (val - 128)
        val = 128 + contrast * (val - 128);
        gray[i / 4] = Math.max(0, Math.min(255, val));
    }

    // 2. Floyd-Steinberg Dithering
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            const oldPixel = gray[idx];
            const newPixel = oldPixel < 128 ? 0 : 255;
            gray[idx] = newPixel;
            
            const err = oldPixel - newPixel;
            
            // Distribute error to neighbors
            if (x + 1 < width) gray[idx + 1] += err * 7 / 16;
            if (y + 1 < height) {
                if (x > 0)     gray[idx + width - 1] += err * 3 / 16;
                gray[idx + width] += err * 5 / 16;
                if (x + 1 < width) gray[idx + width + 1] += err * 1 / 16;
            }

            // Store in grid (0 = black, 255 = white)
            // If black, grid cell is true (or false if inverted)
            const isBlack = newPixel === 0;
            grid[y][x] = invert ? !isBlack : isBlack;
        }
    }

    return grid;
}

/**
 * Greedy rectangle merger: reduces block count for solid areas.
 */
export function mergeRectangles(grid, width, height, blockSize) {
    const used = Array.from({ length: height }, () => new Uint8Array(width));
    const blocks = [];

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (!grid[y][x] || used[y][x]) continue;

            // Expand right
            let w = 0;
            while (x + w < width && grid[y][x + w] && !used[y][x + w]) {
                w++;
            }

            // Expand down
            let h = 1;
            while (y + h < height) {
                let rowOk = true;
                for (let dx = 0; dx < w; dx++) {
                    if (!grid[y + h][x + dx] || used[y + h][x + dx]) {
                        rowOk = false;
                        break;
                    }
                }
                if (rowOk) h++;
                else break;
            }

            // Mark used
            for (let dy = 0; dy < h; dy++) {
                for (let dx = 0; dx < w; dx++) {
                    used[y + dy][x + dx] = 1;
                }
            }

            // Calculate world space position
            // Flip Y: Image 0 is TOP, Unity 0 is BOTTOM
            const rectW = w * blockSize;
            const rectH = h * blockSize;
            const worldXLeft = x * blockSize;
            const worldYBottom = (height - y - h) * blockSize;
            
            const cx = worldXLeft + rectW / 2;
            const cy = worldYBottom + rectH / 2;

            blocks.push({
                id: 2,
                position: { x: cx, y: cy },
                scale: { x: rectW, y: -rectH },
                rotation: 0
            });
        }
    }

    return blocks;
}
