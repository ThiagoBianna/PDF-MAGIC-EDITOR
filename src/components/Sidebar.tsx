import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, 
  ChevronLeft, 
  ChevronRight, 
  Settings, 
  RefreshCw, 
  Type, 
  Trash2, 
  Check, 
  X,
  FileText,
  Palette,
  Link,
  Paintbrush,
  Eraser,
  Pipette,
  Bold,
  Italic,
  Image,
  PaintBucket,
} from 'lucide-react';
import { PDFPageMetadata, PDFTextItem, PDFEdit } from '../types';
import { parseStyledText, markdownToHtml, htmlToMarkdown } from '../utils/pdfEditor';

interface SidebarProps {
  currentPageIndex: number;
  totalPages: number;
  pageMetadata: PDFPageMetadata | null;
  selectedItem: PDFTextItem | null;
  onItemSelect: (item: PDFTextItem | null) => void;
  onPageChange: (index: number) => void;
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
  }) => void;
  onRemoveEdit: (itemId: string) => void;
  edits: Map<string, PDFEdit>;
  onOpenLinkModal: () => void;
  
  // Drawing Tools Props
  activeDrawingTool: 'none' | 'brush' | 'eraser' | 'text' | 'paintBucket';
  onDrawingToolChange: (tool: 'none' | 'brush' | 'eraser' | 'text' | 'paintBucket') => void;
  drawingColor: string;
  onDrawingColorChange: (color: string) => void;
  drawingThickness: number;
  onDrawingThicknessChange: (thickness: number) => void;
  hasDrawingOnCurrentPage: boolean;
  onClearCurrentPageDrawing: () => void;

  // Nova prop para adicionar imagem customizada
  onAddImage: (imageSrc: string, naturalWidth: number, naturalHeight: number) => void;
  isBlankPdf?: boolean;
}

