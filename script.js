import { encodeMap } from './lib/encoder.js';
import { processImageData, mergeRectangles } from './lib/dither.js';
import { downloadBytes } from './lib/utils.js';

// DOM Elements
const imageUpload = document.getElementById('image-upload');
const widthRange = document.getElementById('width-range');
const widthVal = document.getElementById('width-val');
const sizeRange = document.getElementById('size-range');
const sizeVal = document.getElementById('size-val');
const contrastRange = document.getElementById('contrast-range');
const contrastVal = document.getElementById('contrast-val');
const invertCheck = document.getElementById('invert-check');
const mergeCheck = document.getElementById('merge-check');
const downloadBtn = document.getElementById('download-btn');

const sourceCanvas = document.getElementById('source-canvas');
const resultCanvas = document.getElementById('result-canvas');
const sourcePreview = document.getElementById('source-preview');
const resultPreview = document.getElementById('result-preview');
const statsBar = document.getElementById('stats-bar');

const statPixels = document.getElementById('stat-pixels');
const statBlocks = document.getElementById('stat-blocks');
const statRatio = document.getElementById('stat-ratio');

let originalImage = null;
let currentBlocks = [];
let currentFilename = "map.fun";
let currentGrid = null;
let currentGridWidth = 0;
let currentGridHeight = 0;
let currentImgPixelWidth = 0;
let currentImgPixelHeight = 0;

// Camera state
let panX = 0;
let panY = 0;
let zoom = 1.0;
let isDragging = false;
let startDragX = 0;
let startDragY = 0;

// Camera Events
[sourceCanvas, resultCanvas].forEach(canvas => {
    canvas.addEventListener('mousedown', e => {
        isDragging = true;
        startDragX = e.clientX - panX;
        startDragY = e.clientY - panY;
        canvas.style.cursor = 'grabbing';
    });
    
    canvas.addEventListener('wheel', e => {
        e.preventDefault();
        const zoomDelta = e.deltaY > 0 ? 0.9 : 1.1;
        
        const rect = canvas.getBoundingClientRect();
        const mouseX = (e.clientX - rect.left) * (800 / rect.width);
        const mouseY = (e.clientY - rect.top) * (800 / rect.height);
        
        const targetX = (mouseX - panX) / zoom;
        const targetY = (mouseY - panY) / zoom;
        
        zoom *= zoomDelta;
        zoom = Math.max(0.1, Math.min(zoom, 10));
        
        panX = mouseX - targetX * zoom;
        panY = mouseY - targetY * zoom;
        drawCanvases();
    }, { passive: false });
});

window.addEventListener('mousemove', e => {
    if (!isDragging) return;
    panX = e.clientX - startDragX;
    panY = e.clientY - startDragY;
    drawCanvases();
});

window.addEventListener('mouseup', () => {
    isDragging = false;
    sourceCanvas.style.cursor = 'grab';
    resultCanvas.style.cursor = 'grab';
});

// Event Listeners
imageUpload.addEventListener('change', handleImageUpload);
widthRange.addEventListener('input', updateWidth);
sizeRange.addEventListener('input', updateSize);
contrastRange.addEventListener('input', updateContrast);
invertCheck.addEventListener('change', renderPreview);
mergeCheck.addEventListener('change', renderPreview);
downloadBtn.addEventListener('click', downloadMap);

function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    currentFilename = file.name.split('.')[0] + ".fun";
    const reader = new FileReader();

    reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
            originalImage = img;
            sourcePreview.style.display = 'none';
            sourceCanvas.style.display = 'block';
            renderPreview();
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
}

function updateWidth() {
    widthVal.textContent = widthRange.value;
    if (originalImage) renderPreview();
}

function updateSize() {
    sizeVal.textContent = sizeRange.value;
    if (originalImage) renderPreview();
}

function updateContrast() {
    contrastVal.textContent = contrastRange.value;
    if (originalImage) renderPreview();
}

