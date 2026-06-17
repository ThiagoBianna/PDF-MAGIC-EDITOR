import { PDFEdit, PDFPageMetadata, PDFTextItem } from '../types';

export function createPdfEdit(
  item: PDFTextItem,
  newText: string,
  textColor: string = '#000000',
  bgColor: string = '#FFFFFF',
  linkUrl?: string,
  isBold?: boolean,
  isItalic?: boolean,
  fontSize?: number,
  fontName?: string,
  imageSrc?: string,
  imageWidth?: number,
  imageHeight?: number,
  x?: number,
  y?: number,
  width?: number,
  height?: number
): PDFEdit {
  return {
    itemId: item.id,
    pageIndex: item.pageIndex,
    itemIndex: item.itemIndex,
    originalText: item.text,
    newText: newText,
    timestamp: Date.now(),
    textColor,
    bgColor,
    linkUrl,
    isBold,
    isItalic,
    fontSize,
    fontName,
    imageSrc,
    imageWidth,
    imageHeight,
    x,
    y,
    width,
    height
  };
}

export function getUpdatedPageMetadata(
  page: PDFPageMetadata,
  edits: Map<string, PDFEdit>
): PDFPageMetadata {
  const updatedItems = page.textItems.map((item) => {
    const edit = edits.get(item.id);
    if (edit) {
      return {
        ...item,
        currentText: edit.newText,
        textColor: edit.textColor,
        bgColor: edit.bgColor,
        linkUrl: edit.linkUrl,
        isBold: edit.isBold,
        isItalic: edit.isItalic,
        fontSize: edit.fontSize !== undefined ? edit.fontSize : item.fontSize,
        fontName: edit.fontName !== undefined ? edit.fontName : item.fontName,
        imageSrc: edit.imageSrc,
        imageWidth: edit.imageWidth,
        imageHeight: edit.imageHeight,
        x: edit.x !== undefined ? edit.x : item.x,
        y: edit.y !== undefined ? edit.y : item.y,
        width: edit.width !== undefined ? edit.width : item.width,
        height: edit.height !== undefined ? edit.height : item.height,
        hasBeenEdited: true,
      };
    }
    return {
      ...item,
      currentText: item.text,
      textColor: undefined,
      bgColor: undefined,
      linkUrl: undefined,
      isBold: undefined,
      isItalic: undefined,
      imageSrc: undefined,
      imageWidth: undefined,
      imageHeight: undefined,
      hasBeenEdited: false,
    };
  });

  return {
    ...page,
    textItems: updatedItems,
  };
}

export interface EditStats {
  totalPages: number;
  totalTextsDetected: number;
  totalEditedTexts: number;
  editedPagesCount: number;
}

export function calculateEditStats(
  pages: PDFPageMetadata[],
  edits: Map<string, PDFEdit>
): EditStats {
  let totalTextsDetected = 0;
  pages.forEach((p) => {
    totalTextsDetected += p.textItems.length;
  });

  const editedPages = new Set<number>();
  edits.forEach((edit) => {
    editedPages.add(edit.pageIndex);
  });

  return {
    totalPages: pages.length,
    totalTextsDetected,
    totalEditedTexts: edits.size,
    editedPagesCount: editedPages.size,
  };
}

export interface StyledTextSpan {
  text: string;
  isBold: boolean;
  isItalic: boolean;
  color?: string;
}

function rgbToHex(rgbStr: string): string {
  if (!rgbStr) return '#000000';
  if (rgbStr.startsWith('#')) return rgbStr;
  
  const match = rgbStr.match(/\d+/g);
  if (!match || match.length < 3) return rgbStr;
  
  const r = parseInt(match[0], 10);
  const g = parseInt(match[1], 10);
  const b = parseInt(match[2], 10);
  
  return '#' + [r, g, b].map(x => {
    const hex = x.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

export function parseStyledText(
  text: string,
  blockIsBold = false,
  blockIsItalic = false,
  blockColor?: string
): StyledTextSpan[] {
  if (!text) return [];

  let html = text;
  
  if (html.includes('**') || html.includes('*')) {
    html = markdownToHtml(html);
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstChild || doc.body;

  const spans: StyledTextSpan[] = [];

  function traverse(node: Node, bold: boolean, italic: boolean, color?: string) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.nodeValue) {
        spans.push({
          text: node.nodeValue,
          isBold: bold,
          isItalic: italic,
          color: color || blockColor,
        });
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      const tagName = el.tagName.toLowerCase();
      
      let nextBold = bold;
      let nextItalic = italic;
      let nextColor = color;

      if (tagName === 'strong' || tagName === 'b') {
        nextBold = true;
      } else if (tagName === 'em' || tagName === 'i') {
        nextItalic = true;
      } else if (tagName === 'font') {
        const fontColor = el.getAttribute('color');
        if (fontColor) {
          nextColor = rgbToHex(fontColor);
        }
      } else if (tagName === 'span') {
        const styleColor = el.style.color;
        const styleFontWeight = el.style.fontWeight;
        const styleFontStyle = el.style.fontStyle;

        if (styleColor) {
          nextColor = rgbToHex(styleColor);
        }
        if (styleFontWeight === 'bold' || styleFontWeight === '700') {
          nextBold = true;
        }
        if (styleFontStyle === 'italic') {
          nextItalic = true;
        }
      }

      for (let child = el.firstChild; child; child = child.nextSibling) {
        traverse(child, nextBold, nextItalic, nextColor);
      }
    }
  }

  if (root) {
    for (let child = root.firstChild; child; child = child.nextSibling) {
      traverse(child, blockIsBold, blockIsItalic, blockColor);
    }
  }

  return spans;
}

export function markdownToHtml(md: string): string {
  if (!md) return '';
  let html = md;
  html = html.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  return html;
}


export function htmlToMarkdown(html: string): string {
  if (!html) return '';
  
  if (!html.includes('<')) return html;

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstChild || doc.body;

  function cleanNode(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.nodeValue || '';
    }
    
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      const tagName = el.tagName.toLowerCase();
      
      let childContent = '';
      for (let child = el.firstChild; child; child = child.nextSibling) {
        childContent += cleanNode(child);
      }

      if (tagName === 'br') {
        return '\n';
      }
      if (tagName === 'div' || tagName === 'p') {
        return '\n' + childContent;
      }
      if (tagName === 'strong' || tagName === 'b') {
        return `**${childContent}**`;
      }
      if (tagName === 'em' || tagName === 'i') {
        return `*${childContent}*`;
      }
      if (tagName === 'span') {
        const color = el.style.color;
        if (color) {
          return `<span style="color:${color}">${childContent}</span>`;
        }
        return childContent;
      }
      if (tagName === 'font') {
        const color = el.getAttribute('color');
        if (color) {
          return `<span style="color:${color}">${childContent}</span>`;
        }
        return childContent;
      }
      
      return childContent;
    }
    return '';
  }

  let result = '';
  if (root) {
    result = cleanNode(root);
  }
  return result.trim();
}

