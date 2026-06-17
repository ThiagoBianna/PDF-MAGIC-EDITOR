export interface PDFTextItem {
  id: string;
  text: string;
  currentText: string;
  pageIndex: number;
  itemIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontName: string;
  hasBeenEdited: boolean;
  textColor?: string;
  bgColor?: string;
  linkUrl?: string;
  isBold?: boolean;
  isItalic?: boolean;
  imageSrc?: string;
  imageWidth?: number;
  imageHeight?: number;
}

export interface PDFPageMetadata {
  pageIndex: number;
  width: number;
  height: number;
  textItems: PDFTextItem[];
}

export interface PDFFileState {
  name: string;
  size: string;
  arrayBuffer: ArrayBuffer;
  numPages: number;
  pages: PDFPageMetadata[];
  isBlankPdf?: boolean;
}

export interface PDFEdit {
  itemId: string;
  pageIndex: number;
  itemIndex: number;
  originalText: string;
  newText: string;
  timestamp: number;
  textColor?: string;
  bgColor?: string;
  linkUrl?: string;
  isBold?: boolean;
  isItalic?: boolean;
  fontSize?: number;
  fontName?: string;
  imageSrc?: string;
  imageWidth?: number;
  imageHeight?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}