// Initialize labels
window.addEventListener('DOMContentLoaded', () => {
    widthVal.textContent = widthRange.value;
    sizeVal.textContent = sizeRange.value;
    contrastVal.textContent = contrastRange.value;
});

function renderPreview() {
    if (!originalImage) return;

    // Set up viewport constants
    const MAX_PHYSICAL_SIZE = parseFloat(sizeRange.max) || 200;
    const VIEWPORT_SIZE = 800;
    const pixelsPerUnit = VIEWPORT_SIZE / MAX_PHYSICAL_SIZE;
    
    currentGridWidth = parseInt(widthRange.value);
    const aspect = originalImage.height / originalImage.width;
    currentGridHeight = Math.max(1, Math.round(currentGridWidth * aspect));
    const physicalSize = parseFloat(sizeRange.value);
    const contrast = parseFloat(contrastRange.value);
    const invert = invertCheck.checked;
    const merge = mergeCheck.checked;

    // Calculate physical image dimensions in pixels
    const imgPhysicalWidth = physicalSize;
    const imgPhysicalHeight = physicalSize * (currentGridHeight / currentGridWidth);
    currentImgPixelWidth = imgPhysicalWidth * pixelsPerUnit;
    currentImgPixelHeight = imgPhysicalHeight * pixelsPerUnit;

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = currentGridWidth;
    tempCanvas.height = currentGridHeight;
    const tCtx = tempCanvas.getContext('2d');
    tCtx.imageSmoothingEnabled = true;
    tCtx.imageSmoothingQuality = 'high';
    tCtx.drawImage(originalImage, 0, 0, currentGridWidth, currentGridHeight);
    const imageData = tCtx.getImageData(0, 0, currentGridWidth, currentGridHeight);

    currentGrid = processImageData(imageData, contrast, invert);

    // Merge rectangles (if enabled)
    const blockSize = physicalSize / currentGridWidth;
    if (merge) {
        currentBlocks = mergeRectangles(currentGrid, currentGridWidth, currentGridHeight, blockSize);
    } else {
        currentBlocks = [];
        for (let y = 0; y < currentGridHeight; y++) {
            for (let x = 0; x < currentGridWidth; x++) {
                if (currentGrid[y][x]) {
                    currentBlocks.push({
                        id: 2,
                        position: { x: x * blockSize + blockSize/2, y: (currentGridHeight - y - 1) * blockSize + blockSize/2 },
                        scale: { x: blockSize, y: -blockSize },
                        rotation: 0
                    });
                }
            }
        }
    }

    let pixelCount = 0;
    for(let i=0; i<currentGridHeight; i++) {
        for(let j=0; j<currentGridWidth; j++) {
             if(currentGrid[i][j]) pixelCount++;
        }
    }

    // Update stats and button
    statsBar.style.visibility = 'visible';
    statPixels.textContent = `Pixels: ${pixelCount}`;
    statBlocks.textContent = `Blocks: ${currentBlocks.length}`;
    const ratio = currentBlocks.length ? (pixelCount / currentBlocks.length).toFixed(1) : 0;
    statRatio.textContent = `Optimization: ${ratio}x`;
    downloadBtn.disabled = false;

    // Reset camera when changing source image resolution?
    // Let's just redraw
    drawCanvases();
}

