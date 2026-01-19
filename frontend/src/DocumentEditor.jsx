import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Plus } from 'lucide-react';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import EditorBlock from './components/EditorBlock';
import './styles/editor.css';
import { SecurityProvider } from './crypto/crypto';
import { useParams, useNavigate } from 'react-router-dom';

const DocumentEditor = ({ onLogout, socket }) => {
  const { id } = useParams();
  const docID = id;
  const navigate = useNavigate();
  const currentUser = localStorage.getItem('currentUser') || "Guest";
  const [password, setPassword] = useState("");
  const [docKey, setDocKey] = useState(null);

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

  const handleUnlock = () => {
    const derived = SecurityProvider.deriveKey(password, docID);
    setDocKey(derived);
  };

  const cloneBlocks = (blocks) => blocks.map(b => ({ ...b }));

  // 1. Fetch dữ liệu ban đầu từ API
  useEffect(() => {
    const fetchFullDocument = async () => {
      try {
        const baseUrl = process.env.REACT_APP_API_URL;
        const response = await fetch(`${baseUrl}/documents/${docID}`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` }
        });
        const result = await response.json();

        if (result.status) {
          setDocTitle(result.document.title);
          
          // GIẢI MÃ từng block từ cipherText sang content plaintext để hiển thị
          const decryptedBlocks = result.document.blocks?.map(b => ({
            ...b,
            id: b.blockId,
            content: SecurityProvider.decrypt(b.cipherText, docKey)
          })) || [];
          
          setBlocks(decryptedBlocks);
        }
      } catch (err) {
        console.error("Lỗi tải tài liệu:", err);
      }
    };

    if (docID) {
      fetchFullDocument();
      // Tham gia phòng Socket
      socket.emit('document:join', { documentId: docID });
    }
  }, [docID, docKey, socket]);

  // Cập nhật refs khi state thay đổi
  useEffect(() => {
    historyRef.current = history;
    indexRef.current = currentIndex;
    blocksRef.current = blocks;
  }, [history, currentIndex, blocks]);

  // --- SOCKET LISTENERS ---
  useEffect(() => {
    if (!socket || !docID) return;
  
    socket.on('block:unlocked', ({ blockId }) => {
      setBlocks(prev => prev.map(b => 
        b.id === blockId ? { ...b, status: 'saved', editorName: null } : b
      ));
    });

    socket.on('update-block-response', (data) => {
      setBlocks(prev => prev.map(b => {
        if (b.id === data.blockId) {
          return {
            ...b,
            content: SecurityProvider.decrypt(data.cipherText, docKey), // Giải mã ngay
            version: data.version,
            hash: data.hash,
            status: 'saved'
          };
        }
        return b;
      }));
    });

    socket.on('block:locked', ({ blockId, userName }) => {
      setBlocks(prev => prev.map(b => 
        b.id === blockId ? { ...b, status: 'locked', editorName: userName } : b
      ));
    });

    socket.on('block:deleted', ({ blockId }) => {
      setBlocks(prev => prev.filter(b => b.id !== blockId));
    });

    socket.on('block:created', (newBlock) => {
      
      setBlocks(prev => {
        // Tránh duplicate nếu socket gửi về chính mình
        if (prev.find(b => b.id === newBlock.blockId)) return prev;
        
        const updated = [...prev];
        updated.splice(newBlock.index, 0, {
          ...newBlock,
          id: newBlock.blockId,
          content: SecurityProvider.decrypt(newBlock.cipherText, docKey)
        });
        return updated;
      });
    });

    return () => {
      socket.off('update-block-response');
      socket.off('block:locked');
      socket.off('block:unlocked');
      socket.off('block:created');
    };
  }, [socket, docKey]);

  const handleBlockChange = (blockId, newContent) => {
    // 1. Tìm block đang sửa từ state hiện tại
    const targetBlock = blocks.find(b => b.id === blockId);
    if (!targetBlock) return

    // 2. Cập nhật UI ngay lập tức
    setSavingStatus('saving');

    // Tạo bản ghi mới phục vụ Hash Chain
    const cipherText = SecurityProvider.encrypt(newContent, docKey);
    const newVersion = (targetBlock.version || 0) + 1;

    const blockUpdate = {
      blockId: blockId,
      documentId: docID,
      index: targetBlock.index,
      version: newVersion,
      cipherText: cipherText,
      prevHash: targetBlock.hash || "0",
    };

    // Tính toán Hash mới (Toàn vẹn dữ liệu)
    blockUpdate.hash = SecurityProvider.calculateHash(blockUpdate, docKey);

    // Cập nhật local state trước (để UI mượt)
    setBlocks(prev => prev.map(b => 
      b.id === blockId ? { ...b, content: newContent, version: newVersion, hash: blockUpdate.hash } : b
    ));

    // 3. Gửi dữ liệu ĐÃ MÃ HÓA lên Server
    socket.emit('block:update', blockUpdate);

    // 4. Quản lý History
    clearTimeout(historyTimer.current);
    historyTimer.current = setTimeout(() => {
      setSavingStatus('saved');
    }, 600);

}; 

  // hàm thêm block mới
  const handleAddBlock = (index) => {
    if (!docKey) return;
    setSavingStatus('saving');
    const prevBlock = blocks[index];
    const prevHash = prevBlock ? prevBlock.hash : "00000000000000000000000000000000";

    const newBlockId = `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const newBlockData = {
      blockId: newBlockId,
      documentId: docID,
      index: index + 1,
      content: '',
      cipherText: SecurityProvider.encrypt('', docKey),
      version: 1,
      prevHash: prevHash
    };
    newBlockData.hash = SecurityProvider.calculateHash(newBlockData, docKey);

    const updatedBlockForState = {
      ...newBlockData,
      id: newBlockId, 
      content: "",
      status: 'editing'
    };

    // Lưu lịch sử trước khi thay đổi
    const nextHistory = history.slice(0, currentIndex + 1);
    setHistory([...nextHistory, cloneBlocks(blocks)]);
    setCurrentIndex(nextHistory.length);
    
    const newBlocks = [...blocks];
    newBlocks.splice(index + 1, 0, updatedBlockForState);
    setBlocks(newBlocks);
    setActiveBlockId(newBlockData.id); 

    socket.emit('block:create', newBlockData);

    setTimeout(() => setSavingStatus('saved'), 600);
  };

  // Xóa block
  const handleDeleteBlock = (blockId, index) => {
    if (blocks.length > 1) {
      setSavingStatus('saving');
      // lưu lại lsu trước khi xóa
      const nextHistory = history.slice(0, currentIndex + 1);
      setHistory([...nextHistory, cloneBlocks(blocks)]);
      setCurrentIndex(nextHistory.length);

      const newBlocks = blocks.filter(b => b.id !== blockId);
      setBlocks(newBlocks);

      socket.emit('block:delete', { 
        documentId: docID, 
        blockId: blockId 
      });

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

    const syncBlockWithServer = useCallback((block) => {
    if (!socket || !docID) return;

    // 1. Mã hóa nội dung từ lịch sử
    const encryptedText = SecurityProvider.encrypt(block.content);
    
    // 2. Tính toán Version và Hash mới (Undo là một bản ghi mới)
    const nextVersion = (block.version || 1) + 1;
    const newHash = SecurityProvider.calculateHash({
      id: block.id,
      index: blocksRef.current.findIndex(b => b.id === block.id),
      version: nextVersion,
      cipherText: encryptedText,
      prevHash: block.lastHash
    });

    // 3. Emit qua socket
    socket.emit('block:update', {
      blockId: block.id,
      documentId: docID, 
      version: nextVersion,
      cipherText: encryptedText,
      hash: newHash,
      prevHash: block.lastHash
    });
  }, [socket, docID]);

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
  const handleUndo = useCallback(() => {
    if (indexRef.current <= 0) return;

    const previousIndex = indexRef.current - 1;
    const previousBlocks = historyRef.current[previousIndex];
    const currentBlocks = blocksRef.current;

    // Đánh dấu đang khôi phục để tránh tạo thêm history mới trong useEffect
    isRestoringHistory.current = true;

    previousBlocks.forEach(oldBlock => {
      const match = currentBlocks.find(b => b.id === oldBlock.id);
      if (match && match.content !== oldBlock.content) {
        syncBlockWithServer(oldBlock);
      }
    });

    setBlocks(previousBlocks);
    setCurrentIndex(previousIndex);

    setTimeout(() => { isRestoringHistory.current = false; }, 100);
  }, [syncBlockWithServer]);

  // Hàm Redo
 const handleRedo = useCallback(() => {
    if (indexRef.current >= historyRef.current.length - 1) return;

    const nextIndex = indexRef.current + 1;
    const nextBlocks = historyRef.current[nextIndex];
    const prevBlocks = historyRef.current[indexRef.current];

    isRestoringHistory.current = true;
    setBlocks(nextBlocks);
    setCurrentIndex(nextIndex);
    indexRef.current = nextIndex;

    // Đồng bộ với Server
    nextBlocks.forEach(newBlock => {
      const oldBlock = prevBlocks.find(b => b.id === newBlock.id);
      
      // Chỉ sync nếu nội dung thực sự khác biệt so với trạng thái trước đó
      if (!oldBlock || oldBlock.content !== newBlock.content) {
        syncBlockWithServer(newBlock); 
      }
    });

    setTimeout(() => { isRestoringHistory.current = false; }, 100);
  }, [syncBlockWithServer]);

  const handleBlockFocus = (id) => {
    setActiveBlockId(id);
    socket?.emit('block:lock', { blockId: id });
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

    if (!docKey) {
      return (
        <div className="password-overlay">
          <div className="password-modal">
            <h3>Nhập mật khẩu để giải mã tài liệu</h3>
            <input 
              type="password" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mật khẩu tài liệu..."
            />
            <button onClick={handleUnlock}>Mở khóa</button>
          </div>
        </div>
      );
    }

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