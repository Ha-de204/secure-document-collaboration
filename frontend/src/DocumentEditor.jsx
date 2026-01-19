import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  const [drk, setDrk] = useState(null);

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
  
  const addToHistory = useCallback((newBlocks) => {
    setHistory(prev => {
      // Chỉ lấy lịch sử tính đến bước hiện tại (loại bỏ các bước Redo cũ)
      const newHistory = prev.slice(0, currentIndex + 1);
      // Lưu bản sao sâu để không bị dính tham chiếu
      const entry = JSON.parse(JSON.stringify(newBlocks));
      const finalHistory = [...newHistory, entry];
      // Giới hạn 30 bước để tránh tốn bộ nhớ
      return finalHistory.slice(-30);
    });
    setCurrentIndex(prev => prev + 1);
  }, [currentIndex]);

  /* ======================================================
     INIT DOCUMENT + ROOT KEY
  ====================================================== */
  useEffect(() => {
    if (!docID) return;

    // 1. Khởi tạo DRK (Trong thực tế nên fetch từ server)
    const newDrk = BlockCryptoModule.generateDRK();
    setDrk(newDrk);

    // 2. Tạo block đầu tiên có mã hóa
    const initDoc = async () => {
      const firstBlockId = crypto.randomUUID();
      const encrypted = await BlockCryptoModule.encryptBlock("", newDrk, firstBlockId);
      
      const firstBlock = {
        id: firstBlockId,
        content: "",
        cipherText: encrypted.cipherText,
        iv: encrypted.iv,
        version: 1,
        prevHash: "GENESIS_BLOCK_HASH",
        status: "saved",
        editorName: null,
      };
      
      const hash = await BlockCryptoModule.calculateBlockHash(firstBlock, newDrk);
      firstBlock.hash = hash;

      const initialBlocks = [firstBlock];
      setBlocks(initialBlocks);
      setHistory([JSON.parse(JSON.stringify(initialBlocks))]);
      setCurrentIndex(0);
    };

    initDoc();
    socket.emit("document:join", { documentId: docID });

    return () => {
      socket.emit("document:leave", { documentId: docID });
    };
  }, [docID]);

  // --- SOCKET LISTENERS ---
  useEffect(() => {
    if (!socket || !drk) return;

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
    const newBlocks = blocks.map(block => 
      block.id === blockId ? { ...block, content } : block
    );
    setBlocks(newBlocks);

    // Emit update qua socket
    socket.emit("block:update", { documentId: docID, blockId, content });
    
    // Lưu vào history sau một khoảng thời gian ngừng gõ (debounce)
    clearTimeout(window.saveTimeout);
    window.saveTimeout = setTimeout(() => {
      addToHistory(newBlocks);
      setSavingStatus('saved');
    }, 1000);
  }; 

  // hàm thêm block mới
  const handleAddBlock = async (index) => {
    if (!drk) return;
    const rawDrk = drk instanceof Uint8Array ? drk : new Uint8Array(Object.values(drk));
    
    const newBlockId = crypto.randomUUID();
    const prevBlock = blocks[index];
    const prevHash = prevBlock ? (prevBlock.hash || "GENESIS_BLOCK_HASH") : "GENESIS_BLOCK_HASH";

    try {
      setSavingStatus('saving');
      const encrypted = await BlockCryptoModule.encryptBlock("", rawDrk, newBlockId);

      const blockData = {
        id: newBlockId,
        authorId: currentUser,
        documentId: docID,
        version: 1,
        epoch: Date.now(),
        cipherText: encrypted.cipherText,
        iv: encrypted.iv,
        prevHash: prevHash,
        content: "",
        status: "saved",
        editorName: null
      };

      const hash = await BlockCryptoModule.calculateBlockHash(blockData, rawDrk);
      const newBlock = { ...blockData, hash };

      const updatedBlocks = [...blocks];
      updatedBlocks.splice(index + 1, 0, newBlock);
      
      setBlocks(updatedBlocks);
      addToHistory(updatedBlocks);
      
      socket.emit("block:create", { documentId: docID, block: newBlock });
      setSavingStatus('saved');
    } catch (error) {
      console.error("Lỗi tạo block:", error);
    }
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
    if (currentIndex > 0) {
      const prevStep = currentIndex - 1;
      setCurrentIndex(prevStep);
      setBlocks(JSON.parse(JSON.stringify(history[prevStep])));
    }
  };

  // Hàm Redo
 const handleRedo = () => {
    if (currentIndex < history.length - 1) {
      const nextStep = currentIndex + 1;
      setCurrentIndex(nextStep);
      setBlocks(JSON.parse(JSON.stringify(history[nextStep])));
    }
  };

  const handleBlockFocus = (id) => {
    setActiveBlockId(id);
    socket?.emit('block:lock', { blockId: id });
  };

  const handleNewDocument = async () => {
    const newDrk = BlockCryptoModule.generateDRK();
    setDrk(newDrk);
    const genesisId = crypto.randomUUID();

    try {
    // 2. Mã hóa nội dung trống cho block đầu tiên
    const encrypted = await BlockCryptoModule.encryptBlock("", newDrk, genesisId);

    const genesis = {
      id: genesisId,
      content: "",
      cipherText: encrypted.cipherText,
      iv: encrypted.iv,
      version: 1,
      prevHash: "GENESIS_BLOCK_HASH",
      status: "saved",
      editorName: null,
    };

    // 3. Tính toán hash (BlockCryptoModule.calculateBlockHash trả về chuỗi Base64 
    // nhờ hàm encodeBuffer bên trong nó)
    const blockHash = await BlockCryptoModule.calculateBlockHash(genesis, newDrk);
    
    // Gán hash vào block (đảm bảo đây là string)
    genesis.hash = blockHash;

    // 4. Khởi tạo State và History
    setBlocks([genesis]);
    setHistory([JSON.parse(JSON.stringify([genesis]))]);
    setCurrentIndex(0);
    setDocTitle("Tài liệu không có tiêu đề");
    setActiveBlockId(genesis.id);

    console.log("Đã khởi tạo tài liệu mới với Genesis Block.");
  } catch (error) {
    console.error("Lỗi khi tạo tài liệu mới:", error);
  }
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