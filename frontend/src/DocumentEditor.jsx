import React, { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import EditorBlock from './components/EditorBlock';
import './styles/editor.css';

const DocumentEditor = () => {
  const [blocks, setBlocks] = useState([
    { id: 'b1', content: "Mục tiêu: Xây dựng hệ thống chỉnh sửa tài liệu Real-time.", status: "verified", version: 10, lastHash: "8a2f...3b1d" },
    { id: 'b2', content: "", status: "locked", user: "Hoàng Trần", version: 5, lastHash: "4c9e...11a2" },
    { id: 'b3', content: "Cảnh báo: Hash Chain không khớp tại Block này!", status: "error", version: 2, lastHash: "mismatch" },
  ]);
  const [docTitle, setDocTitle] = useState("Tài liệu không có tiêu đề");
  const [savingStatus, setSavingStatus] = useState('saved');
  const [history, setHistory] = useState([blocks]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [zoom, setZoom] = useState(100);
  const [fontFamily, setFontFamily] = useState("Arial");
  const [fontSize, setFontSize] = useState(11);
  const [textFormats, setTextFormats] = useState({
    bold: false,
    italic: false,
    underline: false,
    strikethrough: false,
    color: '#000000'
  });

  useEffect(() => {
    setSavingStatus('saving');
    const timer = setTimeout(() => {
        setSavingStatus('saved');
        // gọi API để lưu tên file vào Database/Backend
        console.log("Đã lưu tên file mới:", docTitle);
    }, 1000);

    return () => clearTimeout(timer);
  }, [docTitle]);

  // Hàm cập nhật blocks có lưu lịch sử
  const updateBlocksWithHistory = (newBlocks) => {
    const nextHistory = history.slice(0, currentIndex + 1);
    setHistory([...nextHistory, newBlocks]);
    setCurrentIndex(nextHistory.length);
    setBlocks(newBlocks);
  };

  // Hàm Undo
  const handleUndo = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setBlocks(history[currentIndex - 1]);
    }
  };

  // Hàm Redo
  const handleRedo = () => {
    if (currentIndex < history.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setBlocks(history[currentIndex + 1]);
    }
  };

  const handleBlockFocus = (id) => {
    const newBlocks = blocks.map(b => 
        b.id === id ? { ...b, status: 'editing' } : { ...b, status: b.status === 'editing' ? 'verified' : b.status }
    );
    updateBlocksWithHistory(newBlocks);
  };

  const handleNewDocument = () => {
    const newBlock = { id: `b${Date.now()}`, content: "", status: "verified", version: 1, lastHash: "0000" };
    setDocTitle("Tài liệu không có tiêu đề");
    setBlocks([newBlock]);
    setHistory([[newBlock]]);
    setCurrentIndex(0);
  };

  const handleBlockChange = (id, newContent) => {
      const newBlocks = blocks.map(b => 
          b.id === id ? { ...b, content: newContent } : b
      );
      setBlocks(newBlocks);
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
      />
      <main className="editor-main">
        <div className="document-paper" style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center', fontFamily: fontFamily }}>
          {blocks.map((block) => (
            <EditorBlock key={block.id} block={block} onFocus={handleBlockFocus} onChange={handleBlockChange} fontFamily={fontFamily} formats={textFormats}/>
          ))}
          <button className="add-block-btn"><Plus size={18} /> Add New Block</button>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default DocumentEditor;