function drawCanvases() {
    if (!originalImage || !currentGrid) return;
    
    const VIEWPORT_SIZE = 800;
    const MAX_PHYSICAL_SIZE = parseFloat(sizeRange.max) || 200;
    const pixelsPerUnit = VIEWPORT_SIZE / MAX_PHYSICAL_SIZE;
    const gridSizePixels = 5 * pixelsPerUnit;
    
    const offsetX = (VIEWPORT_SIZE - currentImgPixelWidth) / 2;
    const offsetY = (VIEWPORT_SIZE - currentImgPixelHeight) / 2;

    // Compute active grid range to draw infinitely
    const startX = Math.floor((-panX/zoom) / gridSizePixels) * gridSizePixels;
    const endX = startX + (VIEWPORT_SIZE/zoom) + gridSizePixels;
    const startY = Math.floor((-panY/zoom) / gridSizePixels) * gridSizePixels;
    const endY = startY + (VIEWPORT_SIZE/zoom) + gridSizePixels;

    // --- DRAW SOURCE CANVAS ---
    sourceCanvas.width = VIEWPORT_SIZE;
    sourceCanvas.height = VIEWPORT_SIZE;
    const ctxS = sourceCanvas.getContext('2d');
    
    ctxS.fillStyle = '#f8fafc';
    ctxS.fillRect(0, 0, VIEWPORT_SIZE, VIEWPORT_SIZE);
    
    ctxS.save();
    ctxS.translate(panX, panY);
    ctxS.scale(zoom, zoom);
    
    ctxS.strokeStyle = 'rgba(0, 0, 0, 0.1)';
    ctxS.lineWidth = 1 / zoom;
    for (let x = startX; x <= endX; x += gridSizePixels) {
        ctxS.beginPath(); ctxS.moveTo(x, startY); ctxS.lineTo(x, endY); ctxS.stroke();
    }
    for (let y = startY; y <= endY; y += gridSizePixels) {
        ctxS.beginPath(); ctxS.moveTo(startX, y); ctxS.lineTo(endX, y); ctxS.stroke();
    }
    
    ctxS.imageSmoothingEnabled = true;
    ctxS.drawImage(originalImage, offsetX, offsetY, currentImgPixelWidth, currentImgPixelHeight);
    ctxS.restore();

    // --- DRAW RESULT CANVAS ---
    resultPreview.style.display = 'none';
    resultCanvas.style.display = 'block';
    
    resultCanvas.width = VIEWPORT_SIZE;
    resultCanvas.height = VIEWPORT_SIZE;
    const ctxR = resultCanvas.getContext('2d');
    
    ctxR.fillStyle = '#f8fafc';
    ctxR.fillRect(0, 0, VIEWPORT_SIZE, VIEWPORT_SIZE);
    
    ctxR.save();
    ctxR.translate(panX, panY);
    ctxR.scale(zoom, zoom);
    
    ctxR.strokeStyle = 'rgba(0, 0, 0, 0.1)';
    ctxR.lineWidth = 1 / zoom;
    for (let x = startX; x <= endX; x += gridSizePixels) {
        ctxR.beginPath(); ctxR.moveTo(x, startY); ctxR.lineTo(x, endY); ctxR.stroke();
    }
    for (let y = startY; y <= endY; y += gridSizePixels) {
        ctxR.beginPath(); ctxR.moveTo(startX, y); ctxR.lineTo(endX, y); ctxR.stroke();
    }
    
    // Draw center crosshair
    ctxR.strokeStyle = 'rgba(255, 0, 0, 0.3)';
    ctxR.beginPath(); ctxR.moveTo(VIEWPORT_SIZE/2, -10000); ctxR.lineTo(VIEWPORT_SIZE/2, 10000); ctxR.stroke();
    ctxR.beginPath(); ctxR.moveTo(-10000, VIEWPORT_SIZE/2); ctxR.lineTo(10000, VIEWPORT_SIZE/2); ctxR.stroke();
    
    const blockPixelWidth = currentImgPixelWidth / currentGridWidth;
    const blockPixelHeight = currentImgPixelHeight / currentGridHeight;
    ctxR.fillStyle = '#1e293b'; 

    for (let y = 0; y < currentGridHeight; y++) {
        for (let x = 0; x < currentGridWidth; x++) {
            if (currentGrid[y][x]) {
                ctxR.fillRect(
                    offsetX + x * blockPixelWidth - (0.2/zoom),
                    offsetY + y * blockPixelHeight - (0.2/zoom),
                    blockPixelWidth + (0.4/zoom),
                    blockPixelHeight + (0.4/zoom)
                );
            }
        }
    }
    ctxR.restore();
}

function downloadMap() {
    if (currentBlocks.length === 0) return;
    
    const bytes = encodeMap(currentBlocks);
    downloadBytes(bytes, currentFilename);
}
