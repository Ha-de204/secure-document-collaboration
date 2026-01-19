import React, { useState, useEffect, useRef } from 'react';
import { Plus } from 'lucide-react';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import EditorBlock from './components/EditorBlock';
import './styles/editor.css';
import { useParams, useNavigate } from 'react-router-dom';
import BlockCryptoModule from "./crypto/BlockManager";


const DocumentEditor = ({ onLogout, socket }) => {
  const { id } = useParams();
  const docID = id;
  const navigate = useNavigate();
  const currentUser = localStorage.getItem('currentUser') || "Guest";

  const cryptoRef = useRef(BlockCryptoModule);
  const drkRef = useRef(null);
  const [documentRootKey, setDocumentRootKey] = useState(null);

  const [blocks, setBlocks] = useState([]);
  const [docTitle, setDocTitle] = useState("Tài liệu không có tiêu đề");
  const [savingStatus, setSavingStatus] = useState('saved');
  const [activeBlockId, setActiveBlockId] = useState(null);
  // History management
  const [currentIndex, setCurrentIndex] = useState(0);
  const [history, setHistory] = useState([[ { ...blocks[0] } ]]);

  const isRestoringHistory = useRef(false);
  const [zoom, setZoom] = useState(100);
  const [fontFamily, setFontFamily] = useState("Arial");                                    
  const [fontSize, setFontSize] = useState(11);
  const historyTimer = useRef(null);
  const historyRef = useRef(history);
  const indexRef = useRef(currentIndex);
  const blocksRef = useRef(blocks);
  const hasPendingHistory = useRef(false);
  const [textFormats, setTextFormats] = useState({
    bold: false,
    italic: false,
    underline: false,
    strikethrough: false,
    color: '#000000'
  });

  const cloneBlocks = (blocks) => blocks.map(b => ({ ...b }));

  /* ======================================================
     INIT DOCUMENT + ROOT KEY
  ====================================================== */
  useEffect(() => {
    if (!docID) return;

    // Khởi tạo BlockManager cho document
    drkRef.current = cryptoRef.current.generateDRK();
    // Block đầu tiên
    setBlocks([
      {
        id: crypto.randomUUID(),
        content: "",
        status: "saved",
        editorName: null,
      },
    ]);


    // 3. Join socket room
    socket.emit("document:join", { documentId: docID });

    return () => {
      socket.emit("document:leave", { documentId: docID });
    };

  }, [docID, socket]);

  // --- SOCKET LISTENERS ---
  useEffect(() => {
    if (!socket || !cryptoRef.current) return;

    socket.on("block:locked", ({ blockId, userId }) => {
    setBlocks(prev =>
      prev.map(b =>
        b.id === blockId
          ? {
            ...b,
            status: "locked",
            editorName: userId
          }
        : b
      )
    );
  });

  socket.on("block:unlocked", ({ blockId }) => {
    setBlocks(prev =>
      prev.map(b =>
        b.id === blockId
          ? {
            ...b,
            status: "saved",
            editorName: null
          }
        : b
      )
    );
  });
  
    socket.on("block:update", payload => {
      const plain = cryptoRef.current.decryptBlock(payload);
      setBlocks(prev =>
        prev.map(b => b.id === payload.blockId ? plain : b)
      );
    });

    socket.on("block:create", payload => {
      const plain = cryptoRef.current.decryptBlock(payload);
      setBlocks(prev => [...prev, plain]);
    });

    socket.on("block:delete", ({ blockId }) => {
      setBlocks(prev => prev.filter(b => b.id !== blockId));
    });

    return () => {
      socket.off("block:locked");
      socket.off("block:unlocked");
      socket.off("block:update");
      socket.off("block:create");
      socket.off("block:delete")
    };
  }, [socket]);

  const handleBlockChange = (blockId, content) => {
    setSavingStatus('saving');
    setBlocks(prev =>
      prev.map(block =>
        block.id === blockId
          ? { ...block, content }
          : block
      )
    );

    socket.emit("block:update", {
      documentId: docID,
      blockId,
      content,
    });
    setTimeout(() => setSavingStatus('saved'), 600);
  }; 

  // hàm thêm block mới
  const handleAddBlock = (index) => {
    const newBlock = {
      id: crypto.randomUUID(),
      content: "",
      status: "saved",
      editorName: null,
    };

    const newBlocks = [...blocks];
    newBlocks.splice(index + 1, 0, newBlock);

    setBlocks(newBlocks);

    socket.emit("block:create", {
      documentId: docID,
      block: newBlock,
    });
  };

  // Xóa block
  const handleDeleteBlock = (blockId) => {
    setBlocks(prev => prev.filter(b => b.id !== blockId));
    socket.emit("block:delete", { documentId: docID, blockId });
    setTimeout(() => setSavingStatus('saved'), 600);
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

  // ham mo khoa block khi k focus nx
  const handleBlockBlur = (id) => {
    setActiveBlockId(null);
      if (socket && docID) {
        setTimeout(() => {
          socket.emit('block:unlock', { blockId: id });
        }, 100);
    }
  };

  // Hàm Undo
  const handleUndo  = () => {
    if (indexRef.current <= 0) return;
    indexRef.current -= 1;
    setBlocks(historyRef.current[indexRef.current]);
  };

  // Hàm Redo
 const handleRedo = () => {
    if (indexRef.current >= historyRef.current.length - 1) return;
    indexRef.current += 1;
    setBlocks(historyRef.current[indexRef.current]);
  };

  const handleBlockFocus = (id) => {
    setActiveBlockId(id);
    socket?.emit('block:lock', { blockId: id });
  };

  const handleNewDocument = () => {
    setDocumentRootKey(BlockCryptoModule.generateDRK());

    const genesis = {
      id: crypto.randomUUID(),
      content: "",
      cipherText: "", // block trống
      version: 1,
      prevHash: "GENESIS",
      status: "saved",
      editorName: null,
    };
    genesis.hash = BlockCryptoModule.calculateBlockHash(
      {
        id: genesis.id,
        cipherText: genesis.cipherText,
        version: genesis.version,
        prevHash: genesis.prevHash,
      },
      BlockCryptoModule.generateDRK()
    );
      setBlocks([genesis]);
      setHistory([[genesis]]);
      setCurrentIndex(0);
      setDocTitle("Tài liệu không có tiêu đề");
      setActiveBlockId(genesis.id);
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
        canUndo={indexRef.current > 0}
        canRedo={indexRef.current < historyRef.current.length - 1}
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
        userName={currentUser}
        onLogout={onLogout}
      />
      <main className="editor-main">
        <div className="document-paper" style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center', fontFamily: fontFamily }}>
          {blocks.map((block, index) => (
            <EditorBlock 
              key={block.id} 
              block={block} 
              isLocked={block.status === 'locked'}
              isFocused={activeBlockId === block.id}
              onFocus={() => handleBlockFocus(block.id)} 
              onBlur={() => handleBlockBlur(block.id)}
              onChange={handleBlockChange} 
              onEnter={() => handleAddBlock(index)}
              onDelete={() => handleDeleteBlock(block.id)}
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