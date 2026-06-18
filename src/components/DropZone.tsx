import React, { useState } from 'react';
import { motion } from 'motion/react';
import { FileUp, Info, AlertTriangle } from 'lucide-react';

interface DropZoneProps {
  onFileSelect: (file: File) => void;
  isLoading: boolean;
  loadingProgress: number;
}

export function DropZone({ onFileSelect, isLoading, loadingProgress }: DropZoneProps) {
  const [isDragActive, setIsDragActive] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  };

  const validateAndProcess = (file: File) => {
    if (file.type !== "application/pdf") {
      setErrorText("Arquivo inválido. Por favor, envie apenas documentos em formato PDF.");
      return;
    }
    setErrorText(null);
    onFileSelect(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndProcess(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      validateAndProcess(e.target.files[0]);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto px-4">
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="bg-white rounded-2xl border border-slate-200 shadow-md overflow-hidden"
      >
        <div className="p-8 md:p-12">
          {errorText && (
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="mb-6 p-4 bg-red-50 rounded-xl border border-red-100 flex items-start gap-3 text-red-700 text-sm"
              id="upload-error-alert"
            >
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Isto não é um PDF!</p>
                <p className="text-red-600/90 mt-0.5">{errorText}</p>
              </div>
            </motion.div>
          )}

          {!isLoading ? (
            <label
              htmlFor="pdf-file-loader"
              className={`relative flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-10 md:p-14 cursor-pointer transition-all duration-300 group ${
                isDragActive
                  ? 'border-indigo-500 bg-indigo-50/50 scale-[1.01]'
                  : 'border-slate-300 hover:border-slate-400 hover:bg-slate-50/50'
              }`}
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              id="drag-and-drop-container"
            >
              <input
                id="pdf-file-loader"
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={handleFileInput}
              />
              
              <div className="p-4 bg-indigo-50 rounded-full text-indigo-600 group-hover:scale-110 transition-transform duration-300">
                <FileUp className="w-8 h-8" />
              </div>

              <h2 className="text-xl font-semibold text-slate-800 mt-6 text-center">
                Arraste e solte seu arquivo
              </h2>
              <p className="text-sm text-slate-500 mt-2 text-center max-w-md">
                Ou clique aqui para pesquisar em seu dispositivo.
              </p>
              
              <div className="mt-8 flex items-center gap-2 px-4 py-2 bg-slate-50 rounded-lg text-xs font-medium text-slate-500 border border-slate-100">
                <Info className="w-3.5 h-3.5 text-slate-400" />
                <span>Tamanho de até 100 MB</span>
              </div>
            </label>
          ) : (
            <div className="flex flex-col items-center justify-center py-12" id="loading-container">
              <div className="relative w-20 h-20 mb-6">
                <div className="absolute inset-0 rounded-full border-4 border-slate-100"></div>
                <div className="absolute inset-0 rounded-full border-4 border-indigo-600 border-t-transparent animate-spin"></div>
              </div>
              
              <p className="text-lg font-semibold text-slate-800">Processando documento...</p>
              <p className="text-sm text-slate-500 mt-1">Extraindo textos das páginas ({loadingProgress}%)</p>

              <div className="w-full max-w-xs bg-slate-100 h-2 rounded-full mt-6 overflow-hidden border border-slate-200">
                <motion.div
                  className="bg-indigo-600 h-full rounded-full"
                  initial={{ width: '0%' }}
                  animate={{ width: `${loadingProgress}%` }}
                  transition={{ duration: 0.1 }}
                />
              </div>
            </div>
          )}

          <div className="mt-8 p-4 bg-indigo-50/40 rounded-xl border border-indigo-100/60 text-indigo-900/80 text-xs leading-relaxed flex gap-3">
            <Info className="w-4 h-4 shrink-0 text-indigo-500 mt-0.5" />
            <div>
              <p className="font-semibold mb-0.5">Como o PDF Magic Editor te ajuda? </p>
              Cansado de usar vários programas complicados? Agora toda edição do seu arquivo pode ser feita em uma aba do navegador. Fácil e rápido.
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
