import * as pdfjsLib from 'pdfjs-dist';
import { PDFPageMetadata, PDFTextItem } from '../types';

const pdfjsVersion = pdfjsLib.version || '4.10.38';
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsVersion}/build/pdf.worker.min.mjs`;

export async function parsePdfDocument(
  arrayBuffer: ArrayBuffer,
  onProgress?: (progress: number) => void
): Promise<{ numPages: number; pages: PDFPageMetadata[] }> {
  try {
    // Carrega o documento PDF
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(arrayBuffer.slice(0)),
      useSystemFonts: true,
    });

    if (onProgress) {
      loadingTask.onProgress = (progressData) => {
        if (progressData.total > 0) {
          const pct = Math.round((progressData.loaded / progressData.total) * 100);
          onProgress(pct);
        }
      };
    }

    const pdfDoc = await loadingTask.promise;
    const numPages = pdfDoc.numPages;
    const pages: PDFPageMetadata[] = [];

    for (let pageIndex = 0; pageIndex < numPages; pageIndex++) {
      const page = await pdfDoc.getPage(pageIndex + 1);
      const view = page.view; // Coordenadas [x_min, y_min, x_max, y_max]
      
      const width = view[2] - view[0];
      const height = view[3] - view[1];

      // Extrai os blocos de texto
      const textContent = await page.getTextContent();
      const textItems: PDFTextItem[] = [];

      textContent.items.forEach((item: any, itemIndex: number) => {
        // Filtra itens vazios que não contêm visibilidade de texto real
        if (!item.str || item.str.trim() === '') {
          return;
        }

        // Matriz de transformação: [a, b, c, d, e, f]
        // transform[4] = coordenada X original (escala 1.0, bottom-left)
        // transform[5] = coordenada Y original (escala 1.0, bottom-left)
        const transform = item.transform;
        const x = transform[4];
        const y = transform[5];
        
        // Estima o tamanho da fonte com base na altura ou escala vertical de transformação
        const fontSize = Math.abs(transform[3]) || Math.abs(transform[0]) || 12;
        const textWidth = item.width || 50;
        const textHeight = item.height || fontSize;

        textItems.push({
          id: `${pageIndex}-${itemIndex}`,
          text: item.str,
          currentText: item.str,
          pageIndex,
          itemIndex,
          x,
          y,
          width: textWidth,
          height: textHeight,
          fontSize,
          fontName: item.fontName || 'Helvetica',
          hasBeenEdited: false,
        });
      });

      pages.push({
        pageIndex,
        width,
        height,
        textItems,
      });
    }

    return { numPages, pages };
  } catch (error) {
    console.error('Erro ao analisar estruturas do PDF:', error);
    throw new Error('Falha ao ler o PDF. Certifique-se de que é um documento digital e não corrompido.');
  }
}

export function renderPdfPageToCanvas(
  pdfDocBuffer: ArrayBuffer,
  pageIndex: number,
  canvas: HTMLCanvasElement,
  scale: number = 1.5
): {
  promise: Promise<{ width: number; height: number; viewport: any }>;
  cancel: () => void;
} {
  let canceled = false;
  let currentRenderTask: any = null;

  const promise = (async () => {
    const pdfDoc = await pdfjsLib.getDocument({ data: new Uint8Array(pdfDocBuffer.slice(0)) }).promise;
    if (canceled) {
      throw new Error('Render task canceled before start.');
    }

    const page = await pdfDoc.getPage(pageIndex + 1);
    if (canceled) {
      throw new Error('Render task canceled before page retrieval.');
    }
    
    const viewport = page.getViewport({ scale });
    const context = canvas.getContext('2d');
    
    if (!context) {
      throw new Error('Não foi possível obter o contexto 2D do Canvas.');
    }

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    // Renderiza a página do PDF no canvas do HTML5
    const renderContext = {
      canvasContext: context,
      viewport: viewport,
    };

    currentRenderTask = page.render(renderContext as any);
    try {
      await currentRenderTask.promise;
    } catch (err: any) {
      if (err?.name === 'RenderingCancelledException' || err?.message?.includes('cancelled') || err?.message?.includes('canceled')) {
        throw new Error('Render task canceled.');
      }
      throw err;
    }

    return {
      width: viewport.width,
      height: viewport.height,
      viewport
    };
  })();

  return {
    promise,
    cancel: () => {
      canceled = true;
      if (currentRenderTask) {
        try {
          currentRenderTask.cancel();
        } catch (e) {
          // ignore e.g. if already finished or canceled
        }
      }
    }
  };
}
