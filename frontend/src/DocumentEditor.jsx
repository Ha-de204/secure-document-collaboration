import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Plus } from 'lucide-react';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import EditorBlock from './components/EditorBlock';
import './styles/editor.css';
import { useParams, useNavigate } from 'react-router-dom';
import BlockCryptoModule from "./crypto/BlockManager";
import { getDB } from './storage/indexDbService';
import { createBlockVersionLocal, getLatestBlocksLocal } from './services/BlockService';
import DocumentKeyService from './services/DRKService';
import { saveDocumentLocally } from './services/DocumentService';
import axios from 'axios';

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

  const handleAddBlock = async (index, type=['text']) => {
    try{
      const db = await getDB();
      const token = localStorage.getItem('accessToken');
      const userId = localStorage.getItem('userId');

      const allDocs = await db.getAll('documents'); 
      if (!allDocs || allDocs.length === 0) throw new Error("Không tìm thấy tài liệu.");
      const currentDoc = allDocs[allDocs.length - 1]; 
      const docID = currentDoc.localDocId;

      const newUUID = crypto.randomUUID();
      const initialVersion = 1;

      const encrypted = await BlockCryptoModule.encryptBlock("", drk, newUUID);
      const combinedCipherText = `${encrypted.iv}:${encrypted.cipherText}`;

      const blockData = {
        blockId: String(newUUID),
        documentId: String(docID),
        index: Number(index),
        version: initialVersion,
        cipherText: String(combinedCipherText),
        prevHash: "0",
        hash: await BlockCryptoModule.calculateBlockHash({
          blockId: newUUID,
          cipherText: combinedCipherText,
          prevHash: "0",
          version: initialVersion
        }, drk),
        epoch: 0
      };

      // gui data len server
      const response = await fetch(`${process.env.REACT_APP_API_URL}/blocks/${docID}`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(blockData)
      });

      if (!response.ok) {
        throw new Error(`Lỗi Server: ${response.status}`);
      }

      // luu indexDB
      const result = await createBlockVersionLocal(userId, blockData);
      if (result.status) {
        const updatedBlocks = await getLatestBlocksLocal(docID);
        setBlocks(updatedBlocks);
      }
      setSavingStatus('saved');
      console.log("Block mới đã được mã hóa và lưu qua Service thành công!");
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

  // tao doc moi
    const handleNewDocument = async () => {
      try {
        setSavingStatus('saving');
        const newDrk = BlockCryptoModule.generateDRK();

        const db = await getDB();
        const userId = localStorage.getItem('userId');
        const userName = localStorage.getItem('userName');
        let publicKey = null;

        // kiem tra indexDB
        const myIdentity = await db.get('identityKey', userName);
        if (myIdentity && myIdentity.publicKey) {
          publicKey = myIdentity.publicKey;
        } else {
          // Nếu không có (ví dụ máy mới), mới lấy từ publicKeys hoặc API
          const contact = await db.get('publicKeys', userId);
          publicKey = contact?.publicKey;
        }

        // Nếu vẫn không có, gọi API
        if (!publicKey) {
          const response = await axios.get(`${process.env.REACT_APP_API_URL}/users/${userId}`);
          publicKey = response.data.data?.identityKey || response.data.data?.IdentityKey;
        }

        if (!publicKey) throw new Error("Không tìm thấy Public Key để mã hóa tài liệu.");
         // luu lai vao indexDB
          await db.put("publicKeys", {
            userId, userId,
            userName: userName,
            publicKey: publicKey,
            createdAt: new Date()
          });

        // Ma hoa newDRK
        const encryptedDRK = await BlockCryptoModule.encryptWithPublicKey(publicKey, newDrk);
        console.log("Dữ liệu DRK đã mã hóa:", encryptedDRK);
        const myPrivateKey = window.myPrivateKey;
        if (!myPrivateKey) {
          // Nếu mất session, yêu cầu người dùng nhập lại pass hoặc tự động lấy từ state quản lý
          alert("Phiên làm việc hết hạn, vui lòng mở khóa lại ví!");
          return;
        }
        const signature = await BlockCryptoModule.signData(encryptedDRK, myPrivateKey);

        const newDocData = {
          ownerId: userId,
          title: "Tài liệu chưa có tiêu đề",
          epoch: 0,
          metadata: {
            description: "",
          },
          shareWith: [],
          publicMetadata: false,
        };

        // Luu data len server
        const token = localStorage.getItem('accessToken');
        const res = await fetch(`${process.env.REACT_APP_API_URL}/documents`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}` 
          },
          body: JSON.stringify(newDocData)
        });
        const docResult = await res.json();
        if (!res.ok) throw new Error(docResult.message || "Server từ chối tạo Document");
        const serverDocId = docResult.data._id;

        // luu khoa len server
        const keyRes = await fetch(`${process.env.REACT_APP_API_URL}/doc-keys`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}` 
          },
          body: JSON.stringify({
            documentId: serverDocId, 
            encryptedDRK: encryptedDRK,
            signature: signature,
            epoch: 0
          })
        });
        const keyResult = await keyRes.json();
        if (!keyResult.status) throw new Error("Không thể lưu khóa trên server");

         // 2. Luu meta doc
        const savedDoc = await saveDocumentLocally({
          ...newDocData,
          serverId: serverDocId 
        });
        const localId = savedDoc.localDocId;

        // 3. Lưu khoa vào IndexedDB 
        const drkModel = {
          documentId: localId,
          epoch: 0,
          encryptedDRK: encryptedDRK,
          signedBy: userId,
          signature: signature,
          createdAt: new Date()
        }
        await DocumentKeyService.saveDRK(drkModel);

        if (localId) {
          // 4. Điều hướng người dùng tới trang chỉnh sửa với ID vừa tạo
          navigate(`/document/${localId}`);
        }
      } catch (error) {
        console.error("Lỗi khi tạo tài liệu mới:", error);
        alert("Không thể tạo tài liệu mới, vui lòng thử lại.");
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