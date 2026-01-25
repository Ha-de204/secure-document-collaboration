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
import { saveDocumentLocally, getLocalDocument } from './services/DocumentService';
import axios from 'axios';
import { unlockIdentity } from './crypto/IdentityManager';

const DocumentEditor = ({ onLogout, socket }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const currentUser = localStorage.getItem('userName') || "Guest";
  const isInitialMount = useRef(true);

  const cryptoRef = useRef(BlockCryptoModule);
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
    if (!id || !socket) return;

    socket.emit("document:join", { documentId: id });

    return () => {
      socket.emit("document:leave", { documentId: id });
    };
  }, [id, socket]);

  useEffect(() => {
    const loadDocumentData = async () => {
      if (!id) return;
      setBlocks([]); 
      setSavingStatus('loading');

      try {
        let localDoc = await getLocalDocument(id);

        if (!localDoc) {
          const token = localStorage.getItem('accessToken');
          const res = await axios.get(`${process.env.REACT_APP_API_URL}/documents/${id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          
          if (res.data.status) {
            localDoc = await saveDocumentLocally({
                ...res.data.data,
                localDocId: id
            });
            console.log("✅ Đã đồng bộ tài liệu từ server về local");
          }
        }

        if (localDoc) {
          console.log("✅ Đã tìm thấy tài liệu:", localDoc);
          setDocTitle(localDoc.title || "Tài liệu chưa có tiêu đề");

          let myPrivateKey = window.myPrivateKey;
          if (!myPrivateKey) {
            const password = prompt("Tài liệu này đã được mã hóa. Vui lòng nhập mật khẩu ví để mở khóa:");
            if (!password){
              navigate('/');
              return;
            }
            const userName = localStorage.getItem('userName');
            myPrivateKey = await unlockIdentity(userName, password);
            window.myPrivateKey = myPrivateKey;
          }

          // Lấy lại khóa DRK từ Service
          const keyData = await DocumentKeyService.getLatestDRK(id);
          if (keyData && myPrivateKey) {
            // xác thực chữ ký số
            const db = await getDB();
            let signerKeyInfo = await db.get('publicKeys', keyData.signedBy);
            
            if (!signerKeyInfo) {
              const res = await axios.get(`${process.env.REACT_APP_API_URL}/users/${keyData.signedBy}`);
              const pubKeyString = res.data.data?.identityKey;
              
              const importedKey = await BlockCryptoModule.importPublicKey(pubKeyString);
              signerKeyInfo = { publicKey: importedKey };

              await db.put('publicKeys', {
                userId: keyData.signedBy,
                publicKey: pubKeyString, 
                createdAt: new Date()
              });
            }
            const dataToVerify = `doc:${id}|epoch:${keyData.epoch}|drk:${keyData.encryptedDRK}`;
            console.log("Data to verify:", dataToVerify);
            console.log("Signature to check:", keyData.signature);
            const isDRKValid = await BlockCryptoModule.verifySignature(
              dataToVerify,
              keyData.signature,    // Chữ ký base64
              signerKeyInfo.publicKey // Public Key của người ký
            );

            if (!isDRKValid) {
              console.error("❌ Chữ ký DRK không hợp lệ!");
              alert("Cảnh báo: Khóa tài liệu (DRK) không hợp lệ hoặc đã bị giả mạo!");
              setSavingStatus('error');
              return; 
            }
            console.log("✅ Chữ ký DRK hợp lệ. Tiến hành giải mã...");

            const decryptedDRK = await BlockCryptoModule.decryptWithPrivateKey(
                myPrivateKey, 
                keyData.encryptedDRK
            );
            setDrk(decryptedDRK);

            const latestBlocks = await getLatestBlocksLocal(id);
            
            // Nếu là doc mới tạo, block rỗng
            if (latestBlocks.length === 0) {
              setBlocks([]);
              addToHistory([]);
            } else {
              const decryptedBlocks = await Promise.all(latestBlocks.map(async (b) => {
                try {
                  const dataToDecrypt = b.cipherText || b.content || "";
                  let plainText = "";

                  if (dataToDecrypt && typeof dataToDecrypt === 'string' && dataToDecrypt.includes(':')) {
                    const [ivPart, cipherPart] = dataToDecrypt.split(':');
                    plainText = await BlockCryptoModule.decryptBlock(cipherPart, ivPart, decryptedDRK, b.blockId);
                    return { ...b, content: plainText, id: b.blockId, blockId: b.blockId, };
                  }

                  
                  return { ...b, content: b.content || "", id: b.blockId, blockId: b.blockId, };
                } catch (e) {
                  return { ...b, content: "[Lỗi giải mã]", id: b.blockId };
                }
              }));
              setBlocks(decryptedBlocks);
              addToHistory(decryptedBlocks);
            }
            setSavingStatus('saved');
          }
        }
      } catch (err) {
        if (err.response && err.response.status === 404) {
          console.error("❌ Tài liệu không tồn tại trên cả Local và Server.");
        } else {
          console.error("Lỗi khi tải tài liệu:", err);
        }
      }
    };

    loadDocumentData();
  }, [id]); 

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
  
    socket.on("block:update", async (payload) => {
      if (payload.cipherText && payload.cipherText.includes(':')) {
        const [iv, cipher] = payload.cipherText.split(':');
        const plainText = await cryptoRef.current.decryptBlock(
          cipher, 
          iv, 
          drk, 
          payload.blockId
        );
        
        setBlocks(prev =>
          prev.map(b => (b.blockId === payload.blockId || b.id === payload.blockId) 
            ? { ...b, content: plainText } 
            : b
          )
        );
      }
    });

    socket.on("block:create", payload => {
      const plain = cryptoRef.current.decryptBlock(payload);
      setBlocks(prev => [...prev, plain]);
    });

    return () => {
      socket.off("block:locked");
      socket.off("block:unlocked");
      socket.off("block:update");
      socket.off("block:create");
    };
  }, [socket, drk]);

  const handleBlockChange = (blockId, content) => {
    setSavingStatus('saving');
    const newBlocks = blocks.map(block => 
      (block.blockId === blockId || block.id === blockId) ? { ...block, content } : block
    );
    setBlocks(newBlocks);
    
    clearTimeout(window.saveTimeout);
    window.saveTimeout = setTimeout(async () => {
      const userId = localStorage.getItem('userId'); 
      const blockToSave = newBlocks.find(b => b.blockId === blockId || b.id === blockId);
      
      if (blockToSave && userId) {
        try {
          const encrypted = await BlockCryptoModule.encryptBlock(content, drk, blockId);
          const combined = `${encrypted.iv}:${encrypted.cipherText}`;

          await createBlockVersionLocal(userId, {
            ...blockToSave,
            version: (blockToSave.version || 1) + 1,
            cipherText: combined
          });

           socket.emit("block:update", { documentId: id, blockId, ciphertext: combined });

           addToHistory(newBlocks);
           setSavingStatus('saved');
        } catch (error) {
          console.error("Lỗi khi lưu block local:", error);
          setSavingStatus('error');
        }
      }
      
    }, 1000);
  };

  const handleAddBlock = async (index) => {
    if (!drk) {
      alert("Chưa có khóa giải mã. Vui lòng tải lại trang.");
      return;
    }

    try{
      setSavingStatus('saving');
      const token = localStorage.getItem('accessToken');
      const userId = localStorage.getItem('userId');

      const currentServerDocId = id;

      const newUUID = crypto.randomUUID();
      const initialVersion = 1;

      const encrypted = await BlockCryptoModule.encryptBlock("", drk, newUUID);
      const combinedCipherText = `${encrypted.iv}:${encrypted.cipherText}`;

      const blockData = {
        blockId: String(newUUID),
        documentId: currentServerDocId,
        index: Number(index + 1),
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
      const response = await fetch(`${process.env.REACT_APP_API_URL}/blocks/${currentServerDocId}`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(blockData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `Lỗi Server: ${response.status}`);
      }

      // luu indexDB
      await createBlockVersionLocal(userId, blockData);
      const newBlockForUI = { ...blockData, content: "", id: newUUID };
      const newBlocksArray = [...blocks];
      newBlocksArray.splice(index + 1, 0, newBlockForUI);
      
      const finalBlocks = newBlocksArray.map((b, i) => ({ ...b, index: i }));

      setBlocks(finalBlocks);
      addToHistory(finalBlocks);
      setSavingStatus('saved')
    } catch (error) {
      console.error("Lỗi handleAddBlock:", error.message);
      setSavingStatus('error');
      alert(error.message);
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

  // ham mo khoa block khi k focus nx
  const handleBlockBlur = (id) => {
    setActiveBlockId(null);
      if (socket && id) {
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
        if (!userName || userName === "Guest") {
          throw new Error("Vui lòng đăng nhập lại!");
        }
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
            userId: userId,
            userName: userName,
            publicKey: publicKey,
            createdAt: new Date()
          });

        // Ma hoa newDRK
        const encryptedDRK = await BlockCryptoModule.encryptWithPublicKey(publicKey, newDrk);
        console.log("Dữ liệu DRK đã mã hóa:", encryptedDRK);

        const password = window.prompt("Vui lòng nhập mật khẩu để xác thực khóa bảo mật:");
        if (password === null) { 
            setSavingStatus('saved');
            return; 
        }
        const identityData = await unlockIdentity(currentUser, password); 
        
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

        // ký
        const dataToSign = `doc:${serverDocId}|epoch:${0}|drk:${encryptedDRK}`;
        const signature = await BlockCryptoModule.signData(dataToSign, identityData.privateKey);

        // luu khoa len server
        const keyRes = await fetch(`${process.env.REACT_APP_API_URL}/doc-keys`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}` 
          },
          body: JSON.stringify({
            documentId: serverDocId, 
            userId: userId,
            encryptedDocKey: encryptedDRK,
            signature: signature,
            epoch: 0
          })
        });
        const keyResult = await keyRes.json();
        if (!keyResult.status) {
          console.log("Lỗi khi tạo Doc Key:", keyResult.message)
          throw new Error(keyResult.message || "Không thể lưu khóa tài liệu lên máy chủ.");
        }

         // 2. Luu meta doc
        
        await saveDocumentLocally({
          ...newDocData,
          localDocId: serverDocId,
          serverId: serverDocId 
        });

        // 3. Lưu khoa vào IndexedDB 
        const drkModel = {
          documentId: serverDocId,
          epoch: 0,
          encryptedDRK: encryptedDRK,
          signedBy: userId,
          signature: signature,
          createdAt: new Date()
        }
        await DocumentKeyService.saveDRK(drkModel);

        console.log("✅ Đã lưu local thành công, chuẩn bị điều hướng...");
        navigate(`/document/${serverDocId}`, { replace: true });
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
              key={block.blockId || block.id}
              block={block} 
              isLocked={block.status === 'locked'}
              isFocused={activeBlockId === (block.blockId || block.id)}
              onFocus={() => handleBlockFocus(block.blockId || block.id)} 
              onBlur={() => handleBlockBlur(block.blockId || block.id)}
              onChange={handleBlockChange} 
              onEnter={() => handleAddBlock(index)}
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