export function Sidebar({
  currentPageIndex,
  totalPages,
  pageMetadata,
  selectedItem,
  onItemSelect,
  onPageChange,
  onApplyEdit,
  onRemoveEdit,
  edits,
  onOpenLinkModal,
  activeDrawingTool,
  onDrawingToolChange,
  drawingColor,
  onDrawingColorChange,
  drawingThickness,
  onDrawingThicknessChange,
  hasDrawingOnCurrentPage,
  onClearCurrentPageDrawing,
  onAddImage,
  isBlankPdf = false,
}: SidebarProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [editValue, setEditValue] = useState('');
  const [fontColor, setFontColor] = useState('#000000');
  const [backColor, setBackColor] = useState('#FFFFFF');
  const [linkUrl, setLinkUrl] = useState('');
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [fontName, setFontName] = useState('Helvetica');
  const [fontSize, setFontSize] = useState(14);
  const [imageSrc, setImageSrc] = useState<string | undefined>(undefined);
  const [imageWidth, setImageWidth] = useState<number | undefined>(undefined);
  const [imageHeight, setImageHeight] = useState<number | undefined>(undefined);
  const editorRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      const tempImg = new window.Image();
      tempImg.onload = () => {
        onAddImage(base64, tempImg.naturalWidth, tempImg.naturalHeight);
        e.target.value = '';
      };
      tempImg.src = base64;
    };
    reader.readAsDataURL(file);
  };

  const handleEyeDropper = async () => {
    if (typeof window === 'undefined' || !('EyeDropper' in window)) return;
    try {
      const eyeDropper = new (window as any).EyeDropper();
      const result = await eyeDropper.open();
      onDrawingColorChange(result.sRGBHex);
    } catch (err) {
      console.warn('EyeDropper closed or failed', err);
    }
  };

  // Sincroniza o campo de edição quando o item selecionado muda
  useEffect(() => {
    if (selectedItem) {
      setEditValue(selectedItem.currentText);
      if (editorRef.current) {
        editorRef.current.innerHTML = markdownToHtml(selectedItem.currentText);
      }
      setFontColor(selectedItem.textColor || '#000000');
      setBackColor(itemHasCustomBg(selectedItem) ? selectedItem.bgColor! : '#FFFFFF');
      setLinkUrl(selectedItem.linkUrl || '');
      setIsBold(!!selectedItem.isBold);
      setIsItalic(!!selectedItem.isItalic);
      setImageSrc(selectedItem.imageSrc);
      setImageWidth(selectedItem.imageWidth);
      setImageHeight(selectedItem.imageHeight);
      
      let initialFont = 'Helvetica';
      if (selectedItem.fontName) {
        const lower = selectedItem.fontName.toLowerCase();
        if (lower.includes('mono') || lower.includes('courier')) {
          initialFont = 'Courier';
        } else if (lower.includes('times') || lower.includes('serif') || lower.includes('roman')) {
          initialFont = 'TimesRoman';
        }
      }
      setFontName(initialFont);
      setFontSize(Math.round(selectedItem.fontSize || 14));
    } else {
      setEditValue('');
      if (editorRef.current) {
        editorRef.current.innerHTML = '';
      }
      setLinkUrl('');
      setIsBold(false);
      setIsItalic(false);
      setImageSrc(undefined);
      setImageWidth(undefined);
      setImageHeight(undefined);
      setFontName('Helvetica');
      setFontSize(14);
    }
  }, [selectedItem]);

  // Sincroniza a cor do pincel/balde de tinta com a cor da fonte quando o baldinho está ativo
  useEffect(() => {
    if (activeDrawingTool === 'paintBucket') {
      onDrawingColorChange(fontColor);
    }
  }, [activeDrawingTool, fontColor, onDrawingColorChange]);

  function itemHasCustomBg(item: PDFTextItem): boolean {
    return !!item.bgColor && item.bgColor !== 'transparent';
  }

  // Filtra itens de texto na página atual
  const filteredItems = pageMetadata
    ? pageMetadata.textItems.filter((item) =>
        item.text.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.currentText.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : [];

  const handleApply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;

    onApplyEdit({
      itemId: selectedItem.id,
      newText: editValue,
      textColor: fontColor,
      bgColor: backColor,
      linkUrl: linkUrl || undefined,
      isBold,
      isItalic,
      fontName,
      fontSize,
      imageSrc,
      imageWidth,
      imageHeight,
    });
  };

  const handleReset = () => {
    if (!selectedItem) return;
    onRemoveEdit(selectedItem.id);
    setEditValue(selectedItem.text);
    if (editorRef.current) {
      editorRef.current.innerHTML = markdownToHtml(selectedItem.text);
    }
    setFontColor('#000000');
    setBackColor('#FFFFFF');
    setLinkUrl('');
    setIsBold(false);
    setIsItalic(false);
    setImageSrc(undefined);
    setImageWidth(undefined);
    setImageHeight(undefined);
    setFontName('Helvetica');
    setFontSize(14);
  };

  const handleFormatting = (style: 'bold' | 'italic') => {
    const editor = editorRef.current;
    if (!editor) return;

    editor.focus();

    // Verifica se existe uma seleção ativa dentro do editor
    const selection = window.getSelection();
    let hasSelection = false;
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      if (editor.contains(range.startContainer) && editor.contains(range.endContainer)) {
        hasSelection = !range.collapsed && selection.toString().length > 0;
      }
    }

    if (!hasSelection) {
      const range = document.createRange();
      range.selectNodeContents(editor);
      selection?.removeAllRanges();
      selection?.addRange(range);
    }

    document.execCommand(style, false);

    if (!hasSelection) {
      selection?.removeAllRanges();
    }

    const nextHtml = editor.innerHTML;
    const markdown = htmlToMarkdown(nextHtml);
    setEditValue(markdown);
  };

  const handleColorChange = (color: string) => {
    const editor = editorRef.current;
    if (!editor) return;

    editor.focus();

    const selection = window.getSelection();
    let hasSelection = false;
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      if (editor.contains(range.startContainer) && editor.contains(range.endContainer)) {
        hasSelection = !range.collapsed && selection.toString().length > 0;
      }
    }

    if (hasSelection) {
      document.execCommand('foreColor', false, color);
      setFontColor(color);
    } else {
      const range = document.createRange();
      range.selectNodeContents(editor);
      selection?.removeAllRanges();
      selection?.addRange(range);

      document.execCommand('foreColor', false, color);

      selection?.removeAllRanges();

      setFontColor(color);
    }

    const nextHtml = editor.innerHTML;
    const markdown = htmlToMarkdown(nextHtml);
    setEditValue(markdown);
  };

  const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
    const html = e.currentTarget.innerHTML;
    const markdown = htmlToMarkdown(html);
    setEditValue(markdown);
  };

  const fontPalettes = [
    { name: 'Preto', value: '#000000' },
    { name: 'Cinza Escuro', value: '#334155' },
    { name: 'Azul Real', value: '#1E3A8A' },
    { name: 'Vermelho Alerta', value: '#991B1B' },
    { name: 'Verde Sucesso', value: '#065F46' },
  ];

  const bgPalettes = [
    { name: 'Branco Sólido', value: '#FFFFFF' },
    { name: 'Cinza Claro', value: '#F1F5F9' },
    { name: 'Papel Creme', value: '#FEF3C7' },
    { name: 'Transparente', value: 'transparent' },
  ];

  return (
    <div className="w-full h-full flex flex-col shrink-0" id="editor-sidebar-container">

      <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Páginas do Documento
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onPageChange(currentPageIndex - 1)}
            disabled={currentPageIndex === 0}
            className="p-1.5 rounded-md hover:bg-slate-200 disabled:opacity-40 disabled:hover:bg-transparent transition-colors border border-slate-200 bg-white"
            title="Página Anterior"
          >
            <ChevronLeft className="w-4 h-4 text-slate-700" />
          </button>
          <span className="text-sm font-semibold text-slate-700 px-1.5 select-none">
            {currentPageIndex + 1} <span className="text-slate-400 font-normal">/</span> {totalPages}
          </span>
          <button
            onClick={() => onPageChange(currentPageIndex + 1)}
            disabled={currentPageIndex >= totalPages - 1}
            className="p-1.5 rounded-md hover:bg-slate-200 disabled:opacity-40 disabled:hover:bg-transparent transition-colors border border-slate-200 bg-white"
            title="Próxima Página"
          >
            <ChevronRight className="w-4 h-4 text-slate-700" />
          </button>
        </div>
      </div>

      <div className="border-b border-slate-100">
        <AnimatePresence mode="wait">
          {selectedItem ? (
            <motion.div
              key="editor-form"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="p-5 bg-indigo-50/40"
              id="active-editor-panel"
            >
              {selectedItem.imageSrc && !selectedItem.text ? (

                <div className="space-y-4" id="pure-image-editor">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-indigo-900 font-semibold text-sm">
                      <Image className="w-4 h-4 text-indigo-600 animate-pulse" />
                      <span>Propriedades da Imagem</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onItemSelect(null)}
                      className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                      title="Fechar Painel"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="p-4 bg-white border border-slate-200 rounded-xl flex flex-col items-center justify-center gap-3 shadow-2xs">
                    <img 
                      src={selectedItem.imageSrc} 
                      alt="Preview" 
                      className="max-w-full max-h-48 object-contain rounded border border-slate-200 bg-slate-50" 
                      referrerPolicy="no-referrer"
                    />
                    <div className="w-full text-center space-y-1">
                      <p className="text-xs font-bold text-slate-700">Dimensões Renderizadas</p>
                      <p className="text-[10px] font-mono text-indigo-600 font-bold bg-indigo-50 px-2 py-0.5 rounded inline-block">
                        {Math.round(selectedItem.imageWidth !== undefined ? selectedItem.imageWidth : selectedItem.width)}px x {Math.round(selectedItem.imageHeight !== undefined ? selectedItem.imageHeight : selectedItem.height)}px
                      </p>
                    </div>
                    <p className="text-[10px] text-slate-400 text-center font-sans leading-relaxed">
                      Para mover, escolha um ponto no PDF e arraste. Use o puxador azul no canto inferior direito para redimensionar mantendo as proporções.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      onRemoveEdit(selectedItem.id);
                      onItemSelect(null);
                    }}
                    className="w-full bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-semibold py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-colors border border-rose-100 cursor-pointer"
                    title="Remover imagem do PDF"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Remover Imagem de Tela
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-3.5">
                    <div className="flex items-center gap-1.5 text-indigo-900 font-semibold text-sm">
                      <Type className="w-4 h-4" />
                      <span>Editar Bloco de Texto</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const tempInput = document.createElement('input');
                          tempInput.type = 'file';
                          tempInput.accept = 'image/*';
                          tempInput.onchange = (ev: any) => {
                            const file = ev.target.files?.[0];
                            if (!file) return;
                            const reader = new FileReader();
                            reader.onload = () => {
                              const base64 = reader.result as string;
                              const tempImg = new window.Image();
                              tempImg.onload = () => {
                                onAddImage(base64, tempImg.naturalWidth, tempImg.naturalHeight);
                              };
                              tempImg.src = base64;
                            };
                            reader.readAsDataURL(file);
                          };
                          tempInput.click();
                        }}
                        className="text-indigo-600 hover:text-indigo-700 bg-white hover:bg-slate-100 border border-indigo-200 rounded-lg p-1.5 transition-all flex items-center justify-center cursor-pointer shadow-xs border-dashed"
                        title="Adicionar imagem diretamente no PDF com tamanho original"
                      >
                        <Image className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={onOpenLinkModal}
                        className="text-indigo-600 hover:text-indigo-700 bg-white hover:bg-slate-100 border border-indigo-200 rounded-lg p-1.5 transition-all flex items-center justify-center cursor-pointer shadow-xs border-dashed"
                        title="Adicionar / Editar Link (Ctrl + K)"
                      >
                        <Link className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onItemSelect(null)}
                        className="text-slate-400 hover:text-slate-600 p-1"
                        title="Fechar Editor"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <form onSubmit={handleApply} className="space-y-4">

                <div className="text-xs">
                  <span className="text-slate-600 block font-semibold mb-1">Texto Original:</span>
                  <div className="p-2.5 bg-white border border-slate-200 rounded-lg text-slate-500 italic max-h-16 overflow-y-auto break-words select-all">
                    "{selectedItem.text}"
                  </div>
                </div>

                <div>
                  <label htmlFor="edited-text" className="text-xs font-semibold text-slate-600 block mb-1">
                    Novo Texto:
                  </label>
                  <div
                    ref={editorRef}
                    id="edited-text"
                    contentEditable
                    suppressContentEditableWarning
                    onInput={handleInput}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium min-h-[80px] break-words overflow-y-auto cursor-text block relative"
                    placeholder="Escreva a nova versão do texto..."
                    style={{
                      color: fontColor,
                      backgroundColor: backColor === 'transparent' ? '#FFFFFF' : backColor,
                      fontFamily: `"${fontName}", ${
                        fontName.toLowerCase().includes('mono') || fontName.toLowerCase().includes('courier')
                          ? 'monospace'
                          : fontName.toLowerCase().includes('serif') || fontName.toLowerCase().includes('times')
                          ? 'serif'
                          : 'sans-serif'
                      }`,
                      fontSize: `${fontSize}px`,
                      lineHeight: '1.2',
                      fontWeight: isBold ? 'bold' : 'normal',
                      fontStyle: isItalic ? 'italic' : 'normal'
                    }}
                  />
                  <style>{`
                    #edited-text:empty::before {
                      content: attr(placeholder);
                      color: #94a3b8;
                      font-style: italic;
                      pointer-events: none;
                    }
                  `}</style>
                </div>

                    <div className="p-3 bg-white border border-slate-200/80 rounded-xl space-y-3.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                    <Palette className="w-3.5 h-3.5 text-slate-400" />
                    <span>Estilo do PDF</span>
                  </div>

                  <div>
                    <span className="text-[11px] font-medium text-slate-500 block mb-1">Cor da Fonte:</span>
                    <div className="flex items-center gap-1.5">
                      {fontPalettes.map((c) => (
                        <button
                          key={c.value}
                          type="button"
                          onClick={() => handleColorChange(c.value)}
                          className={`w-5 h-5 rounded-full border transition-all ${
                            fontColor === c.value 
                              ? 'ring-2 ring-indigo-500 scale-110 z-10 border-white' 
                              : 'border-slate-200 hover:scale-105'
                          }`}
                          style={{ backgroundColor: c.value }}
                          title={c.name}
                        />
                      ))}
                      <input
                        type="color"
                        value={fontColor}
                        onChange={(e) => handleColorChange(e.target.value)}
                        className="w-5 h-5 cursor-pointer rounded border-0"
                        title="Cor customizada"
                      />
                    </div>
                  </div>

                  <div>
                    <span className="text-[11px] font-medium text-slate-500 block mb-1">Cor de Fundo:</span>
                    <div className="flex items-center gap-1.5">
                      {bgPalettes.map((c) => (
                        <button
                          key={c.value}
                          type="button"
                          onClick={() => setBackColor(c.value)}
                          className={`w-5 h-5 rounded border transition-all relative ${
                            backColor === c.value
                              ? 'ring-2 ring-indigo-500 scale-110 z-10 border-white'
                              : 'border-slate-300 hover:scale-105'
                          }`}
                          style={{
                            backgroundColor: c.value === 'transparent' ? '#FFF' : c.value,
                            backgroundImage: c.value === 'transparent' ? 'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)' : undefined,
                            backgroundSize: c.value === 'transparent' ? '6px 6px' : undefined,
                            backgroundPosition: c.value === 'transparent' ? '0 0, 0 3px, 3px -3px, -3px 0px' : undefined
                          }}
                          title={c.name}
                        />
                      ))}
                      {backColor !== 'transparent' && (
                        <input
                          type="color"
                          value={backColor}
                          onChange={(e) => setBackColor(e.target.value)}
                          className="w-5 h-5 cursor-pointer rounded border-0"
                          title="Fundo customizado"
                        />
                      )}
                    </div>
                  </div>

                  <div className="pt-1">
                    <span className="text-[11px] font-medium text-slate-500 block mb-1.5">Formatação:</span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setIsBold(!isBold)}
                        className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all border cursor-pointer shrink-0 ${
                          isBold
                            ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs font-bold'
                            : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                        }`}
                        title="Negrito (Clique para alternar toda a caixa em negrito)"
                      >
                        <span className="font-extrabold text-sm font-sans">N</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setIsItalic(!isItalic)}
                        className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all border cursor-pointer shrink-0 ${
                          isItalic
                            ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs font-bold'
                            : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                        }`}
                        title="Itálico (Clique para alternar toda a caixa em itálico)"
                      >
                        <Italic className="w-4 h-4" />
                      </button>

                      <div className="flex-1 min-w-[70px]">
                        <select
                          value={fontName}
                          onChange={(e) => setFontName(e.target.value)}
                          className="w-full h-9 py-1 px-1.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 transition-colors text-[11px] font-semibold focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                          title="Tipo de Fonte"
                        >
                          <option value="Helvetica">Helvetica (Sans-Serif)</option>
                          <option value="Inter">Inter (Modern Sans)</option>
                          <option value="Arial">Arial (Standard Sans)</option>
                          <option value="Roboto">Roboto (Google Sans)</option>
                          <option value="Open Sans">Open Sans (Sans-Serif)</option>
                          <option value="Montserrat">Montserrat (Display)</option>
                          <option value="Space Grotesk">Space Grotesk (Tech)</option>
                          <option value="Oswald">Oswald (Bold Display)</option>
                          <option value="TimesRoman">Times (Standard Serif)</option>
                          <option value="Georgia">Georgia (Elegant Serif)</option>
                          <option value="Garamond">Garamond (Editorial)</option>
                          <option value="Playfair Display">Playfair Display (Class)</option>
                          <option value="Lora">Lora (Warm-Serif)</option>
                          <option value="Courier">Courier (Monospace)</option>
                          <option value="JetBrains Mono">JetBrains Mono (Code)</option>
                          <option value="Fira Code">Fira Code (Developer)</option>
                        </select>
                      </div>

                      <div className="w-[55px] shrink-0">
                        <input
                          type="number"
                          min="6"
                          max="72"
                          value={fontSize}
                          onChange={(e) => setFontSize(Math.max(6, Math.min(72, Number(e.target.value) || 12)))}
                          className="w-full h-9 py-1 px-1 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 transition-colors text-xs text-center font-bold focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                          title="Tamanho da Fonte (px)"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-slate-100 pt-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-indigo-950 uppercase tracking-wider">
                        <Paintbrush className="w-3 h-3 text-indigo-500" />
                        <span>Ferramentas de Desenho</span>
                      </div>
                      {activeDrawingTool !== 'none' && (
                        <span className="flex h-1.5 w-1.5 relative">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-indigo-600"></span>
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onDrawingToolChange(activeDrawingTool === 'brush' ? 'none' : 'brush')}
                        className={`flex-1 py-1.5 px-1 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                          activeDrawingTool === 'brush'
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200'
                        }`}
                        title="Desenhar à mão livre sobre o PDF"
                      >
                        <Paintbrush className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => onDrawingToolChange(activeDrawingTool === 'eraser' ? 'none' : 'eraser')}
                        className={`flex-1 py-1.5 px-1 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                          activeDrawingTool === 'eraser'
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200'
                        }`}
                        title="Apagar desenhos na página atual"
                      >
                        <Eraser className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => onDrawingToolChange(activeDrawingTool === 'text' ? 'none' : 'text')}
                        className={`flex-1 py-1.5 px-1 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                          activeDrawingTool === 'text'
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200'
                        }`}
                        title="Adicionar um texto livre em qualquer área do PDF"
                      >
                        <Type className="w-3.5 h-3.5" />
                      </button>

                      {isBlankPdf && (
                        <button
                          type="button"
                          onClick={() => onDrawingToolChange(activeDrawingTool === 'paintBucket' ? 'none' : 'paintBucket')}
                          className={`flex-1 py-1.5 px-1 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                            activeDrawingTool === 'paintBucket'
                              ? 'bg-indigo-600 text-white shadow-xs'
                              : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200'
                          }`}
                          title="Baldinho de Tinta (Preencher área aberta ou tela vazia com cor selecionada)"
                        >
                          <PaintBucket className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {hasDrawingOnCurrentPage && (
                        <button
                          type="button"
                          onClick={onClearCurrentPageDrawing}
                          className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg transition-colors border border-rose-200 cursor-pointer flex items-center justify-center"
                          title="Limpar todos os desenhos da página atual"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {activeDrawingTool === 'text' && (
                      <div className="bg-indigo-50/70 border border-indigo-100 rounded-lg p-2.5 text-indigo-700 space-y-1 animate-pulse">
                        <div className="flex items-center gap-1 font-bold text-[10px] uppercase tracking-wider text-indigo-800">
                          <Type className="w-3.5 h-3.5" />
                          <span>Modo Texto Livre Ativo</span>
                        </div>
                        <p className="text-[10px] leading-relaxed font-medium">
                          <b>Clique em qualquer lugar do PDF</b> para posicionar e adicionar seu texto livre.
                        </p>
                      </div>
                    )}

                    <AnimatePresence>
                      {(activeDrawingTool === 'brush' || activeDrawingTool === 'eraser') && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="space-y-2.5 pt-2 border-t border-slate-100 overflow-hidden"
                          id="drawing-controls-subpanel"
                        >
                          <div>
                            <div className="flex justify-between items-center text-[10px] font-semibold text-slate-500 mb-1">
                              <span>Espessura do traço:</span>
                              <span className="font-mono text-slate-700">{drawingThickness}px</span>
                            </div>
                            <input
                              type="range"
                              min="2"
                              max="30"
                              value={drawingThickness}
                              onChange={(e) => onDrawingThicknessChange(Number(e.target.value))}
                              className="w-full accent-indigo-600 cursor-pointer h-1 bg-slate-200 rounded-lg appearance-none"
                            />
                          </div>

                          {activeDrawingTool === 'brush' && (
                            <div>
                              <span className="text-[10px] font-semibold text-slate-500 block mb-1">Cor do Pincel:</span>
                              <div className="flex items-center justify-between gap-1.5">
                                <div className="flex items-center gap-1 flex-wrap flex-1">
                                  {[
                                    { name: 'Vermelho', value: '#EE1111' },
                                    { name: 'Azul', value: '#1E40AF' },
                                    { name: 'Verde', value: '#065F46' },
                                    { name: 'Preto', value: '#000000' },
                                    { name: 'Amarelo', value: '#EAB308' },
                                  ].map((palette) => (
                                    <button
                                      key={palette.value}
                                      type="button"
                                      onClick={() => onDrawingColorChange(palette.value)}
                                      className={`w-3.5 h-3.5 rounded-full border transition-all ${
                                        drawingColor === palette.value
                                          ? 'ring-1.5 ring-indigo-500 scale-110 z-10 border-white'
                                          : 'border-slate-200 hover:scale-105'
                                      }`}
                                      style={{ backgroundColor: palette.value }}
                                      title={palette.name}
                                    />
                                  ))}

                                  <input
                                    type="color"
                                    value={drawingColor}
                                    onChange={(e) => onDrawingColorChange(e.target.value)}
                                    className="w-3.5 h-3.5 cursor-pointer rounded border-0 bg-transparent p-0"
                                    title="Cor customizada"
                                  />
                                </div>

                                {typeof window !== 'undefined' && 'EyeDropper' in window && (
                                  <button
                                    type="button"
                                    onClick={handleEyeDropper}
                                    className="p-1 bg-white hover:bg-slate-100 border border-slate-200 rounded text-slate-600 transition-colors flex items-center justify-center cursor-pointer shadow-xs"
                                    title="Conta-Gotas (capturar da tela)"
                                  >
                                    <Pipette className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold py-2 px-3 rounded-lg flex items-center justify-center gap-1 transition-colors shadow-sm"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Aplicar
                  </button>

                  {selectedItem.hasBeenEdited && (
                    <button
                      type="button"
                      onClick={handleReset}
                      className="bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-semibold py-2 px-3 rounded-lg flex items-center justify-center gap-1 transition-colors"
                      title="Restaurar valores de impressão originais"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-slate-500" />
                      Desfazer
                    </button>
                  )}
                </div>
              </form>
            </>
          )}
            </motion.div>
          ) : (
            <div key="editor-empty" className="p-5 space-y-5 shadow-inner" id="sidebar-tools-panel">
              <div className="flex items-center gap-1.5 text-indigo-950 font-bold text-xs uppercase tracking-wider">
                <Settings className="w-3.5 h-3.5 text-indigo-600 animate-spin" style={{ animationDuration: '6s' }} />
                <span>Ferramentas de edição Livre</span>
              </div>

              <div className="p-3.5 bg-slate-50/70 border border-slate-200/60 rounded-xl space-y-3.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
                  Escolha o elemento para incluir
                </span>
                
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => onDrawingToolChange(activeDrawingTool === 'brush' ? 'none' : 'brush')}
                    className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer border ${
                      activeDrawingTool === 'brush'
                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm font-bold'
                        : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200 hover:border-slate-300'
                    }`}
                    title="Desenhar à mão livre sobre o PDF"
                  >
                    <Paintbrush className="w-3.5 h-3.5" />
                    Pincel
                  </button>

                  <button
                    type="button"
                    onClick={() => onDrawingToolChange(activeDrawingTool === 'eraser' ? 'none' : 'eraser')}
                    className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer border ${
                      activeDrawingTool === 'eraser'
                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm font-bold'
                        : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200 hover:border-slate-300'
                    }`}
                    title="Apagar desenhos na página atual"
                  >
                    <Eraser className="w-3.5 h-3.5" />
                    Borracha
                  </button>

                  <button
                    type="button"
                    onClick={() => onDrawingToolChange(activeDrawingTool === 'text' ? 'none' : 'text')}
                    className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer border ${
                      activeDrawingTool === 'text'
                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm font-bold'
                        : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200 hover:border-slate-300'
                    }`}
                    title="Adicionar um texto livre em qualquer área do PDF"
                  >
                    <Type className="w-3.5 h-3.5" />
                    Texto
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const customImageInput = document.createElement('input');
                      customImageInput.type = 'file';
                      customImageInput.accept = 'image/*';
                      customImageInput.onchange = (e: any) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = () => {
                          const base64 = reader.result as string;
                          const tempImg = new window.Image();
                          tempImg.onload = () => {
                            onAddImage(base64, tempImg.naturalWidth, tempImg.naturalHeight);
                          };
                          tempImg.src = base64;
                        };
                        reader.readAsDataURL(file);
                      };
                      customImageInput.click();
                    }}
                    className="py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer border bg-white hover:bg-slate-50 text-slate-700 border-slate-200 hover:border-slate-300"
                    title="Adicionar uma imagem diretamente no PDF com tamanho original"
                  >
                    <Image className="w-3.5 h-3.5" />
                    Imagem
                  </button>
                </div>

                {hasDrawingOnCurrentPage && (
                  <button
                    type="button"
                    onClick={onClearCurrentPageDrawing}
                    className="w-full py-2 px-3 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg transition-colors border border-rose-100 cursor-pointer flex items-center justify-center gap-1.5 text-xs font-semibold"
                    title="Limpar todos os desenhos da página atual"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Limpar Desenhos
                  </button>
                )}
              </div>

              {activeDrawingTool === 'text' && (
                <div className="bg-indigo-50/70 border border-indigo-100 rounded-xl p-3.5 text-indigo-700 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-xs uppercase tracking-wider text-indigo-800">
                    <Type className="w-4 h-4 text-indigo-600" />
                    <span>Texto Livre Selecionado</span>
                  </div>
                  <p className="text-[11px] leading-relaxed font-semibold">
                    Selecione qualquer ponto no PDF para inserir e digitar seu texto personalizado de forma livre.
                  </p>
                </div>
              )}

              <AnimatePresence>
                {(activeDrawingTool === 'brush' || activeDrawingTool === 'eraser') && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="p-3.5 bg-white border border-slate-200 rounded-xl space-y-3 overflow-hidden shadow-2xs"
                    id="sidebar-drawing-controls-panel"
                  >
                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 uppercase tracking-wide">
                      <Paintbrush className="w-3.5 h-3.5 text-slate-400" />
                      <span>Configuração do Traço</span>
                    </div>

                    <div>
                      <div className="flex justify-between items-center text-[10px] font-semibold text-slate-500 mb-1">
                        <span>Espessura do pincel:</span>
                        <span className="font-mono text-slate-700">{drawingThickness}px</span>
                      </div>
                      <input
                        type="range"
                        min="2"
                        max="30"
                        value={drawingThickness}
                        onChange={(e) => onDrawingThicknessChange(Number(e.target.value))}
                        className="w-full accent-indigo-600 cursor-pointer h-1 bg-slate-200 rounded-lg appearance-none"
                      />
                    </div>

                    {activeDrawingTool === 'brush' && (
                      <div className="space-y-1.5">
                        <span className="text-[10px] font-semibold text-slate-500 block">Cor do Pincel:</span>
                        <div className="flex items-center justify-between gap-1.5">
                          <div className="flex items-center gap-1 flex-wrap flex-1">
                            {[
                              { name: 'Vermelho', value: '#EE1111' },
                              { name: 'Azul', value: '#1E40AF' },
                              { name: 'Verde', value: '#065F46' },
                              { name: 'Preto', value: '#000000' },
                              { name: 'Amarelo', value: '#EAB308' },
                            ].map((palette) => (
                              <button
                                key={palette.value}
                                type="button"
                                onClick={() => onDrawingColorChange(palette.value)}
                                className={`w-4 h-4 rounded-full border transition-all ${
                                  drawingColor === palette.value
                                    ? 'ring-1.5 ring-indigo-500 scale-110 z-10 border-white'
                                    : 'border-slate-200 hover:scale-105'
                                }`}
                                style={{ backgroundColor: palette.value }}
                                title={palette.name}
                              />
                            ))}

                            <input
                              type="color"
                              value={drawingColor}
                              onChange={(e) => onDrawingColorChange(e.target.value)}
                              className="w-4 h-4 cursor-pointer rounded border-0 bg-transparent p-0"
                              title="Cor customizada"
                            />
                          </div>

                          {typeof window !== 'undefined' && 'EyeDropper' in window && (
                            <button
                              type="button"
                              onClick={handleEyeDropper}
                              className="p-1 bg-white hover:bg-slate-100 border border-slate-200 rounded text-slate-600 transition-colors flex items-center justify-center cursor-pointer shadow-xs"
                              title="Conta-Gotas"
                            >
                              <Pipette className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="text-center p-3.5 border border-slate-200 border-dashed rounded-xl bg-slate-50/50">
                <p className="text-[11px] text-slate-black font-medium">
                  💡 Clique em qualquer texto no PDF para abrir e editar.
                </p>
              </div>
            </div>
          )}
        </AnimatePresence>
      </div>


      <div className="p-4 border-b border-slate-100">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Filtrar textos encontrados..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-4 py-1.5 text-xs text-slate-600 focus:outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500/30 transition-all"
            id="text-filter-input"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3" id="text-items-scroller">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5 text-slate-400" />
          Textos da Página ({filteredItems.length})
        </h3>

        {filteredItems.length > 0 ? (
          filteredItems.map((item) => {
            const isSelected = selectedItem?.id === item.id;
            return (
              <motion.div
                key={item.id}
                onClick={() => onItemSelect(item)}
                className={`p-3 rounded-xl border cursor-pointer text-left transition-all duration-150 ${
                  isSelected
                    ? 'border-indigo-500 bg-indigo-50/20 shadow-sm'
                    : item.hasBeenEdited
                    ? 'border-emerald-200 bg-emerald-50/10 hover:border-emerald-300'
                    : 'border-slate-100 bg-slate-50/50 hover:bg-slate-50/90 hover:border-slate-200'
                }`}
                whileHover={{ scale: 1.01 }}
              >

                <div>
                  {item.hasBeenEdited ? (
                    <div className="space-y-1">
                      <span className="text-[10px] uppercase font-bold text-emerald-600 flex items-center gap-1 mb-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                        Editado
                      </span>
                      <p className="text-sm font-semibold text-slate-800 break-words line-clamp-2">
                        {item.currentText}
                      </p>
                      <p className="text-xs text-slate-400 line-through truncate">
                        Orig: "{item.text}"
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-700 break-words line-clamp-3">
                      {item.text}
                    </p>
                  )}
                </div>

                <div className="mt-2.5 flex items-center gap-3 text-[10px] font-semibold text-slate-400 border-t border-slate-100/60 pt-2">
                  <span>Tamanho: <b className="text-slate-500">{Math.round(item.fontSize)}pt</b></span>
                  <span className="truncate">Fonte: <b className="text-slate-500">{item.fontName.replace('/', '')}</b></span>
                </div>
              </motion.div>
            );
          })
        ) : (
          <div className="text-center py-8" id="empty-search-state">
            <span className="inline-block p-2.5 bg-slate-50 text-slate-400 rounded-full mb-2">🔍</span>
            <p className="text-xs text-slate-500">Nenhum texto selecionável localizado nesta página com o filtro ativo.</p>
          </div>
        )}
      </div>

      <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-slate-500" id="sidebar-footer-stats">
        <span className="flex items-center gap-1.5">
          <RefreshCw className="w-3.5 h-3.5 text-indigo-500 animate-pulse" />
          Edições Pendentes: <b>{edits.size}</b>
        </span>
        <span className="text-slate-400">
          Pág. {currentPageIndex + 1} de {totalPages}
        </span>
      </div>
    </div>
  );
}
