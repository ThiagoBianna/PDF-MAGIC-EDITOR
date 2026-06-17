import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Palette, ShieldCheck, Zap } from 'lucide-react';
import { 
  FileText, 
  Download, 
  FolderOpen, 
  HelpCircle, 
  CheckCircle, 
  AlertCircle, 
  SlidersHorizontal,
  ChevronDown,
  Info,
  ZoomIn,
  ZoomOut,
  Undo2,
  Redo2,
  RefreshCw,
  Clock,
  Link2,
  Trash2,
  ExternalLink,
  Plus,
  Scissors,
  Settings,
  X
} from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import { DropZone } from './components/DropZone';
import { PdfCanvas } from './components/PdfCanvas';
import { Sidebar } from './components/Sidebar';
import { parsePdfDocument } from './utils/pdfViewer';
import { createPdfEdit, getUpdatedPageMetadata } from './utils/pdfEditor';
import { exportModifiedPdf } from './utils/pdfExporter';
import { PDFFileState, PDFTextItem, PDFEdit } from './types';
// @ts-ignore
import appLogo from './assets/images/app_logo_fullbleed_1781584776838.jpg';

function formatBytes(bytes: number, decimals = 2) {
  if (!bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export default function App() {

  const [fileState, setFileState] = useState<PDFFileState | null>(null);
  const [currentPageIndex, setCurrentPageIndex] = useState<number>(0);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [edits, setEdits] = useState<Map<string, PDFEdit>>(new Map());
  
  const [activeDrawingTool, setActiveDrawingTool] = useState<'none' | 'brush' | 'eraser' | 'text' | 'crop' | 'paintBucket'>('none');
  const [drawingColor, setDrawingColor] = useState<string>('#EE1111');
  const [drawingThickness, setDrawingThickness] = useState<number>(6);
  const [pageDrawings, setPageDrawings] = useState<Record<number, string>>({});

  const [undoStack, setUndoStack] = useState<{
    edits: Map<string, PDFEdit>;
    pageDrawings: Record<number, string>;
    pages: any[];
  }[]>([]);
  const [redoStack, setRedoStack] = useState<{
    edits: Map<string, PDFEdit>;
    pageDrawings: Record<number, string>;
    pages: any[];
  }[]>([]);

  const preDragCheckpointRef = useRef<{
    edits: Map<string, PDFEdit>;
    pageDrawings: Record<number, string>;
    pages: any[];
  } | null>(null);

  const handleStartDragOrResize = () => {
    if (!fileState) return;
    preDragCheckpointRef.current = {
      edits: new Map(edits),
      pageDrawings: { ...pageDrawings },
      pages: clonePages(fileState.pages),
    };
  };

  const handleEndDragOrResize = () => {
    if (preDragCheckpointRef.current) {
      setUndoStack(prev => [...prev, preDragCheckpointRef.current!]);
      setRedoStack([]);
      preDragCheckpointRef.current = null;
    }
  };

  const clonePages = (pagesList: any[]) => {
    return pagesList.map(p => ({
      ...p,
      textItems: p.textItems.map((item: any) => ({ ...item }))
    }));
  };

  const pushToHistory = (
    currentEdits = edits,
    currentDrawings = pageDrawings,
    currentPages = fileState?.pages
  ) => {
    if (!fileState || !currentPages) return;
    const checkpoint = {
      edits: new Map(currentEdits),
      pageDrawings: { ...currentDrawings },
      pages: clonePages(currentPages)
    };
    setUndoStack(prev => [...prev, checkpoint]);
    setRedoStack([]);
  };

  const handleUndo = () => {
    if (undoStack.length === 0 || !fileState) return;

    const currentCheckpoint = {
      edits: new Map(edits),
      pageDrawings: { ...pageDrawings },
      pages: clonePages(fileState.pages)
    };
    setRedoStack(prev => [...prev, currentCheckpoint]);

    const previous = undoStack[undoStack.length - 1];
    setUndoStack(prev => prev.slice(0, prev.length - 1));

    setEdits(previous.edits);
    setPageDrawings(previous.pageDrawings);
    setFileState(prev => prev ? {
      ...prev,
      pages: previous.pages
    } : null);

    const elementExists = previous.pages.some(p =>
      p.textItems.some((item: any) => item.id === selectedItemId)
    );
    if (!elementExists) {
      setSelectedItemId(null);
    }
  };

  const handleRedo = () => {
    if (redoStack.length === 0 || !fileState) return;

    const currentCheckpoint = {
      edits: new Map(edits),
      pageDrawings: { ...pageDrawings },
      pages: clonePages(fileState.pages)
    };
    setUndoStack(prev => [...prev, currentCheckpoint]);

    const nextState = redoStack[redoStack.length - 1];
    setRedoStack(prev => prev.slice(0, prev.length - 1));

    setEdits(nextState.edits);
    setPageDrawings(nextState.pageDrawings);
    setFileState(prev => prev ? {
      ...prev,
      pages: nextState.pages
    } : null);
  };

  const [isLoading, setIsLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [systemAlert, setSystemAlert] = useState<{ type: 'error' | 'success'; title: string; message: string } | null>(null);
  
  const [scale, setScale] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < 768 ? 0.75 : 0.95;
    }
    return 0.95;
  });
  const [isCreateDropdownOpen, setIsCreateDropdownOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  useEffect(() => {
    if (selectedItemId !== null && typeof window !== 'undefined' && window.innerWidth < 1024) {
      setIsMobileSidebarOpen(true);
    }
  }, [selectedItemId]);

  const handleCreateBlankPdf = async (orientation: 'portrait' | 'landscape') => {
    setIsCreateDropdownOpen(false);
    setIsLoading(true);
    setLoadingProgress(50);
    setSystemAlert(null);
    setExportSuccess(false);

    try {
      const width = orientation === 'portrait' ? 595.276 : 841.89;
      const height = orientation === 'portrait' ? 841.89 : 595.276;
      
      const pdfDoc = await PDFDocument.create();
      pdfDoc.addPage([width, height]);
      const pdfBytes = await pdfDoc.save();
      
      const defaultItemId = `0-custom-${Date.now()}`;
      const defaultTextItem: PDFTextItem = {
        id: defaultItemId,
        text: "Comece por aqui...",
        currentText: "Comece por aqui...",
        pageIndex: 0,
        itemIndex: -1,
        x: 50,
        y: height - 100,
        width: 250,
        height: 25,
        fontSize: 18,
        fontName: "Helvetica",
        hasBeenEdited: true,
        textColor: "#1E3A8A",
        bgColor: "transparent",
      };

      const newBlankFileState: PDFFileState = {
        name: `Documento em Branco (${orientation === 'portrait' ? 'Retrato' : 'Paisagem'}).pdf`,
        size: '1 KB',
        arrayBuffer: pdfBytes.buffer,
        numPages: 1,
        pages: [
          {
            pageIndex: 0,
            width,
            height,
            textItems: [defaultTextItem]
          }
        ],
        isBlankPdf: true,
      };
      
      const initialEdit = createPdfEdit(
        defaultTextItem,
        "Comece por aqui...",
        "#1E3A8A",
        "transparent",
        undefined,
        false,
        false,
        18,
        "Helvetica"
      );

      const initialEdits = new Map<string, PDFEdit>();
      initialEdits.set(defaultItemId, initialEdit);

      setFileState(newBlankFileState);
      setCurrentPageIndex(0);
      setSelectedItemId(defaultItemId);
      setEdits(initialEdits);
      setPageDrawings({});
      setUndoStack([]);
      setRedoStack([]);

      setSystemAlert({
        type: 'success',
        title: 'PDF em branco criado',
        message: `Iniciado no formato ${orientation === 'portrait' ? 'Retrato' : 'Paisagem'}.`
      });
      setTimeout(() => setSystemAlert(null), 3000);
    } catch (err) {
      console.error(err);
      setSystemAlert({
        type: 'error',
        title: 'Falha ao Criar',
        message: 'Ocorreu um problema ao inicializar o PDF em branco.'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileSelect = async (file: File) => {
    setIsLoading(true);
    setLoadingProgress(0);
    setSystemAlert(null);
    setExportSuccess(false);

    try {
      const buffer = await file.arrayBuffer();
      const parseResult = await parsePdfDocument(buffer, (prog) => {
        setLoadingProgress(prog);
      });

      setFileState({
        name: file.name,
        size: formatBytes(file.size),
        arrayBuffer: buffer,
        numPages: parseResult.numPages,
        pages: parseResult.pages,
      });

      setEdits(new Map());
      setCurrentPageIndex(0);
      setSelectedItemId(null);
      setActiveDrawingTool('none');
      setPageDrawings({});
      setUndoStack([]);
      setRedoStack([]);
    } catch (err: any) {
      console.error(err);
      setSystemAlert({
        type: 'error',
        title: 'Formato ou Leitura Inválida',
        message: err.message || 'Falha técnica ao analisar as instruções vetoriais do PDF. O arquivo pode estar corrompido ou protegido.'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplyEdit = (editPayload: {
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
  }) => {
    if (!fileState) return;

    if (!editPayload.skipHistory) {
      pushToHistory();
    }

    let selectedItem: PDFTextItem | null = null;
    for (const page of fileState.pages) {
      const found = page.textItems.find(item => item.id === editPayload.itemId);
      if (found) {
        selectedItem = found;
        break;
      }
    }

    if (!selectedItem) {
      setSystemAlert({
        type: 'error',
        title: 'Elemento não mapeado',
        message: 'O texto selecionado não pôde ser localizado nos metadados do documento.'
      });
      return;
    }

    const newEdit = createPdfEdit(
      selectedItem, 
      editPayload.newText, 
      editPayload.textColor, 
      editPayload.bgColor, 
      editPayload.linkUrl,
      editPayload.isBold,
      editPayload.isItalic,
      editPayload.fontSize,
      editPayload.fontName,
      editPayload.imageSrc,
      editPayload.imageWidth,
      editPayload.imageHeight,
      editPayload.x,
      editPayload.y,
      editPayload.width,
      editPayload.height
    );
    
    setEdits(prev => {
      const next = new Map(prev);
      next.set(editPayload.itemId, newEdit);
      return next;
    });

    if (editPayload.x === undefined && editPayload.y === undefined) {
      setSystemAlert({
        type: 'success',
        title: 'Alterado com Sucesso',
        message: 'A sua mudança foi salva e será aplicada no arquivo final.'
      });
      setTimeout(() => setSystemAlert(null), 3000);
    }
  };

  const handleRemoveEdit = (itemId: string) => {
    if (!fileState) return;
    pushToHistory();
    setEdits(prev => {
      const next = new Map(prev);
      next.delete(itemId);
      return next;
    });

    if (itemId.includes('-custom-') || itemId.includes('-image-')) {
      setFileState(prev => {
        if (!prev) return null;
        const updatedPages = prev.pages.map((page) => {
          return {
            ...page,
            textItems: page.textItems.filter(item => item.id !== itemId),
          };
        });
        return {
          ...prev,
          pages: updatedPages,
        };
      });
    }
  };

  const handleAddFreeText = (x: number, y: number) => {
    if (!fileState) return;
    pushToHistory();

    const newId = `${currentPageIndex}-custom-${Date.now()}`;
    const newItem: PDFTextItem = {
      id: newId,
      text: "",
      currentText: "Texto livre",
      pageIndex: currentPageIndex,
      itemIndex: -1,
      x: x,
      y: y,
      width: 150,
      height: 20,
      fontSize: 14,
      fontName: "Helvetica",
      hasBeenEdited: true,
      textColor: "#000000",
      bgColor: "transparent",
    };

    const newEdit = createPdfEdit(
      newItem,
      "Texto livre",
      "#000000",
      "transparent",
      undefined,
      false,
      false,
      14,
      "Helvetica"
    );

    setFileState(prev => {
      if (!prev) return null;
      const updatedPages = prev.pages.map((page, idx) => {
        if (idx === currentPageIndex) {
          return {
            ...page,
            textItems: [...page.textItems, newItem],
          };
        }
        return page;
      });
      return {
        ...prev,
        pages: updatedPages,
      };
    });

    setEdits(prev => {
      const next = new Map(prev);
      next.set(newId, newEdit);
      return next;
    });

    setSelectedItemId(newId);

    setActiveDrawingTool('none');

    setSystemAlert({
      type: 'success',
      title: 'Texto livre adicionado',
      message: 'Use as ferramentas do painel de estilos para digitar e estilizar.'
    });
    setTimeout(() => setSystemAlert(null), 3000);
  };

  const handleAddImage = (
    imageSrc: string, 
    naturalWidth: number, 
    naturalHeight: number,
    customCoords?: { x: number; y: number; width: number; height: number }
  ) => {
    if (!fileState) return;
    pushToHistory();

    const newId = `${currentPageIndex}-image-${Date.now()}`;
    const currentPage = fileState.pages[currentPageIndex];
    const pageWidth = currentPage ? currentPage.width : 595.28;
    const pageHeight = currentPage ? currentPage.height : 841.89;

    let displayWidth = naturalWidth;
    let displayHeight = naturalHeight;
    const maxDimension = 260;
    if (displayWidth > maxDimension || displayHeight > maxDimension) {
      if (displayWidth > displayHeight) {
        displayHeight = (displayHeight / displayWidth) * maxDimension;
        displayWidth = maxDimension;
      } else {
        displayWidth = (displayWidth / displayHeight) * maxDimension;
        displayHeight = maxDimension;
      }
    }

    const finalWidth = customCoords ? customCoords.width : displayWidth;
    const finalHeight = customCoords ? customCoords.height : displayHeight;
    const finalX = customCoords ? customCoords.x : ((pageWidth - displayWidth) / 2);
    const finalY = customCoords ? customCoords.y : ((pageHeight - displayHeight) / 2);

    const newItem: PDFTextItem = {
      id: newId,
      text: "",
      currentText: "",
      pageIndex: currentPageIndex,
      itemIndex: -1,
      x: finalX,
      y: finalY,
      width: finalWidth,
      height: finalHeight,
      fontSize: 12,
      fontName: "Helvetica",
      hasBeenEdited: true,
      imageSrc: imageSrc,
      imageWidth: finalWidth,
      imageHeight: finalHeight,
      textColor: "transparent",
      bgColor: "transparent",
    };

    const newEdit = createPdfEdit(
      newItem,
      "",
      "transparent",
      "transparent",
      undefined,
      false,
      false,
      12,
      "Helvetica",
      imageSrc,
      finalWidth,
      finalHeight,
      finalX,
      finalY,
      finalWidth,
      finalHeight
    );

    let coverItem: PDFTextItem | null = null;
    let coverEdit: any = null;
    if (customCoords) {
      const coverId = `${currentPageIndex}-cover-${Date.now()}`;
      coverItem = {
        id: coverId,
        text: "",
        currentText: "",
        pageIndex: currentPageIndex,
        itemIndex: -1,
        x: finalX,
        y: finalY,
        width: finalWidth,
        height: finalHeight,
        fontSize: 12,
        fontName: "Helvetica",
        hasBeenEdited: true,
        textColor: "transparent",
        bgColor: "#FFFFFF",
      };

      coverEdit = createPdfEdit(
        coverItem,
        "",
        "transparent",
        "#FFFFFF",
        undefined,
        false,
        false,
        12,
        "Helvetica",
        undefined,
        undefined,
        undefined,
        finalX,
        finalY,
        finalWidth,
        finalHeight
      );
    }

    setFileState(prev => {
      if (!prev) return null;
      const updatedPages = prev.pages.map((page, idx) => {
        if (idx === currentPageIndex) {
          const newItemsList = [...page.textItems];
          if (coverItem) {
            newItemsList.push(coverItem);
          }
          newItemsList.push(newItem);
          return {
            ...page,
            textItems: newItemsList,
          };
        }
        return page;
      });
      return {
        ...prev,
        pages: updatedPages,
      };
    });

    setEdits(prev => {
      const next = new Map(prev);
      next.set(newId, newEdit);
      if (coverItem && coverEdit) {
        next.set(coverItem.id, coverEdit);
      }
      return next;
    });

    setSelectedItemId(newId);

    setActiveDrawingTool('none');

    setSystemAlert({
      type: 'success',
      title: customCoords ? 'Área recortada e isolada' : 'Imagem adicionada',
      message: customCoords 
        ? 'A região selecionada foi recortada e preenchida com fundo branco atrás.' 
        : 'Modifique as dimensões usando o puxador no PDF e arraste livremente.'
    });
    setTimeout(() => setSystemAlert(null), 3000);
  };

  const handleExportPdf = async () => {
    if (!fileState) return;
    if (edits.size === 0 && Object.keys(pageDrawings).length === 0) {
      setSystemAlert({
        type: 'error',
        title: 'Nenhuma alteração pendente',
        message: 'Por favor, faça pelo menos uma alteração de texto ou rabisco de desenho antes de salvar o documento.'
      });
      return;
    }

    setIsExporting(true);
    setSystemAlert(null);

    try {
      const originalItems = new Map<string, PDFTextItem>();
      fileState.pages.forEach(p => {
        p.textItems.forEach(item => {
          originalItems.set(item.id, item);
        });
      });

      const outputBuffer = await exportModifiedPdf(
        fileState.arrayBuffer,
        Array.from(edits.values()),
        originalItems,
        pageDrawings
      );

      const blob = new Blob([outputBuffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      const cleanName = fileState.name.replace(/\.[^/.]+$/, "");
      link.download = `${cleanName}_editado.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setExportSuccess(true);
    } catch (err: any) {
      console.error(err);
      setSystemAlert({
        type: 'error',
        title: 'Erro na compilação do PDF',
        message: err.message || 'Falha ao reescrever os fluxos binários do PDF.'
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleCloseDocument = () => {
    setFileState(null);
    setEdits(new Map());
    setSelectedItemId(null);
    setCurrentPageIndex(0);
    setExportSuccess(false);
    setSystemAlert(null);
    setActiveDrawingTool('none');
    setPageDrawings({});
    setUndoStack([]);
    setRedoStack([]);
  };

  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [linkUrlInput, setLinkUrlInput] = useState('');
  const [linkError, setLinkError] = useState('');

  const activePageMetadata = fileState
    ? getUpdatedPageMetadata(fileState.pages[currentPageIndex], edits)
    : null;

  const selectedItem = (fileState && selectedItemId && activePageMetadata)
    ? activePageMetadata.textItems.find(item => item.id === selectedItemId) || null
    : null;

  useEffect(() => {
    if (selectedItem && selectedItem.linkUrl) {
      setLinkUrlInput(selectedItem.linkUrl);
      setLinkError('');
      setIsLinkModalOpen(true);
    }
  }, [selectedItem?.id]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        if (selectedItem) {
          e.preventDefault();
          setLinkUrlInput(selectedItem.linkUrl || '');
          setLinkError('');
          setIsLinkModalOpen(true);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedItem]);

  useEffect(() => {
    const handleUndoRedoKeys = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key.toLowerCase() === 'z') {
          e.preventDefault();
          if (e.shiftKey) {
            handleRedo();
          } else {
            handleUndo();
          }
        } else if (e.key.toLowerCase() === 'y') {
          e.preventDefault();
          handleRedo();
        }
      }
    };
    window.addEventListener('keydown', handleUndoRedoKeys);
    return () => window.removeEventListener('keydown', handleUndoRedoKeys);
  }, [undoStack, redoStack, edits, pageDrawings, fileState]);

  const isValidUrl = (url: string) => {
    const cleanUrl = url.trim();
    if (cleanUrl === '') return true;
    return cleanUrl.startsWith('https://') || cleanUrl.startsWith('http://') || cleanUrl.startsWith('mailto:');
  };

  const handleApplyLink = (url: string) => {
    if (!selectedItem) return;
    const cleanUrl = url.trim();

    if (!isValidUrl(cleanUrl)) {
      setLinkError('Por favor, insira uma URL válida que inicie com http://, https:// ou mailto:');
      return;
    }

    handleApplyEdit({
      itemId: selectedItem.id,
      newText: selectedItem.currentText,
      textColor: selectedItem.textColor || '#000000',
      bgColor: selectedItem.bgColor || '#FFFFFF',
      linkUrl: cleanUrl !== '' ? cleanUrl : undefined,
      isBold: selectedItem.isBold,
      isItalic: selectedItem.isItalic,
    });

    setIsLinkModalOpen(false);
    setLinkError('');
  };

  const handleRemoveLink = () => {
    if (!selectedItem) return;
    handleApplyEdit({
      itemId: selectedItem.id,
      newText: selectedItem.currentText,
      textColor: selectedItem.textColor || '#000000',
      bgColor: selectedItem.bgColor || '#FFFFFF',
      linkUrl: undefined,
      isBold: selectedItem.isBold,
      isItalic: selectedItem.isItalic,
    });

    setIsLinkModalOpen(false);
    setLinkError('');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-800" id="main-app-viewport">

      <header className="sticky top-0 bg-white border-b border-slate-200 min-h-16 h-16 shrink-0 flex items-center justify-between px-3 md:px-6 z-50 shadow-sm gap-2" id="main-header">
        <div className="flex items-center gap-1.5 md:gap-2.5 shrink-0">

          <div className="w-8 h-8 md:w-11 h-11 rounded-lg md:rounded-xl overflow-hidden shrink-0 flex items-center justify-center">
            <img 
              src={appLogo} 
              alt="PDF Magic Editor Logo"
              className="w-full h-full object-cover select-none"
              referrerPolicy="no-referrer"
            />
          </div>
          <div>
            <h1 className="text-xs md:text-base font-bold text-slate-900 tracking-tight leading-none">
              PDF Magic Editor
            </h1>
            <span className="text-[8px] md:text-[10px] text-slate-400 font-medium">
              Edite seu PDF como mágica!
            </span>
          </div>
        </div>

        {fileState && (
          <div className="flex items-center gap-1.5 md:gap-3 px-2 md:px-4 py-1.5 bg-slate-100 rounded-full border border-slate-200/60 max-w-[140px] xs:max-w-[180px] sm:max-w-xs md:max-w-md truncate" id="loaded-file-badge">
            <FileText className="w-4 h-4 text-indigo-500 shrink-0 hidden xs:block" />
            <div className="text-[10px] md:text-xs text-left truncate">
              <p className="font-semibold text-slate-700 truncate max-w-[45px] xs:max-w-[80px] sm:max-w-xs">{fileState.name}</p>
              <p className="text-[8px] md:text-[10px] text-slate-500 hidden sm:block">{fileState.size} • {fileState.numPages} pág.</p>
            </div>
            <button 
              onClick={handleCloseDocument}
              className="text-[9px] md:text-[10px] font-bold text-red-500 hover:text-red-700 transition-colors ml-1 uppercase py-0.5 px-1.5 md:px-2 bg-white rounded-full border border-slate-200 hover:shadow-xs shrink-0 cursor-pointer"
              title="Fechar e abrir novo arquivo"
            >
              Fechar
            </button>
          </div>
        )}

        <div className="flex items-center gap-1.5 md:gap-3">
          {fileState && (
            <button
              onClick={handleExportPdf}
              disabled={(edits.size === 0 && Object.keys(pageDrawings).length === 0) || isExporting}
              className={`flex items-center gap-1.5 md:gap-2 text-[10px] md:text-xs font-bold py-1.5 px-2 md:py-2.5 md:px-4 rounded-lg transition-all shadow-xs ${
                edits.size > 0 || Object.keys(pageDrawings).length > 0
                  ? 'bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer hover:shadow-sm'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
              }`}
              title="Aplicar edições pendentes e exportar novo arquivo"
              id="export-pdf-action-btn"
            >
              {isExporting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Compilando...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>Salvar PDF ({edits.size + Object.keys(pageDrawings).length})</span>
                </>
              )}
            </button>
          )}
          {!fileState ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsCreateDropdownOpen(!isCreateDropdownOpen)}
                className="text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 py-2.5 px-4 rounded-lg flex items-center gap-1.5 shadow-xs transition-all cursor-pointer hover:shadow-xs border border-white"
                title="Criar PDF A4 em Branco"
              >
                <Plus className="w-4 h-4" />
                <span>Criar PDF</span>
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              {isCreateDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40 cursor-default"
                    onClick={() => setIsCreateDropdownOpen(false)}
                  />
                  <div className="absolute right-0 mt-2 w-48 bg-white border border-slate-200 rounded-xl shadow-lg z-50 overflow-hidden font-sans text-xs divide-y divide-slate-100 animate-fadeIn text-left">
                    <div className="px-3 py-2 text-[10px] text-slate-400 font-semibold uppercase tracking-wider bg-slate-50">
                      Escolha o Formato
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCreateBlankPdf('portrait')}
                      className="w-full text-left py-2.5 px-3.5 hover:bg-slate-50 text-slate-700 font-medium transition-colors cursor-pointer flex items-center justify-between"
                    >
                      <span>Retrato</span>
                      <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">A4</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCreateBlankPdf('landscape')}
                      className="w-full text-left py-2.5 px-3.5 hover:bg-slate-50 text-slate-700 font-medium transition-colors cursor-pointer flex items-center justify-between"
                    >
                      <span>Paisagem</span>
                      <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">Certificados</span>
                    </button>
                  </div>
                </>
              )}
            </div>) : null}

        </div>
      </header>

      <main className="flex-1 flex flex-col min-h-0 overflow-hidden" id="main-content-layout">
        <AnimatePresence mode="wait">
          {!fileState ? (

            <motion.div
              key="landing-setup"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col justify-center py-10 overflow-y-auto"
            >
              <div className="text-center mb-8 px-4">
                <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
                  Edite seu PDF online
                </h1>
                <p className="text-slate-500 text-sm mt-2 max-w-xl mx-auto leading-relaxed">
                  Altere o que quiser! Uma poderosa ferramenta de edição 100% segura.
                </p>
              </div>

              <DropZone
                onFileSelect={handleFileSelect}
                isLoading={isLoading}
                loadingProgress={loadingProgress}
              />

              <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 px-4 mt-12 mb-6" id="saas-benefits-grid">
                <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs text-left">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
                      <Palette className="w-4 h-4" />
                    </div>
                    <h3 className="font-bold text-slate-900 text-sm">Design Original</h3>
                  </div>
                  <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                    Modifique arquivos sem bagunçar nada. Garantindo que seu PDF continue com um visual profissional após edição.
                  </p>
                </div>

                <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs text-left">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
                      <ShieldCheck className="w-4 h-4" />
                    </div>
                    <h3 className="font-bold text-slate-900 text-sm">100% Seguro</h3>
                  </div>
                  <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                    Todo o processo de edição é feito direto no seu navegador, nós não recebemos seus dados
                  </p>
                </div>

                <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs text-left">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-yellow-50 flex items-center justify-center text-yellow-600 shrink-0">
                      <Zap className="w-4 h-4" />
                    </div>
                    <h3 className="font-bold text-slate-900 text-sm">Fácil e Rápido</h3>
                  </div>
                  <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                    Altere com tranquilidade qualquer texto. De forma visual, rápida e intuitiva, sem precisar de nenhuma configuração.
                  </p>
                </div>
              </div>
            </motion.div>
          ) : (

            <motion.div
              key="workspace-active"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col lg:flex-row overflow-hidden"
              id="active-workspace-panel"
            >

              <div className="flex-1 flex flex-col min-h-0 bg-slate-100 overflow-hidden relative">

                <div className="bg-white border-b border-slate-200 px-3 sm:px-5 py-2.5 flex items-center justify-center sm:justify-between gap-2 shrink-0 shadow-xs" id="canvas-toolbar">

                  <div className="hidden sm:flex items-center gap-1.5 text-xs font-semibold text-slate-600 shrink-0">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span>Visualização do Arquivo</span>
                  </div>

                  <div className="flex items-center justify-center sm:justify-start w-full sm:w-auto gap-2 sm:gap-3">

                    <button
                      type="button"
                      onClick={() => setIsMobileSidebarOpen(prev => !prev)}
                      className="lg:hidden flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-1.5 px-2.5 rounded-lg shadow-xs transition-colors cursor-pointer border border-indigo-700"
                      title="Alternar painel lateral de ferramentas e edição"
                    >
                      <Settings className="w-3.5 h-3.5" />
                      <span>Painel</span>
                    </button>

                    <button
                      onClick={() => setActiveDrawingTool(prev => prev === 'crop' ? 'none' : 'crop')}
                      className={`p-1.5 rounded-lg border transition-all cursor-pointer shadow-2xs ${
                        activeDrawingTool === 'crop'
                          ? 'bg-indigo-600 border-indigo-600 text-white'
                          : 'bg-white hover:bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300'
                      }`}
                      title="Selecionar área e recortar"
                    >
                      <Scissors className="w-4 h-4" />
                    </button>

                    <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs shadow-2xs">
                      <button
                        onClick={handleUndo}
                        disabled={undoStack.length === 0}
                        className="p-1 px-1.5 rounded hover:bg-white disabled:opacity-35 disabled:hover:bg-transparent text-slate-600 transition-colors cursor-pointer disabled:cursor-not-allowed"
                        title="Desfazer última alteração (Ctrl+Z)"
                      >
                        <Undo2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={handleRedo}
                        disabled={redoStack.length === 0}
                        className="p-1 px-1.5 rounded hover:bg-white disabled:opacity-35 disabled:hover:bg-transparent text-slate-600 transition-colors cursor-pointer disabled:cursor-not-allowed"
                        title="Refazer última alteração (Ctrl+Y)"
                      >
                        <Redo2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs shadow-2xs">
                      <button
                        onClick={() => setScale(prev => Math.max(0.5, prev - 0.25))}
                        disabled={scale <= 0.5}
                        className="p-1 px-1.5 rounded hover:bg-white disabled:opacity-30 disabled:hover:bg-transparent text-slate-600 transition-colors cursor-pointer disabled:cursor-not-allowed"
                        title="Reduzir escala"
                      >
                        <ZoomOut className="w-3.5 h-3.5" />
                      </button>
                      <span className="font-bold text-slate-700 select-none min-w-[36px] text-center">
                        {Math.round(scale * 100)}%
                      </span>
                      <button
                        onClick={() => setScale(prev => Math.min(5.0, prev + 0.25))}
                        disabled={scale >= 5.0}
                        className="p-1 px-1.5 rounded hover:bg-white disabled:opacity-30 disabled:hover:bg-transparent text-slate-600 transition-colors cursor-pointer disabled:cursor-not-allowed"
                        title="Aumentar escala"
                      >
                        <ZoomIn className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-auto p-6 flex justify-center items-start" id="canvas-scroll-viewport">
                  <div className="relative">
                    <PdfCanvas
                      pdfBuffer={fileState.arrayBuffer}
                      pageIndex={currentPageIndex}
                      pageMetadata={activePageMetadata}
                      selectedItemId={selectedItemId}
                      onItemSelect={(item) => setSelectedItemId(item.id)}
                      scale={scale}
                      activeDrawingTool={activeDrawingTool}
                      drawingColor={drawingColor}
                      drawingThickness={drawingThickness}
                      pageDrawings={pageDrawings}
                      onDrawingChange={(pageIdx, dataUrl) => {
                        pushToHistory();
                        setPageDrawings(prev => ({ ...prev, [pageIdx]: dataUrl }));
                      }}
                      onAddFreeText={handleAddFreeText}
                      onApplyEdit={handleApplyEdit}
                      onAddImage={handleAddImage}
                      onStartDragOrResize={handleStartDragOrResize}
                      onEndDragOrResize={handleEndDragOrResize}
                    />
                  </div>
                </div>

      <AnimatePresence>
        {exportSuccess && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 text-center" id="export-success-overlay">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="max-w-md w-full p-8 bg-white border border-slate-200 rounded-2xl shadow-2xl flex flex-col items-center"
            >
              <div className="p-4 bg-emerald-50 text-emerald-600 rounded-full mb-4">
                <CheckCircle className="w-12 h-12" />
              </div>
              <h2 className="text-xl font-bold text-slate-900">PDF Compilado com Sucesso!</h2>
              <p className="text-sm text-slate-500 mt-2 leading-relaxed">
                As alterações foram gravadas nas posições de memória correspondentes. O arquivo editado foi baixado automaticamente no seu navegador.
              </p>

              <div className="mt-6 flex flex-col gap-2 w-full">
                <button
                  onClick={() => setExportSuccess(false)}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold py-2.5 px-4 rounded-lg shadow-sm transition-colors cursor-pointer w-full"
                >
                  Continuar Editando o Documento
                </button>
                <button
                  onClick={handleCloseDocument}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold py-2.5 px-4 rounded-lg transition-colors w-full cursor-pointer"
                >
                  Carregar Outro Arquivo PDF
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {isLinkModalOpen && selectedItem && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 rounded-none border-none" id="link-setup-overlay">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="max-w-md w-full p-6 bg-white border border-slate-200 rounded-2xl shadow-2xl flex flex-col text-left"
            >

              <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3 mb-4">
                <div className="w-8 h-8 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center">
                  <Link2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-950 text-sm">Associar Hiperlink ao Texto</h3>
                  <p className="text-[10px] text-slate-400 font-medium">Insira parâmetros de redirecionamento interativo</p>
                </div>
              </div>

              <div className="mb-4">
                <label className="text-xs font-semibold text-slate-500 block mb-1">Texto Selecionado (Somente Leitura):</label>
                <textarea
                  className="w-full bg-slate-50 border border-slate-200 text-slate-400 text-xs rounded-lg p-2.5 italic cursor-not-allowed select-none focus:outline-none"
                  value={`"${selectedItem.currentText}"`}
                  disabled
                  rows={2}
                />
              </div>

              <div className="mb-5">
                <label htmlFor="href-link-input" className="text-xs font-bold text-slate-700 block mb-1">
                  Endereço de Destino (URL):
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-slate-400 text-[10px] font-bold uppercase font-mono bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">URI</span>
                  <input
                    type="text"
                    id="href-link-input"
                    className="w-full bg-slate-50/50 border border-slate-300 rounded-lg pl-14 pr-4 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-semibold"
                    placeholder="https://exemplo.com ou mailto:usuario@provedor.com"
                    value={linkUrlInput}
                    onChange={(e) => setLinkUrlInput(e.target.value)}
                    autoFocus
                  />
                </div>

                <span className="text-[10px] text-slate-400 mt-1 block">
                  Formatos aceitos: <b className="text-slate-500">http://</b>, <b className="text-slate-500">https://</b> ou <b className="text-slate-500">mailto:</b>
                </span>

                {linkError && (
                  <div className="mt-3 p-2.5 bg-red-50 border border-red-200 rounded-lg text-red-600 text-xs font-medium leading-normal flex items-start gap-1.5 animate-pulse">
                    <span className="mt-0.5">⚠️</span>
                    <span>{linkError}</span>
                  </div>
                )}
              </div>

              <div className="flex gap-2.5 justify-end">
                {selectedItem.linkUrl && (
                  <button
                    onClick={handleRemoveLink}
                    className="bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold px-3.5 py-2.5 rounded-lg mr-auto flex items-center gap-1 transition-colors hover:shadow-xs cursor-pointer border border-red-200"
                    title="Remover link existente"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Limpar Link
                  </button>
                )}
                
                <button
                  type="button"
                  onClick={() => {
                    setIsLinkModalOpen(false);
                    setLinkError('');
                  }}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold px-4 py-2.5 rounded-lg transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyLink(linkUrlInput)}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2.5 rounded-lg transition-all cursor-pointer shadow-sm border-none"
                >
                  Aplicar Link
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
              </div>

              <div className="hidden lg:block w-96 h-full border-l border-slate-200 bg-white flex-shrink-0">
                <Sidebar
                  currentPageIndex={currentPageIndex}
                  totalPages={fileState.numPages}
                  pageMetadata={activePageMetadata}
                  selectedItem={selectedItem}
                  onItemSelect={(item) => setSelectedItemId(item ? item.id : null)}
                  onPageChange={(idx) => {
                    setCurrentPageIndex(idx);
                    setSelectedItemId(null); // reseta foco
                  }}
                  onApplyEdit={handleApplyEdit}
                  onRemoveEdit={handleRemoveEdit}
                  edits={edits}
                  onOpenLinkModal={() => {
                    if (selectedItem) {
                      setLinkUrlInput(selectedItem.linkUrl || '');
                      setLinkError('');
                      setIsLinkModalOpen(true);
                    } else {
                      setSystemAlert({
                        type: 'error',
                        title: 'Selecione um Texto',
                        message: 'Por favor, selecione primeiro qualquer segmento de texto no PDF para associar um hiperlink.'
                      });
                      setTimeout(() => setSystemAlert(null), 3000);
                    }
                  }}
                  activeDrawingTool={activeDrawingTool}
                  onDrawingToolChange={setActiveDrawingTool}
                  drawingColor={drawingColor}
                  onDrawingColorChange={setDrawingColor}
                  drawingThickness={drawingThickness}
                  onDrawingThicknessChange={setDrawingThickness}
                  hasDrawingOnCurrentPage={!!pageDrawings[currentPageIndex]}
                  onClearCurrentPageDrawing={() => setPageDrawings(prev => {
                    const next = { ...prev };
                    delete next[currentPageIndex];
                    return next;
                  })}
                  onAddImage={handleAddImage}
                  isBlankPdf={fileState?.isBlankPdf || false}
                />
              </div>

              <AnimatePresence>
                {isMobileSidebarOpen && (
                  <div className="fixed inset-0 z-50 lg:hidden" id="mobile-sidebar-drawer-root">

                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 0.5 }}
                      exit={{ opacity: 0 }}
                      onClick={() => setIsMobileSidebarOpen(false)}
                      className="absolute inset-0 bg-slate-900"
                    />

                    <motion.div
                      initial={{ y: '100%' }}
                      animate={{ y: 0 }}
                      exit={{ y: '100%' }}
                      transition={{ type: 'spring', damping: 28, stiffness: 280 }}
                      className="absolute bottom-0 left-0 right-0 h-[80vh] bg-white rounded-t-3xl shadow-2xl flex flex-col overflow-hidden border-t border-slate-200"
                    >

                      <div className="h-12 flex items-center justify-between px-5 border-b border-slate-100 shrink-0 bg-slate-50 relative select-none">
                        <div className="w-12 h-1.5 bg-slate-300 rounded-full mx-auto absolute left-1/2 -translate-x-1/2 top-3" />
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-2">Configuração & Desenho</span>
                        <button
                          type="button"
                          onClick={() => setIsMobileSidebarOpen(false)}
                          className="bg-slate-200 hover:bg-slate-300 text-slate-700 p-1.5 rounded-full cursor-pointer transition-colors mt-2"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="flex-1 overflow-y-auto bg-white">
                        <Sidebar
                          currentPageIndex={currentPageIndex}
                          totalPages={fileState.numPages}
                          pageMetadata={activePageMetadata}
                          selectedItem={selectedItem}
                          onItemSelect={(item) => setSelectedItemId(item ? item.id : null)}
                          onPageChange={(idx) => {
                            setCurrentPageIndex(idx);
                            setSelectedItemId(null);
                          }}
                          onApplyEdit={handleApplyEdit}
                          onRemoveEdit={handleRemoveEdit}
                          edits={edits}
                          onOpenLinkModal={() => {
                            if (selectedItem) {
                              setLinkUrlInput(selectedItem.linkUrl || '');
                              setLinkError('');
                              setIsLinkModalOpen(true);
                            } else {
                              setSystemAlert({
                                type: 'error',
                                title: 'Selecione um Texto',
                                message: 'Por favor, selecione primeiro qualquer segmento de texto no PDF para associar um hiperlink.'
                              });
                              setTimeout(() => setSystemAlert(null), 3000);
                            }
                          }}
                          activeDrawingTool={activeDrawingTool}
                          onDrawingToolChange={setActiveDrawingTool}
                          drawingColor={drawingColor}
                          onDrawingColorChange={setDrawingColor}
                          drawingThickness={drawingThickness}
                          onDrawingThicknessChange={setDrawingThickness}
                          hasDrawingOnCurrentPage={!!pageDrawings[currentPageIndex]}
                          onClearCurrentPageDrawing={() => setPageDrawings(prev => {
                            const next = { ...prev };
                            delete next[currentPageIndex];
                            return next;
                          })}
                          onAddImage={handleAddImage}
                          isBlankPdf={fileState?.isBlankPdf || false}
                        />
                      </div>
                    </motion.div>
                  </div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <AnimatePresence>
        {systemAlert && (
          <motion.div
            initial={{ transform: 'translateY(100px)', opacity: 0 }}
            animate={{ transform: 'translateY(0)', opacity: 1 }}
            exit={{ transform: 'translateY(100px)', opacity: 0 }}
            className="fixed bottom-6 left-6 z-50 max-w-sm"
            id="system-floating-toast"
          >
            <div className={`p-4 rounded-xl border shadow-xl flex gap-3 ${
              systemAlert.type === 'error'
                ? 'bg-red-50 border-red-200 text-red-900'
                : 'bg-emerald-50 border-emerald-200 text-emerald-900'
            }`}>
              {systemAlert.type === 'error' ? (
                <AlertCircle className="w-5 h-5 shrink-0 text-red-500 mt-0.5" />
              ) : (
                <CheckCircle className="w-5 h-5 shrink-0 text-emerald-500 mt-0.5" />
              )}
              <div className="text-left">
                <p className="text-xs font-bold">{systemAlert.title}</p>
                <p className="text-[11px] opacity-90 mt-0.5 leading-relaxed">{systemAlert.message}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
