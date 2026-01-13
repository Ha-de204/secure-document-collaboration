import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Plus } from 'lucide-react';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import EditorBlock from './components/EditorBlock';
import './styles/editor.css';
import { sha256 } from 'js-sha256';

const DocumentEditor = () => {
  const [blocks, setBlocks] = useState([
    {
      id: 'initial-block',
      content: '',
      status: 'editing',
      version: 1,
      lastHash: 'e3b0c442...',
      type: 'text'
    }
  ]);
  const [docTitle, setDocTitle] = useState("Tài liệu không có tiêu đề");
  const [savingStatus, setSavingStatus] = useState('saved');
  const [history, setHistory] = useState([[ { ...blocks[0] } ]]);
  const [activeBlockId, setActiveBlockId] = useState('initial-block');
  const isRestoringHistory = useRef(false);
//const [history, setHistory] = useState([blocks]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [zoom, setZoom] = useState(100);
  const [fontFamily, setFontFamily] = useState("Arial");                                    
  const [fontSize, setFontSize] = useState(11);
  const historyTimer = useRef(null);
  const historyRef = useRef(history);
  const indexRef = useRef(currentIndex);
  const hasPendingHistory = useRef(false);
  const [textFormats, setTextFormats] = useState({
    bold: false,
    italic: false,
    underline: false,
    strikethrough: false,
    color: '#000000'
  });

  const cloneBlocks = (b) => b.map(x => ({ ...x }));
  // hàm tính hash 
  const calculateHash = useCallback((content, version) => {
    return sha256(content + version);
  }, []);

  // hàm cập nhật nội dung block
  const handleBlockChange = useCallback((id, newContent) => {
    setSavingStatus('saving');
    setBlocks(prev => {
      const currentBlock = prev.find(b => b.id === id);
      if (currentBlock && currentBlock.content === newContent) return prev;

      const nextBlocks = prev.map(b => {
        if (b.id === id) {
          const nextVersion = b.version + 1;
          return { 
            ...b, 
            content: newContent, 
            version: nextVersion,
            lastHash: calculateHash(newContent, nextVersion)
          };
        }
        return b;
      });

      clearTimeout(historyTimer.current);

      if (!hasPendingHistory.current) {
        const nextHistory = historyRef.current.slice(0, indexRef.current + 1);
        setHistory([...nextHistory, cloneBlocks(prev)]); 
        setCurrentIndex(nextHistory.length);
        hasPendingHistory.current = true;
      }

      historyTimer.current = setTimeout(() => {
        hasPendingHistory.current = false;
        const currentHistory = historyRef.current;
        const updatedHistory = [...currentHistory];
        updatedHistory[indexRef.current] = cloneBlocks(nextBlocks);
        setHistory(updatedHistory);
        setSavingStatus('saved');
      }, 600);

      return nextBlocks;
    });
  }, [calculateHash]);

  // hàm thêm block mới
  const handleAddBlock = (index) => {
    setSavingStatus('saving');
    const newId = crypto.randomUUID();
    const newBlock = {
      id: newId,
      content: '',
      status: 'editing',
      version: 1,
      lastHash: 'e3b0c442...',
      type: 'text'
    };
    // Lưu lịch sử trước khi thay đổi
    const nextHistory = history.slice(0, currentIndex + 1);
    setHistory([...nextHistory, cloneBlocks(blocks)]);
    setCurrentIndex(nextHistory.length);
    
    const newBlocks = [...blocks];
    newBlocks.splice(index + 1, 0, newBlock);
    setBlocks(newBlocks);
    setActiveBlockId(newId); 

    setTimeout(() => setSavingStatus('saved'), 600);
  };

  // Xóa block
  const handleDeleteBlock = (id, index) => {
    if (blocks.length > 1) {
      setSavingStatus('saving');
      // lưu lại lsu trước khi xóa
      const nextHistory = history.slice(0, currentIndex + 1);
      setHistory([...nextHistory, cloneBlocks(blocks)]);
      setCurrentIndex(nextHistory.length);

      const newBlocks = blocks.filter(b => b.id !== id);
      setBlocks(newBlocks);

      const prevBlockId = blocks[index - 1]?.id || blocks[0].id;
      setActiveBlockId(prevBlockId);

      setTimeout(() => setSavingStatus('saved'), 600);
    }
  };

  const handleAlignBlock = (alignment) => {
    if (!activeBlockId) return;
    setSavingStatus('saving');

    // Lưu lịch sử hiện tại trước khi đổi căn lề
    const nextHistory = history.slice(0, currentIndex + 1);
    setHistory([...nextHistory, cloneBlocks(blocks)]);
    setCurrentIndex(nextHistory.length);

    setBlocks(prev => prev.map(block => {
      if (block.id === activeBlockId) {
        return { 
          ...block, 
          textAlign: alignment,
          version: block.version + 1 
        };
      }
      return block;
    }));

    clearTimeout(historyTimer.current);
      historyTimer.current = setTimeout(() => {
      setSavingStatus('saved');
    }, 600);
  };

  useEffect(() => {
    setSavingStatus('saving');
    const timer = setTimeout(() => {
      setSavingStatus('saved');
      // gọi API để lưu tên file vào Database/Backend
      console.log("Đã lưu tên file mới:", docTitle);
    }, 1000);

    return () => clearTimeout(timer);
  }, [docTitle]);

  useEffect(() => {
    historyRef.current = history;
    indexRef.current = currentIndex;
  }, [history, currentIndex]);

/*
  Hàm cập nhật blocks có lưu lịch sử
  const updateBlocksWithHistory = (newBlocks) => {
    const nextHistory = history.slice(0, currentIndex + 1);
    setHistory([...nextHistory, newBlocks]);
    setCurrentIndex(nextHistory.length);
    setBlocks(newBlocks);
  };
*/ 

  // Hàm Undo
  const handleUndo = () => {
    if (currentIndex > 0) {
      clearTimeout(historyTimer.current);
      hasPendingHistory.current = false;
      isRestoringHistory.current = true;
      const prev = history[currentIndex - 1];
      setCurrentIndex(currentIndex - 1);
      setBlocks(cloneBlocks(prev));

      setSavingStatus('saved');

      setTimeout(() => {
        isRestoringHistory.current = false;
      }, 0);
    }
  };

  // Hàm Redo
  const handleRedo = () => {
    if (currentIndex < history.length - 1) {
      isRestoringHistory.current = true;
      
      const next = history[currentIndex + 1];
      setCurrentIndex(currentIndex + 1);
      setBlocks(cloneBlocks(next));

      setSavingStatus('saved');

      setTimeout(() => {
        isRestoringHistory.current = false;
      }, 0);
    }
  };

  const handleBlockFocus = (id) => {
    setActiveBlockId(id);
    setBlocks(prev => prev.map(b => 
      b.id === id ? { ...b, status: 'editing' } : { ...b, status: 'verified' }
    ));
  };

  const handleNewDocument = () => {
    const newBlock = { id: `b${Date.now()}`, content: "", status: "verified", version: 1, lastHash: "0000" };
    setDocTitle("Tài liệu không có tiêu đề");
    setBlocks([newBlock]);
    setHistory([[newBlock]]);
    setCurrentIndex(0);
  };


  // Hàm đảo ngược trạng thái cho B, I, U, S
    const handleFormatChange = (format) => {
      setTextFormats(prev => ({ ...prev, [format]: !prev[format] }));
    };

    // Hàm thay đổi màu
    const handleColorChange = (newColor) => {
      setTextFormats(prev => ({ ...prev, color: newColor }));
    };

  return (
    <div className="editor-container">
      <Header 
        title={docTitle} 
        onTitleChange={setDocTitle} 
        savingStatus={savingStatus} 
        onNewDocument={handleNewDocument}
        onUndo={handleUndo}
        onRedo={handleRedo} 
        canUndo={currentIndex > 0}
        canRedo={currentIndex < history.length - 1}
        zoom={zoom}
        onZoomChange={setZoom}
        fontFamily={fontFamily}
        onFontChange={setFontFamily}
        fontSize={fontSize}
        onFontSizeChange={setFontSize}
        format={textFormats}
        onFormat={handleFormatChange}
        onColorChange={handleColorChange}
        onAlign={handleAlignBlock}
        activeBlockId={activeBlockId}
      />
      <main className="editor-main">
        <div className="document-paper" style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center', fontFamily: fontFamily }}>
          {blocks.map((block, index) => (
            <EditorBlock 
              key={block.id} 
              block={block} 
              isFocused={activeBlockId === block.id}
              onFocus={() => handleBlockFocus(block.id)} 
              onChange={handleBlockChange} 
              onEnter={() => handleAddBlock(index)}
              onDelete={() => handleDeleteBlock(block.id, index)}
              fontFamily={fontFamily} 
              formats={textFormats}
            />
          ))}
          <button className="add-block-btn" onClick={() => handleAddBlock(blocks.length - 1)}><Plus size={18} /> Add New Block</button>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default DocumentEditor;