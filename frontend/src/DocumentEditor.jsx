import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Plus } from 'lucide-react';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import EditorBlock from './components/EditorBlock';
import './styles/editor.css';
import { useParams, useNavigate } from 'react-router-dom';
import BlockCryptoModule from "./crypto/BlockManager";
import { getDB } from './storage/indexDbService';

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
      const newHistory = prev.slice(0, currentIndex + 1);
      const entry = JSON.parse(JSON.stringify(newBlocks));
      const finalHistory = [...newHistory, entry];
      return finalHistory.slice(-30);
    });
    setCurrentIndex(prev => prev + 1);
  }, [currentIndex]);

  useEffect(() => {
    if (!docID) return;

    const initEmptyDoc = async () => {
      const newDrk = BlockCryptoModule.generateDRK();
      setDrk(newDrk);
    };

    initEmptyDoc();
    socket.emit("document:join", { documentId: docID });
  }, [docID]);

  // SOCKET LISTENERS
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

    socket.emit("block:update", { documentId: docID, blockId, content });
    
    clearTimeout(window.saveTimeout);
    window.saveTimeout = setTimeout(() => {
      addToHistory(newBlocks);
      setSavingStatus('saved');
    }, 1000);
  }; 

  const handleAddBlock = async (index) => {
    try {
      setSavingStatus('saving');
      
      const db = await getDB();
      const allDocs = await db.getAll('documents'); 
      
      if (!allDocs || allDocs.length === 0) {
        alert("Không tìm thấy dữ liệu tài liệu local. Vui lòng tạo tài liệu trước.");
        setSavingStatus('error');
        return;
      }

      const docID = allDocs[allDocs.length - 1].localDocId; 
      const token = localStorage.getItem('accessToken');
      const newUUID = crypto.randomUUID();

      const encrypted = await BlockCryptoModule.encryptBlock("", drk, newUUID);
      const combinedCipherText = `${encrypted.iv}:${encrypted.cipherText}`;

      const finalPayload = {
        blockId: String(newUUID),
        documentId: String(docID),
        index: Number(index),
        version: 1,
        cipherText: String(combinedCipherText),
        prevHash: "0",
        hash: await BlockCryptoModule.calculateBlockHash({
          blockId: newUUID,
          cipherText: combinedCipherText,
          prevHash: "0",
          version: 1
        }, drk),
        epoch: Date.now()
      };

      const response = await fetch(`${process.env.REACT_APP_API_URL}/blocks/${docID}`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(finalPayload)
      });

      if (!response.ok) {
        throw new Error(`Lỗi Server: ${response.status}`);
      }

      // luu indexDB
      const tx = db.transaction('blocks', 'readwrite');
      await tx.objectStore('blocks').put({
        localBlockId: newUUID,
        documentId: docID,
        ...finalPayload,
        content: "", 
        status: 'saved'
      });
      await tx.done;

      setBlocks(prev => {
        const updated = [...prev];
        updated.splice(index, 0, { ...finalPayload, id: newUUID, content: "" });
        return updated;
      });

      setSavingStatus('saved');
      console.log("Thành công: Đã tự động tìm ID tài liệu và lưu Block!");

    } catch (error) {
      console.error("Lỗi:", error.message);
      setSavingStatus('error');
      alert(error.message);
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
  try {
    setSavingStatus('saving');

    const newDrk = BlockCryptoModule.generateDRK(); 
    const currentEpoch = 0;

    const documentPayload = {
      title: "Tài liệu mới",
      epoch: currentEpoch,
      publicMetadata: false,
      metadata: { 

        isEncrypted: true 
      }
    };

    const token = localStorage.getItem('accessToken');
    const res = await fetch(`${process.env.REACT_APP_API_URL}/documents`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}` 
      },
      body: JSON.stringify(documentPayload)
    });

    if (!res.ok) throw new Error("Server Error");
    const result = await res.json();
    const serverDoc = result.data;

    // 4. LƯU KHÓA (DRK) VÀO INDEXEDDB
    const db = await getDB();
    const tx = db.transaction(['documents', 'document_keys'], 'readwrite');

    // Lưu metadata tài liệu
    await tx.objectStore('documents').put({
      localDocId: serverDoc._id,
      title: documentPayload.title,
      ownerId: serverDoc.ownerId,
      createdAt: new Date()
    });

    await tx.objectStore('document_keys').put({
      documentId: serverDoc._id,
      epoch: currentEpoch,
      drk: newDrk 
    });

    await tx.done;

    setDrk(newDrk);
    setBlocks([]);
    setDocTitle(documentPayload.title);
    setSavingStatus('saved');
    
    console.log("Khởi tạo an toàn: DRK đã lưu local, Document đã tạo trên Server.");

  } catch (error) {
    console.error("Lỗi khởi tạo tài liệu:", error);
    setSavingStatus('error');
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