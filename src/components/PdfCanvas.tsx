import React, { useEffect, useRef, useState, CSSProperties } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { renderPdfPageToCanvas } from '../utils/pdfViewer';
import { PDFPageMetadata, PDFTextItem } from '../types';
import { Eye, Edit, HelpCircle, Link } from 'lucide-react';
import { parseStyledText } from '../utils/pdfEditor';

interface PdfCanvasProps {
  pdfBuffer: ArrayBuffer;
  pageIndex: number;
  pageMetadata: PDFPageMetadata | null;
  selectedItemId: string | null;
  onItemSelect: (item: PDFTextItem) => void;
  scale: number;
  // Drawing Tools Props
  activeDrawingTool: 'none' | 'brush' | 'eraser' | 'text' | 'crop' | 'paintBucket';
  drawingColor: string;
  drawingThickness: number;
  pageDrawings: Record<number, string>;
  onDrawingChange: (pageIndex: number, dataUrl: string) => void;
  onAddFreeText: (x: number, y: number) => void;
  onApplyEdit: (edit: { 
    itemId: string; 
    newText: string; 
    textColor: string; 
    bgColor: string; 
    linkUrl?: string;
    isBold?: boolean;
    isItalic?: boolean;
    fontName?: string;
    fontSize?: number;
    imageSrc?: string;
    imageWidth?: number;
    imageHeight?: number;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    skipHistory?: boolean;
  }) => void;
  onAddImage?: (imageSrc: string, naturalWidth: number, naturalHeight: number, customCoords?: { x: number; y: number; width: number; height: number }) => void;
  onStartDragOrResize?: () => void;
  onEndDragOrResize?: () => void;
}

