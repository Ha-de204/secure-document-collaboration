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

    const initEmptyDoc = async () => {
      const newDrk = BlockCryptoModule.generateDRK();
      setDrk(newDrk);
    };

    initEmptyDoc();
    socket.emit("document:join", { documentId: docID });
  }, [docID]);

  // --- SOCKET LISTENERS ---
  useEffect(() => {
    if (!socket || !drk) return;

    socket.on("block:locked", ({ blockId, result }) => {
    // setBlocks(prev =>
    //   prev.map(b =>
    //     b.id === blockId
    //       ? {
    //         ...b,
    //         status: "locked",
    //         editorName: userId
    //       }
    //     : b
    //   )
    // );
    alert("Bloc nay bi khoa")
  });

  socket.on("block:remove-locked", ({ blockId, result }) => {
    // setBlocks(prev =>
    //   prev.map(b =>
    //     b.id === blockId
    //       ? {
    //         ...b,
    //         status: "saved",
    //         editorName: null
    //       }
    //     : b
    //   )
    // );

  });
  
    socket.on("block:editing", ({
      blockId,
      cipherText,
      userId
    }) => {
      try{
      const plain = cryptoRef.current.decryptBlock(cipherText);
      // setBlocks(prev =>
      //   prev.map(b => b.id === payload.blockId ? plain : b)
      // );
      setBlocks(prev =>
      prev.map(b =>
        b.id === blockId 
          ? {
            ...b,
            content: plain,
            status: "locked",
            editorName: userId
            }
          : b
        )
      );
    }catch(err){
      alert(err)
    }
    });

    socket.on("block:committed", async (payload) => {
      const { blockId, cipherText, by } = payload;
        
        try {
          // Giải mã nội dung mới nhận được
          const plainText = await cryptoRef.current.decryptBlock(
            cipherText, 
            payload.iv, // Đảm bảo backend có gửi iv kèm theo nhé
            drk, 
            blockId
          );

          setBlocks(prev => prev.map(b => 
            b.id === blockId 
              ? { ...b, content: plainText, status: "saved", editorName: null } 
              : b
          ));
        } catch (err) {
          console.error("Không thể giải mã block vừa commit:", err);
        }
      });
    socket.on("document:error", (message) => {
      alert(message);
    })
    return () => {
      socket.off("block:locked");
      socket.off("block:unlocked");
      socket.off("block:update");
      socket.off("block:create");
      socket.off("block:delete");
      socket.off("document:error")
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

  const handleAddBlock = async (index) => {
  if (!drk || !currentUser) {
    alert("Thông tin người dùng hoặc khóa chưa sẵn sàng.");
    return;
  }

  try {
    setSavingStatus('saving');
    
    // KIỂM TRA ĐỊNH DẠNG: docID phải là 24 ký tự Hex (Ví dụ: 65b2f...)
    // Nếu docID lấy từ URL đang là UUID, bạn cần lấy đúng ID từ Database
    const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(docID);
    if (!isValidObjectId) {
       throw new Error("docID không đúng định dạng MongoDB ObjectId. Hiện tại: " + docID);
    }

    const newUUID = crypto.randomUUID();
    
    // VỚI KHỐI MỚI (Lần đầu tạo blockId này):
    const initialPrevHash = "0"; // Khởi tạo chuỗi hash đầu tiên

    const encrypted = await BlockCryptoModule.encryptBlock("", drk, newUUID);
    const combinedCipherText = `${encrypted.iv}:${encrypted.cipherText}`;

    // Tính hash cho Version 1
    const hashValue = await BlockCryptoModule.calculateBlockHash({
      blockId: newUUID,
      cipherText: combinedCipherText,
      prevHash: initialPrevHash,
      version: 1
    }, drk);

    // CHỈ GỬI 8 TRƯỜNG MÀ JOI YÊU CẦU
    const finalPayload = {
      blockId: String(newUUID),
      documentId: String(docID),
      index: Number(index),
      version: 1,
      cipherText: String(combinedCipherText),
      prevHash: String(initialPrevHash),
      hash: String(hashValue),
      epoch: Number(Date.now())
    };

    const response = await fetch(`${process.env.REACT_APP_API_URL}/blocks/${docID}`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
      },
      body: JSON.stringify(finalPayload)
    });

    const result = await response.json();

    if (!response.ok || result.status === false) {
      console.error("Chi tiết lỗi:", result);
      throw new Error(result.message || "Server trả về status: false (Lỗi 500)");
    }

    setBlocks(prev => {
      const updated = [...prev];
      updated.splice(index, 0, { ...finalPayload, id: newUUID, content: "" });
      return updated;
    });
    setSavingStatus('saved');
    
  } catch (error) {
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

      // 1. Sinh khóa DRK mới cho tài liệu này
      const newDrk = BlockCryptoModule.generateDRK(); 
      setDrk(newDrk); // Lưu vào state để handleAddBlock có thể sử dụng

      // 2. Reset danh sách blocks về mảng rỗng theo yêu cầu của bạn
      setBlocks([]); 

      // 3. Reset lịch sử Undo/Redo về trạng thái trống ban đầu
      setHistory([[]]); 
      setCurrentIndex(0);

      // 4. Cập nhật các thông tin hiển thị
      setDocTitle("Tài liệu mới không có tiêu đề");
      setActiveBlockId(null);

      // 5. Lưu DB
      const res = await fetch(`${process.env.REACT_APP_API_URL}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: "Tài liệu mới", owner: currentUser })
      });

      console.log("Đã khởi tạo môi trường tài liệu mới. Hãy nhấn 'Add New Block' để bắt đầu.");
      setSavingStatus('saved');
    } catch (error) {
      console.error("Lỗi khi khởi tạo tài liệu mới:", error);
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