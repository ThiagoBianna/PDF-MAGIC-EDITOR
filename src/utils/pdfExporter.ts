import { PDFDocument, rgb, StandardFonts, PDFName, PDFArray, PDFString } from 'pdf-lib';
import { PDFEdit, PDFTextItem } from '../types';
import { parseStyledText } from './pdfEditor';

function hexToPdfRgb(hex: string): { r: number; g: number; b: number } {
  const cleanHex = hex.replace('#', '').trim();
  let r = 0, g = 0, b = 0;

  if (cleanHex.length === 3) {
    r = parseInt(cleanHex[0] + cleanHex[0], 16);
    g = parseInt(cleanHex[1] + cleanHex[1], 16);
    b = parseInt(cleanHex[2] + cleanHex[2], 16);
  } else if (cleanHex.length === 6) {
    r = parseInt(cleanHex.substring(0, 2), 16);
    g = parseInt(cleanHex.substring(2, 4), 16);
    b = parseInt(cleanHex.substring(4, 6), 16);
  }

  return {
    r: Math.min(1, Math.max(0, r / 255)),
    g: Math.min(1, Math.max(0, g / 255)),
    b: Math.min(1, Math.max(0, b / 255)),
  };
}


export async function exportModifiedPdf(
  originalBuffer: ArrayBuffer,
  edits: PDFEdit[],
  originalItems: Map<string, PDFTextItem>,
  pageDrawings?: Record<number, string>
): Promise<ArrayBuffer> {
  try {
    const pdfDoc = await PDFDocument.load(originalBuffer.slice(0));
    const pages = pdfDoc.getPages();

    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const helveticaOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
    const helveticaBoldOblique = await pdfDoc.embedFont(StandardFonts.HelveticaBoldOblique);

    const timesRoman = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    const timesRomanBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
    const timesRomanItalic = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);
    const timesRomanBoldItalic = await pdfDoc.embedFont(StandardFonts.TimesRomanBoldItalic);

    const courier = await pdfDoc.embedFont(StandardFonts.Courier);
    const courierBold = await pdfDoc.embedFont(StandardFonts.CourierBold);
    const courierOblique = await pdfDoc.embedFont(StandardFonts.CourierOblique);
    const courierBoldOblique = await pdfDoc.embedFont(StandardFonts.CourierBoldOblique);

    if (pageDrawings) {
      for (const [pageIdxStr, dataUrl] of Object.entries(pageDrawings)) {
        const pageIdx = parseInt(pageIdxStr, 10);
        if (pageIdx < 0 || pageIdx >= pages.length || !dataUrl) continue;

        try {
          const page = pages[pageIdx];
          const { width, height } = page.getSize();
          
          const pngImage = await pdfDoc.embedPng(dataUrl);

          page.drawImage(pngImage, {
            x: 0,
            y: 0,
            width: width,
            height: height,
          });
        } catch (err) {
          console.error(`Erro ao incorporar desenhos iniciais na página ${pageIdx}:`, err);
        }
      }
    }

    for (const edit of edits) {
      const { pageIndex, itemId, newText, textColor, bgColor, isBold, isItalic, fontSize: editFontSize, fontName: editFontName, imageSrc } = edit;
      
      if (pageIndex < 0 || pageIndex >= pages.length) {
        console.warn(`Página correspondente ao índice ${pageIndex} não encontrada na exportação.`);
        continue;
      }

      const page = pages[pageIndex];
      const originalItem = originalItems.get(itemId);
      
      if (!originalItem) {
        console.warn(`Item original ${itemId} não foi encontrado.`);
        continue;
      }

      const { x: originalX, y: originalY, width: originalWidth, height: originalHeight, fontSize: originalFontSize, fontName: originalFontName } = originalItem;
      const x = edit.x !== undefined ? edit.x : originalX;
      const y = edit.y !== undefined ? edit.y : originalY;
      const width = edit.width !== undefined ? edit.width : originalWidth;
      const height = edit.height !== undefined ? edit.height : (originalHeight !== undefined ? originalHeight : editFontSize !== undefined ? editFontSize * 1.15 : 15);
      const fontSize = editFontSize !== undefined ? editFontSize : originalFontSize;
      const fontName = editFontName !== undefined ? editFontName : originalFontName;


      if (bgColor !== 'transparent') {
        const bgRgb = hexToPdfRgb(bgColor || '#FFFFFF');
        
        const patchX = x - 2;
        const patchY = edit.itemIndex < 0 ? y : y - (fontSize * 0.25);
        const patchW = width + 4;
        const patchH = edit.itemIndex < 0 ? height : fontSize * 1.3;

        page.drawRectangle({
          x: patchX,
          y: patchY,
          width: patchW,
          height: patchH,
          color: rgb(bgRgb.r, bgRgb.g, bgRgb.b),
        });
      }

      if (imageSrc) {
        try {
          let embeddedImage;
          if (imageSrc.startsWith('data:image/png')) {
            embeddedImage = await pdfDoc.embedPng(imageSrc);
          } else if (imageSrc.startsWith('data:image/jpeg') || imageSrc.startsWith('data:image/jpg')) {
            embeddedImage = await pdfDoc.embedJpg(imageSrc);
          } else {
            try {
              embeddedImage = await pdfDoc.embedPng(imageSrc);
            } catch {
              embeddedImage = await pdfDoc.embedJpg(imageSrc);
            }
          }

          if (embeddedImage) {
            const drawX = x;
            const drawY = edit.itemIndex < 0 ? y : y - (fontSize * 0.25);
            const drawW = width;
            const drawH = edit.itemIndex < 0 ? (edit.height !== undefined ? edit.height : height) : (fontSize * 1.3);
            page.drawImage(embeddedImage, {
              x: drawX,
              y: drawY,
              width: drawW,
              height: drawH,
            });
          }
        } catch (imageErr) {
          console.error(`Erro ao incorporar imagem na edição do item ${itemId}:`, imageErr);
        }
      } else {

        const textRgb = hexToPdfRgb(textColor || '#000000');
        const spans = parseStyledText(newText, !!isBold, !!isItalic);
        const lowerFont = fontName.toLowerCase();
        
        let currentX = x;
        for (const span of spans) {
          let sanitizedSpanText = span.text.replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
          if (!sanitizedSpanText) continue;

          const spanNeedsBold = span.isBold;
          const spanNeedsItalic = span.isItalic;
          
          let spanFont = helvetica;
          if (lowerFont.includes('mono') || lowerFont.includes('courier')) {
            if (spanNeedsBold && spanNeedsItalic) spanFont = courierBoldOblique;
            else if (spanNeedsBold) spanFont = courierBold;
            else if (spanNeedsItalic) spanFont = courierOblique;
            else spanFont = courier;
          } else if (lowerFont.includes('times') || lowerFont.includes('serif') || lowerFont.includes('roman')) {
            if (spanNeedsBold && spanNeedsItalic) spanFont = timesRomanBoldItalic;
            else if (spanNeedsBold) spanFont = timesRomanBold;
            else if (spanNeedsItalic) spanFont = timesRomanItalic;
            else spanFont = timesRoman;
          } else {
            if (spanNeedsBold && spanNeedsItalic) spanFont = helveticaBoldOblique;
            else if (spanNeedsBold) spanFont = helveticaBold;
            else if (spanNeedsItalic) spanFont = helveticaOblique;
            else spanFont = helvetica;
          }

          page.drawText(sanitizedSpanText, {
            x: currentX,
            y: y,
            size: fontSize,
            font: spanFont,
            color: rgb(textRgb.r, textRgb.g, textRgb.b),
          });

          try {
            const spanWidth = spanFont.widthOfTextAtSize(sanitizedSpanText, fontSize);
            currentX += spanWidth;
          } catch (e) {
            currentX += sanitizedSpanText.length * (fontSize * 0.48);
          }
        }
      }

      if (edit.linkUrl && edit.linkUrl.trim() !== '') {
        const linkUrl = edit.linkUrl.trim();
        const rectX1 = x;
        const rectY1 = y - (fontSize * 0.2);
        const rectX2 = x + width;
        const rectY2 = y + (fontSize * 1.0);

        const linkAnnot = pdfDoc.context.obj({
          Type: PDFName.of('Annot'),
          Subtype: PDFName.of('Link'),
          Rect: [rectX1, rectY1, rectX2, rectY2],
          Border: [0, 0, 0],
          F: 4,
          A: {
            Type: PDFName.of('Action'),
            S: PDFName.of('URI'),
            URI: PDFString.of(linkUrl),
          },
        });

        const linkAnnotRef = pdfDoc.context.register(linkAnnot);

        let annots = page.node.get(PDFName.of('Annots'));
        if (!annots) {
          annots = pdfDoc.context.obj([]);
          page.node.set(PDFName.of('Annots'), annots);
        }

        const resolvedAnnots = pdfDoc.context.lookup(annots);
        if (resolvedAnnots instanceof PDFArray) {
          resolvedAnnots.push(linkAnnotRef);
        }
      }
    }

    const pdfBytes = await pdfDoc.save();
    return pdfBytes.buffer;
  } catch (error) {
    console.error('Erro na exportação de PDF modificado:', error);
    throw new Error('Falha técnica ao aplicar as alterações do texto no arquivo de saída.');
  }
}