export function PdfCanvas({
  pdfBuffer,
  pageIndex,
  pageMetadata,
  selectedItemId,
  onItemSelect,
  scale,
  activeDrawingTool,
  drawingColor,
  drawingThickness,
  pageDrawings,
  onDrawingChange,
  onAddFreeText,
  onApplyEdit,
  onAddImage,
  onStartDragOrResize,
  onEndDragOrResize,
}: PdfCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);

  // Crop selection states
  const [cropSelection, setCropSelection] = useState<{ startX: number; startY: number; endX: number; endY: number } | null>(null);
  const isSelectingCrop = useRef(false);

  // Dragging and Resizing State
  const [activeAction, setActiveAction] = useState<{
    type: 'drag' | 'resize';
    itemId: string;
    startX: number;
    startY: number;
    startItemX: number;
    startItemY: number;
    startItemWidth: number;
    startItemHeight: number;
    aspectRatio: number;
  } | null>(null);

  const startDrag = (e: React.MouseEvent, item: PDFTextItem) => {
    if (activeDrawingTool !== 'none') return;
    e.stopPropagation();
    if (onStartDragOrResize) onStartDragOrResize();
    // Do not prevent default for clicks on hyperlinks or form inputs to remain editable, but suppress dragging browser defaults
    setActiveAction({
      type: 'drag',
      itemId: item.id,
      startX: e.clientX,
      startY: e.clientY,
      startItemX: item.x,
      startItemY: item.y,
      startItemWidth: item.width || 100,
      startItemHeight: item.height || 20,
      aspectRatio: (item.imageWidth && item.imageHeight) ? item.imageWidth / item.imageHeight : (item.width / (item.height || 20) || 1),
    });
  };

  const startDragTouch = (e: React.TouchEvent, item: PDFTextItem) => {
    if (activeDrawingTool !== 'none') return;
    if (e.touches.length === 0) return;
    e.stopPropagation();
    if (onStartDragOrResize) onStartDragOrResize();
    const touch = e.touches[0];
    setActiveAction({
      type: 'drag',
      itemId: item.id,
      startX: touch.clientX,
      startY: touch.clientY,
      startItemX: item.x,
      startItemY: item.y,
      startItemWidth: item.width || 100,
      startItemHeight: item.height || 20,
      aspectRatio: (item.imageWidth && item.imageHeight) ? item.imageWidth / item.imageHeight : (item.width / (item.height || 20) || 1),
    });
  };

  const startResize = (e: React.MouseEvent, item: PDFTextItem) => {
    if (activeDrawingTool !== 'none') return;
    e.stopPropagation();
    e.preventDefault();
    if (onStartDragOrResize) onStartDragOrResize();
    setActiveAction({
      type: 'resize',
      itemId: item.id,
      startX: e.clientX,
      startY: e.clientY,
      startItemX: item.x,
      startItemY: item.y,
      startItemWidth: item.width || 100,
      startItemHeight: item.height || 20,
      aspectRatio: (item.imageWidth && item.imageHeight) ? item.imageWidth / item.imageHeight : (item.width / (item.height || 20) || 1),
    });
  };

  const startResizeTouch = (e: React.TouchEvent, item: PDFTextItem) => {
    if (activeDrawingTool !== 'none') return;
    if (e.touches.length === 0) return;
    e.stopPropagation();
    e.preventDefault();
    if (onStartDragOrResize) onStartDragOrResize();
    const touch = e.touches[0];
    setActiveAction({
      type: 'resize',
      itemId: item.id,
      startX: touch.clientX,
      startY: touch.clientY,
      startItemX: item.x,
      startItemY: item.y,
      startItemWidth: item.width || 100,
      startItemHeight: item.height || 20,
      aspectRatio: (item.imageWidth && item.imageHeight) ? item.imageWidth / item.imageHeight : (item.width / (item.height || 20) || 1),
    });
  };

  // Drag and Resize handler Effects
  useEffect(() => {
    if (!activeAction || !pageMetadata) return;

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      const deltaX = (e.clientX - activeAction.startX) / scale;
      const deltaY = (e.clientY - activeAction.startY) / scale;

      const matchedItem = pageMetadata.textItems.find(item => item.id === activeAction.itemId);
      if (!matchedItem) return;

      if (activeAction.type === 'drag') {
        const newX = activeAction.startItemX + deltaX;
        const newY = activeAction.startItemY - deltaY;

        onApplyEdit({
          itemId: activeAction.itemId,
          newText: matchedItem.currentText,
          textColor: matchedItem.textColor || '#000000',
          bgColor: matchedItem.bgColor || 'transparent',
          linkUrl: matchedItem.linkUrl,
          isBold: matchedItem.isBold,
          isItalic: matchedItem.isItalic,
          fontName: matchedItem.fontName,
          fontSize: matchedItem.fontSize,
          imageSrc: matchedItem.imageSrc,
          imageWidth: matchedItem.imageWidth,
          imageHeight: matchedItem.imageHeight,
          x: newX,
          y: newY,
          width: matchedItem.width,
          height: matchedItem.height,
          skipHistory: true,
        });
      } else if (activeAction.type === 'resize') {
        let newWidth = activeAction.startItemWidth + deltaX;
        if (newWidth < 10) newWidth = 10;

        const newHeight = newWidth / activeAction.aspectRatio;
        const originalYTop = activeAction.startItemY + activeAction.startItemHeight;
        const newY = originalYTop - newHeight;

        onApplyEdit({
          itemId: activeAction.itemId,
          newText: matchedItem.currentText,
          textColor: matchedItem.textColor || '#000000',
          bgColor: matchedItem.bgColor || 'transparent',
          linkUrl: matchedItem.linkUrl,
          isBold: matchedItem.isBold,
          isItalic: matchedItem.isItalic,
          fontName: matchedItem.fontName,
          fontSize: matchedItem.fontSize,
          imageSrc: matchedItem.imageSrc,
          imageWidth: newWidth,
          imageHeight: newHeight,
          x: matchedItem.x,
          y: newY,
          width: newWidth,
          height: newHeight,
          skipHistory: true,
        });
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 0) return;
      const touch = e.touches[0];
      const deltaX = (touch.clientX - activeAction.startX) / scale;
      const deltaY = (touch.clientY - activeAction.startY) / scale;

      const matchedItem = pageMetadata.textItems.find(item => item.id === activeAction.itemId);
      if (!matchedItem) return;

      if (activeAction.type === 'drag') {
        const newX = activeAction.startItemX + deltaX;
        const newY = activeAction.startItemY - deltaY;

        onApplyEdit({
          itemId: activeAction.itemId,
          newText: matchedItem.currentText,
          textColor: matchedItem.textColor || '#000000',
          bgColor: matchedItem.bgColor || 'transparent',
          linkUrl: matchedItem.linkUrl,
          isBold: matchedItem.isBold,
          isItalic: matchedItem.isItalic,
          fontName: matchedItem.fontName,
          fontSize: matchedItem.fontSize,
          imageSrc: matchedItem.imageSrc,
          imageWidth: matchedItem.imageWidth,
          imageHeight: matchedItem.imageHeight,
          x: newX,
          y: newY,
          width: matchedItem.width,
          height: matchedItem.height,
          skipHistory: true,
        });
      } else if (activeAction.type === 'resize') {
        let newWidth = activeAction.startItemWidth + deltaX;
        if (newWidth < 10) newWidth = 10;

        const newHeight = newWidth / activeAction.aspectRatio;
        const originalYTop = activeAction.startItemY + activeAction.startItemHeight;
        const newY = originalYTop - newHeight;

        onApplyEdit({
          itemId: activeAction.itemId,
          newText: matchedItem.currentText,
          textColor: matchedItem.textColor || '#000000',
          bgColor: matchedItem.bgColor || 'transparent',
          linkUrl: matchedItem.linkUrl,
          isBold: matchedItem.isBold,
          isItalic: matchedItem.isItalic,
          fontName: matchedItem.fontName,
          fontSize: matchedItem.fontSize,
          imageSrc: matchedItem.imageSrc,
          imageWidth: newWidth,
          imageHeight: newHeight,
          x: matchedItem.x,
          y: newY,
          width: newWidth,
          height: newHeight,
          skipHistory: true,
        });
      }
    };

    const handleMouseUp = () => {
      if (activeAction && onEndDragOrResize) {
        onEndDragOrResize();
      }
      setActiveAction(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, [activeAction, scale, pageMetadata, onApplyEdit, onEndDragOrResize]);

  useEffect(() => {
    let active = true;
    let renderObj: { cancel: () => void; promise: Promise<any> } | null = null;

    async function drawPage() {
      if (!canvasRef.current || !pdfBuffer) return;
      setIsRendering(true);
      setRenderError(null);

      try {
        renderObj = renderPdfPageToCanvas(pdfBuffer, pageIndex, canvasRef.current, scale);
        await renderObj.promise;
        if (active) {
          setIsRendering(false);
        }
      } catch (err: any) {
        if (active) {
          const isCancel = err?.message?.includes('canceled') || err?.name === 'RenderingCancelledException';
          if (!isCancel) {
            console.error(err);
            setRenderError('Erro ao renderizar esta página no navegador.');
          }
          if (!isCancel) {
            setIsRendering(false);
          }
        }
      }
    }

    drawPage();

    return () => {
      active = false;
      if (renderObj) {
        renderObj.cancel();
      }
    };
  }, [pdfBuffer, pageIndex, scale]);

  const drawingCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);

  // Redesenha os traços existentes quando muda a página ou a escala (re-renderiza)
  useEffect(() => {
    const canvas = drawingCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Limpa o canvas para começar limpo
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const drawingDataUrl = pageDrawings[pageIndex];
    if (drawingDataUrl && drawingDataUrl !== '') {
      const img = new Image();
      img.onload = () => {
        // Limpa novamente antes de pintar para garantir sem ghosting
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      };
      img.src = drawingDataUrl;
    }
  }, [pageIndex, scale, pageDrawings[pageIndex]]);

  // Captura de coordenadas relativas ao Canvas
  const getCoordinates = (
    e: React.MouseEvent<any> | React.TouchEvent<any>
  ) => {
    const canvas = drawingCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();

    let clientX = 0;
    let clientY = 0;

    const touchEvent = e as React.TouchEvent<any>;
    const mouseEvent = e as React.MouseEvent<any>;

    if (touchEvent.touches && touchEvent.touches.length > 0) {
      clientX = touchEvent.touches[0].clientX;
      clientY = touchEvent.touches[0].clientY;
    } else {
      clientX = mouseEvent.clientX;
      clientY = mouseEvent.clientY;
    }

    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  const performCrop = (selection: { startX: number; startY: number; endX: number; endY: number }) => {
    if (!pageMetadata || !canvasRef.current || !onAddImage) return;

    const rectX = Math.min(selection.startX, selection.endX);
    const rectY = Math.min(selection.startY, selection.endY);
    const rectWidth = Math.abs(selection.endX - selection.startX);
    const rectHeight = Math.abs(selection.endY - selection.startY);

    if (rectWidth > 3 && rectHeight > 3) {
      const mainCanvas = canvasRef.current;
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = rectWidth;
      tempCanvas.height = rectHeight;
      const tempCtx = tempCanvas.getContext('2d');
      if (tempCtx) {
        tempCtx.drawImage(
          mainCanvas,
          rectX,
          rectY,
          rectWidth,
          rectHeight,
          0,
          0,
          rectWidth,
          rectHeight
        );
        const croppedImageSrc = tempCanvas.toDataURL('image/png');

        // Converter para pontos de espaço de PDF
        const pdfX = rectX / scale;
        const pdfY = pageMetadata.height - ((rectY + rectHeight) / scale);
        const pdfW = rectWidth / scale;
        const pdfH = rectHeight / scale;

        onAddImage(croppedImageSrc, rectWidth, rectHeight, {
          x: pdfX,
          y: pdfY,
          width: pdfW,
          height: pdfH,
        });
      }
    }
  };

  const floodFill = (startX: number, startY: number, fillColorHex: string) => {
    const canvas = drawingCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    // Converter Hex para RGBA
    const hex = fillColorHex.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    const a = 255;

    const width = canvas.width;
    const height = canvas.height;
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;

    const targetX = Math.round(startX);
    const targetY = Math.round(startY);
    if (targetX < 0 || targetX >= width || targetY < 0 || targetY >= height) return;

    const getPixelPos = (px: number, py: number) => {
      return (py * width + px) * 4;
    };

    const startPos = getPixelPos(targetX, targetY);
    const startR = data[startPos];
    const startG = data[startPos + 1];
    const startB = data[startPos + 2];
    const startA = data[startPos + 3];

    if (startR === r && startG === g && startB === b && startA === a) return;

    const queue: [number, number][] = [];
    queue.push([targetX, targetY]);

    const colorMatch = (pos: number) => {
      const dr = Math.abs(data[pos] - startR);
      const dg = Math.abs(data[pos + 1] - startG);
      const db = Math.abs(data[pos + 2] - startB);
      const da = Math.abs(data[pos + 3] - startA);
      return dr < 16 && dg < 16 && db < 16 && da < 16;
    };

    while (queue.length > 0) {
      const [currX, currY] = queue.pop()!;

      let leftX = currX;
      while (leftX >= 0 && colorMatch(getPixelPos(leftX, currY))) {
        leftX--;
      }
      leftX++;

      let rightX = currX;
      while (rightX < width && colorMatch(getPixelPos(rightX, currY))) {
        rightX++;
      }
      rightX--;

      let scanAbove = false;
      let scanBelow = false;

      for (let x = leftX; x <= rightX; x++) {
        const pos = getPixelPos(x, currY);
        data[pos] = r;
        data[pos + 1] = g;
        data[pos + 2] = b;
        data[pos + 3] = a;

        if (currY > 0) {
          const upPos = getPixelPos(x, currY - 1);
          const upMatch = colorMatch(upPos);
          if (upMatch && !scanAbove) {
            queue.push([x, currY - 1]);
            scanAbove = true;
          } else if (!upMatch) {
            scanAbove = false;
          }
        }

        if (currY < height - 1) {
          const downPos = getPixelPos(x, currY + 1);
          const downMatch = colorMatch(downPos);
          if (downMatch && !scanBelow) {
            queue.push([x, currY + 1]);
            scanBelow = true;
          } else if (!downMatch) {
            scanBelow = false;
          }
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);
    onDrawingChange(pageIndex, canvas.toDataURL('image/png'));
  };

  const startDrawing = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    if (activeDrawingTool === 'none') return;
    if (activeDrawingTool === 'crop') {
      e.preventDefault();
      const { x, y } = getCoordinates(e);
      isSelectingCrop.current = true;
      setCropSelection({ startX: x, startY: y, endX: x, endY: y });
      return;
    }
    if (activeDrawingTool === 'paintBucket') {
      e.preventDefault();
      const { x, y } = getCoordinates(e);
      floodFill(x, y, drawingColor);
      return;
    }
    if (activeDrawingTool === 'text') {
      e.preventDefault();
      const { x, y } = getCoordinates(e);
      if (pageMetadata) {
        const pdfX = x / scale;
        const pdfY = pageMetadata.height - (y / scale);
        onAddFreeText(pdfX, pdfY);
      }
      return;
    }
    e.preventDefault();

    const canvas = drawingCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    isDrawingRef.current = true;
    const { x, y } = getCoordinates(e);

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = drawingThickness * scale;

    if (activeDrawingTool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = drawingColor;
    }

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const draw = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    if (activeDrawingTool === 'none') return;
    if (activeDrawingTool === 'crop' && isSelectingCrop.current) {
      e.preventDefault();
      const { x, y } = getCoordinates(e);
      setCropSelection(prev => prev ? { ...prev, endX: x, endY: y } : null);
      return;
    }
    if (activeDrawingTool === 'paintBucket') return;
    if (!isDrawingRef.current) return;
    e.preventDefault();

    const canvas = drawingCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCoordinates(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (activeDrawingTool === 'crop' && isSelectingCrop.current) {
      isSelectingCrop.current = false;
      if (cropSelection) {
        performCrop(cropSelection);
      }
      setCropSelection(null);
      return;
    }
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;

    const canvas = drawingCanvasRef.current;
    if (!canvas) return;

    onDrawingChange(pageIndex, canvas.toDataURL('image/png'));
  };

  if (!pageMetadata) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white rounded-xl border border-dashed border-slate-200">
        <p className="text-slate-400 text-sm">Carregando detalhes estruturais da página...</p>
      </div>
    );
  }

  const containerWidth = pageMetadata.width * scale;
  const containerHeight = pageMetadata.height * scale;

  return (
    <div className="flex flex-col items-center" id="pdf-view-workspace" style={{ width: `${containerWidth}px` }}>

      <div
        className="w-full flex justify-between items-center bg-slate-50 border border-slate-200 p-2.5 rounded-t-xl text-xs text-slate-500"
        style={{ width: `${containerWidth}px` }}
      >
        <div className="flex items-center gap-1.5">
          <Eye className="w-3.5 h-3.5 text-indigo-500" />
          <span>Página <b>{pageIndex + 1}</b></span>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-indigo-50 border border-indigo-200 inline-block rounded"></span> Não editado</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-emerald-100 border border-emerald-300 inline-block rounded"></span> Editado</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-indigo-500 inline-block rounded"></span> Selecionado</span>
        </div>
      </div>

      <div
        className="relative bg-white shadow-lg border border-t-0 border-slate-200 rounded-b-xl select-none"
        style={{
          width: `${containerWidth}px`,
          height: `${containerHeight}px`,
        }}
        id="pdf-canvas-container"
      >
        <canvas
          ref={canvasRef}
          className="absolute top-0 left-0"
          style={{
            width: `${containerWidth}px`,
            height: `${containerHeight}px`,
          }}
        />

        <div
          className="absolute top-0 left-0"
          style={{
            width: `${containerWidth}px`,
            height: `${containerHeight}px`,
            zIndex: 10,
            pointerEvents: activeDrawingTool !== 'none' ? 'none' : 'auto',
          }}
        >
          {pageMetadata.textItems.map((item) => {
            // Se for máscara branca de cobertura (gerada no Crop), renderiza como retângulo limpo embaixo sem interferir nos controles
            if (item.id.includes('-cover-')) {
              const itemLeft = item.x * scale;
              const itemWidth = item.width * scale;
              const useHeight = item.height || 50;
              const itemHeight = useHeight * scale;
              const itemTop = (pageMetadata.height - item.y - useHeight) * scale;
              return (
                <div
                  key={item.id}
                  className="absolute pointer-events-none select-none"
                  style={{
                    left: `${itemLeft}px`,
                    top: `${itemTop}px`,
                    width: `${itemWidth}px`,
                    height: `${itemHeight}px`,
                    backgroundColor: '#FFFFFF',
                    zIndex: 5,
                  }}
                />
              );
            }

            const isSelected = selectedItemId === item.id;
            
            const isImage = !!item.imageSrc;
            const itemLeft = item.x * scale;
            const itemWidth = item.width * scale;

            const useHeight = isImage ? (item.height || item.imageHeight || 50) : (item.fontSize * 1.15);
            const itemHeight = useHeight * scale;

            const itemTop = isImage
              ? (pageMetadata.height - item.y - useHeight) * scale
              : (pageMetadata.height - item.y - item.fontSize * 0.9) * scale;

            const editStyles: CSSProperties = isImage
              ? {
                  backgroundColor: 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'visible',
                }
              : item.hasBeenEdited
              ? {
                  backgroundColor: item.bgColor || '#FFFFFF',
                  color: item.textColor || '#000000',
                  fontSize: `${item.fontSize * scale}px`,
                  fontFamily: `"${item.fontName}", ${
                    item.fontName.toLowerCase().includes('mono') 
                      ? 'monospace' 
                      : item.fontName.toLowerCase().includes('serif')
                      ? 'serif'
                      : 'sans-serif'
                  }`,
                  lineHeight: '1',
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                  textOverflow: 'ellipsis',
                  paddingLeft: '1px',
                  display: 'flex',
                  alignItems: 'center',
                  fontWeight: item.isBold ? 'bold' : 'normal',
                  fontStyle: item.isItalic ? 'italic' : 'normal',
                }
              : {
                  color: 'transparent',
                };

            const hasLink = !!item.linkUrl;

            return (
              <div
                key={item.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onItemSelect(item);
                }}
                onMouseDown={(e) => startDrag(e, item)}
                onTouchStart={(e) => startDragTouch(e, item)}
                className={`absolute group transition-all duration-150 flex items-center select-none ${
                  hasLink ? 'cursor-pointer hover:underline decoration-indigo-400' : 'cursor-move'
                } ${
                  isSelected
                    ? 'ring-2 ring-indigo-500 ring-offset-0 bg-indigo-50/20 z-30 font-medium'
                    : item.hasBeenEdited
                    ? 'border-b-2 border-emerald-500 bg-emerald-50/20 hover:bg-emerald-50/30 font-medium'
                    : hasLink
                    ? 'border-b border-indigo-500 bg-indigo-50/15 hover:bg-indigo-100/25 font-medium'
                    : 'hover:border hover:border-dashed hover:border-indigo-400 hover:bg-indigo-50/20'
                }`}
                style={{
                  left: `${itemLeft}px`,
                  top: `${itemTop}px`,
                  width: `${itemWidth}px`,
                  height: `${itemHeight}px`,
                  ...editStyles,
                }}
                title={
                  hasLink
                    ? `Link ativo: ${item.linkUrl} | Clique e arraste para mover.`
                    : isImage
                    ? `Imagem livre | Clique e arraste para reposicionar no design.`
                    : item.hasBeenEdited 
                    ? `Texto original: "${item.text}"` 
                    : `Clique para editar: "${item.text}"`
                }
              >
                {item.imageSrc ? (
                  <img 
                    src={item.imageSrc} 
                    alt="Edit Overlay" 
                    className="w-full h-full object-fill pointer-events-none select-none"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  item.hasBeenEdited && (
                    <span className="w-full truncate pointer-events-none select-none flex items-center h-full whitespace-pre">
                      {parseStyledText(item.currentText, !!item.isBold, !!item.isItalic).map((span, idx) => (
                        <span
                          key={idx}
                          style={{
                            fontWeight: span.isBold ? 'bold' : 'normal',
                            fontStyle: span.isItalic ? 'italic' : 'normal',
                            color: span.color || item.textColor || '#000000',
                          }}
                        >
                          {span.text}
                        </span>
                      ))}
                    </span>
                  )
                )}

                {hasLink && (
                  <a
                    href={item.linkUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                    className="absolute -top-2.5 -left-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full p-0.5 shadow-md border border-white z-40 transition-transform hover:scale-110 flex items-center justify-center cursor-pointer"
                    title={`Abrir link em nova aba: ${item.linkUrl}`}
                  >
                    <Link className="w-2.5 h-2.5" />
                  </a>
                )}

                {item.hasBeenEdited && !hasLink && !isSelected && (
                  <span className="absolute -top-1.5 -right-1.5 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                )}

                {isSelected && (
                  <div
                    onMouseDown={(e) => startResize(e, item)}
                    onTouchStart={(e) => startResizeTouch(e, item)}
                    className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-indigo-600 border-2 border-white rounded-full translate-x-1.5 translate-y-1.5 cursor-se-resize z-50 shadow-md hover:scale-125 transition-transform"
                    title="Arraste para redimensionar mantendo as proporções originais"
                  />
                )}
              </div>
            );
          })}
        </div>

        <canvas
          ref={drawingCanvasRef}
          width={containerWidth}
          height={containerHeight}
          className="absolute top-0 left-0 pointer-events-none"
          style={{
            width: `${containerWidth}px`,
            height: `${containerHeight}px`,
            zIndex: 5,
          }}
        />

        {activeDrawingTool !== 'none' && (
          <div
            className={`absolute top-0 left-0 z-30 ${
              activeDrawingTool === 'text'
                ? 'cursor-text'
                : 'cursor-crosshair'
            }`}
            style={{
              width: `${containerWidth}px`,
              height: `${containerHeight}px`,
            }}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
            onTouchCancel={stopDrawing}
          />
        )}

        {cropSelection && (
          <div
            className="absolute border-2 border-dashed border-indigo-600 bg-indigo-500/10 z-30 pointer-events-none"
            style={{
              left: `${Math.min(cropSelection.startX, cropSelection.endX)}px`,
              top: `${Math.min(cropSelection.startY, cropSelection.endY)}px`,
              width: `${Math.abs(cropSelection.endX - cropSelection.startX)}px`,
              height: `${Math.abs(cropSelection.endY - cropSelection.startY)}px`,
            }}
          />
        )}

        <AnimatePresence>
          {isRendering && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-50/70 backdrop-blur-[1px] flex items-center justify-center z-40"
              id="pdf-rendering-spinner"
            >
              <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                <span className="text-xs font-semibold text-slate-600">Sincronizando página...</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {renderError && (
          <div className="absolute inset-0 bg-red-50 flex items-center justify-center p-6 text-center z-40">
            <div className="max-w-md">
              <span className="p-3 bg-red-100 text-red-700 rounded-full inline-block mb-3">⚠️</span>
              <h3 className="font-semibold text-slate-800">Falha ao carregar visual</h3>
              <p className="text-xs text-slate-500 mt-1">{renderError}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
