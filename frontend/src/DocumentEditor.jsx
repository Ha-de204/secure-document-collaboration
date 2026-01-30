import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Plus } from 'lucide-react';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import EditorBlock from './components/EditorBlock';
import './styles/editor.css';
import { useParams, useNavigate } from 'react-router-dom';
import BlockCryptoModule from "./crypto/BlockManager";
import { getDB } from './storage/indexDbService';
import { getPublicKey, savePublicKey } from './services/PublicKeyService';
import { getMyKey } from './services/IdentityKy';
import { createBlockVersionLocal, getLatestBlocksLocal, getBlockHistory } from './services/BlockService';
import DocumentKeyService from './services/DRKService';
import { saveDocumentLocally, getLocalDocument } from './services/DocumentService';
import axios from 'axios';
import { unlockIdentity } from './crypto/IdentityManager';
import { inviteUserToDocument } from './services/DocumentService';
import "./document.css"
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
  const [isOwner, setIsOwner] = useState(currentUser.userId);
  // History management
  const [currentIndex, setCurrentIndex] = useState(0);
  const [history, setHistory] = useState([[]]);
  const [publicKey, setPublicKey] = useState(new Map());
  const [isOpenHistory, setIsOpenHistory] = useState(false);
  const [historyBlock, setHistoryBlock] = useState([])
  const isRestoringHistory = useRef(false);
  const [zoom, setZoom] = useState(100);
  const [fontFamily, setFontFamily] = useState("Arial");                                    
  const [fontSize, setFontSize] = useState(11);
  const historyTimer = useRef(null);
  const historyRef = useRef(history);
  const indexRef = useRef(0);
  const blocksRef = useRef(blocks);
  const lastFocusedBlockIdRef = useRef(null);
  const hasPendingHistory = useRef(false);
  const [textFormats, setTextFormats] = useState({
    bold: false,
    italic: false,
    underline: false,
    strikethrough: false,
    color: '#000000'
  });
  const drkMapRef = useRef(new Map());

  const cloneBlocks = (blocks) => blocks.map(b => ({ ...b }));
  
  // Hàm dùng chung để áp dụng một bước lịch sử
  const applyHistoryStepRefactored = async (stepIndex) => {
    try {
      const targetState = JSON.parse(JSON.stringify(history[stepIndex]));

      // 1. Cập nhật giao diện local
      setBlocks(targetState);
      indexRef.current = stepIndex;
      setCurrentIndex(stepIndex);

      // 2. Đồng bộ các thay đổi lên Server/Socket
      const blocksToSync = targetState.filter(targetBlock => {
        const currentBlock = blocksRef.current.find(b => b.id === targetBlock.id);
        return !currentBlock || currentBlock.content !== targetBlock.content;
      });

      for (const block of blocksToSync) {
        await syncBlockToNetwork(block);
      }
    } catch (error) {
      console.error("Lỗi khi áp dụng bước lịch sử:", error);
    }
  };

  // Hàm thêm trạng thái hiện tại vào lịch sử
  const addToHistory = useCallback((newBlocks) => {
    try {
      const clonedBlocks = JSON.parse(JSON.stringify(newBlocks));
      setHistory(prevHistory => {
        const updatedHistory = [...prevHistory.slice(0, indexRef.current + 1), clonedBlocks];
        indexRef.current = updatedHistory.length - 1;
        return updatedHistory;
      });
    } catch (error) {
      console.error("Lỗi khi thêm vào lịch sử:", error);
    }
  }, []);

 const syncWithServer = async (docID) => {
  try {
    const token = localStorage.getItem('accessToken');
    setSavingStatus('syncing');
    // lay document 
    const db = await getDB();
    let document = await db.get('documents', docID);
    if (!document) {
      // load document metadata tu server
     const res = await fetch(`${process.env.REACT_APP_API_URL}/documents/${docID}`, {
      method: 'GET',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      document = data.data;
      // bao k ton tai
      if(!document) {
        alert("Document không tồn tại hoặc đã bị xóa trên server.");
        throw new Error("Document không tồn tại hoặc đã bị xóa trên server.");
      }
      await saveDocumentLocally(document);
      
    }
    // lay ownerPublicKey
    let ownerPublicKey = await getPublicKey(document.ownerId);
    if(!ownerPublicKey) {
      const userRes = await fetch(`${process.env.REACT_APP_API_URL}/users/${document.ownerId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      const userData = await userRes.json();
      ownerPublicKey = userData?.identityKey || userData?.IdentityKey;
      if(!ownerPublicKey){
      throw new Error("Không lấy được Public Key của chủ sở hữu tài liệu.");
      }
      setPublicKey(prevMap => {
        const updatedMap = new Map(prevMap); 
        updatedMap.set(userData._id, ownerPublicKey);
        return updatedMap;
      })
      savePublicKey({
        userId: document.ownerId,
        userName: userData.userName,
        publicKey: ownerPublicKey
      });
    }
    

    const response = await fetch(`${process.env.REACT_APP_API_URL}/blocks/lastest-version/${docID}`, {
      method: 'GET',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
    const serverBlocks = (await response.json()).data;

    const localBlocks = await getLatestBlocksLocal(docID);

    const processedBlockIds = new Set();
    for (const sMeta of serverBlocks) {
      processedBlockIds.add(sMeta.blockId);
      const lBlock = localBlocks.find(l => l.blockId === sMeta.blockId);

      if (!lBlock || sMeta.version > lBlock.version) {

        console.log(`Đồng bộ lịch sử block ${sMeta.blockId} từ Server...`);
        const startVersion = lBlock ? (lBlock.version + 1 ): 1;
        const versions = Array.from(
          { length: sMeta.version - startVersion + 1 }, 
          (_, i) => startVersion + i
        );
        const blockId = sMeta.blockId;
        const versionOfBlock = await fetch(`${process.env.REACT_APP_API_URL}/blocks/versions/${blockId}`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(versions)
          });
          const freshBlock = await versionOfBlock.json();
          // ktra day version nhan dc (neu dung thi luu trong indexdb)
        const valid = await BlockCryptoModule.verifyBatchBlocks(freshBlock,lBlock,ownerPublicKey);
        // cap nhat block moi nhat
        if (valid.status) {
          
        }

      }
    }

    const finalBlocks = await getLatestBlocksLocal(docID);
    setBlocks(finalBlocks);
    setSavingStatus('saved');

  } catch (error) {
    console.error("Lỗi đồng bộ:", error);
    setSavingStatus('error');
  }
};

const syncDocumentData = async () => {
  // Không sync nếu đang trong quá trình lưu để tránh xung đột
  // if (savingStatus === 'saving') return;

  // try {
  //   const response = await axios.get(`${process.env.REACT_APP_API_URL}/blocks/lastest-version/${id}`, {
  //     headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` }
  //   });
  //   console.log("Đồng bộ định kỳ với server:", response.data);

  //   const latestBlocks = response.data.data;
  //   if (!latestBlocks) return;

  //   // Giải mã dữ liệu mới từ server
  //   const decryptedBlocks = await Promise.all(latestBlocks.map(async (b) => {
  //     const blockEpoch = b.epoch ?? 0;
  //     const correctDrk = drkMapRef.current.get(blockEpoch);
  //     let plainText = "";
  //     if (correctDrk && b.cipherText && b.cipherText.includes(':')) {
  //       const [iv, cipher] = b.cipherText.split(':');
  //       plainText = await cryptoRef.current.decryptBlock(cipher, iv, correctDrk, b.blockId);
  //     }
  //     return { 
  //       ...b, 
  //       content: plainText, 
  //       id: b.blockId, 
  //       blockId: b.blockId,
  //       status: 'saved' 
  //     };
  //   }));

  //   // Cập nhật State một cách thông minh
  //   setBlocks(prev => {
  //     return decryptedBlocks.map(serverBlock => {
  //       // Nếu là block người dùng đang gõ (active), GIỮ NGUYÊN nội dung local
  //       if (serverBlock.blockId === activeBlockId) {
  //         const localActive = prev.find(lb => lb.blockId === activeBlockId);
  //         return localActive || serverBlock;
  //       }
        
  //       // Với các block khác, chỉ cập nhật nếu version server cao hơn
  //       const localMatch = prev.find(lb => lb.blockId === serverBlock.blockId);
  //       if (!localMatch || serverBlock.version > localMatch.version) {
  //         return serverBlock;
  //       }
  //       return localMatch;
  //     });
  //   });

  //   // Luôn đồng bộ Ref để các hàm khác lấy được Hash mới nhất
  //   blocksRef.current = decryptedBlocks;

  // } catch (error) {
  //   console.error("Sync định kỳ thất bại:", error);
  // }
};

  useEffect(() => {
    if (!id || !socket) return;

    socket.emit("document:join", { documentId: id });

    return () => {
      socket.emit("document:leave", { documentId: id });
    };
  }, [id, socket]);

  useEffect(() => {
    if (!id || !drk) return;

    const interval = setInterval(() => {
      syncDocumentData();
    }, 10000);

    return () => clearInterval(interval);
  }, [id, drk, activeBlockId, savingStatus]);


  const isProcessing = useRef(false);

  useEffect(() => {
    const loadDocumentData = async () => {
      if (!id) return;
      setBlocks([]); 
      setSavingStatus('loading');
      if (isProcessing.current) return;
      isProcessing.current = true;
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
          
          // Kiểm tra xem user có phải owner không
          const userId = localStorage.getItem('userId');
          const docOwnerId = localDoc.ownerId?._id || localDoc.ownerId;
          setIsOwner(docOwnerId === userId);
          
          const drkMap = new Map();
          let myPrivateKey = window.myPrivateKey;
          if (!myPrivateKey) {
            const password = prompt("Tài liệu này đã được mã hóa. Vui lòng nhập mật khẩu ví để mở khóa:");
            if (!password){
              navigate('/');
              isProcessing.current = false;
              return;
            }
            const userName = localStorage.getItem('userName');
            myPrivateKey = (await unlockIdentity(userName, password)).privateKey;
            window.myPrivateKey = myPrivateKey;
          }
          
          // Lấy tất cả epoch của doc
          let allKeyRecords = await DocumentKeyService.getAllEpochsForDocument(id);
          if (allKeyRecords.length === 0) {
            try {
              const token = localStorage.getItem('accessToken');
              const res = await axios.get(`${process.env.REACT_APP_API_URL}/doc-keys/${id}`, {
                  headers: { 'Authorization': `Bearer ${token}` }
              });

              if (res.data.status && res.data.data.length > 0) {
                  // Lưu các khóa tải được vào IndexedDB để dùng sau này
                  for (const key of res.data.data) {
                    let signerKeyInfo = await getPublicKey(docOwnerId)
                    
                    if (!signerKeyInfo) {
                        // Nếu chưa có, tải từ server
                        const userRes = await axios.get(`${process.env.REACT_APP_API_URL}/users/${key.userId}`, {
                            headers: { 'Authorization': `Bearer ${token}` }
                        });
                        const pubKeyString = userRes.data?.identityKey;
                        
                        if (pubKeyString) {
                            signerKeyInfo = { publicKey: pubKeyString };
                            await savePublicKey({
                              userId: key.userId,
                              userName: key.userName || 'Unknown',  
                              publicKey: pubKeyString,
                              metadata: ""
                            });
                            
                        }
                    }

                    const dataToVerify = `doc:${id}|epoch:${key.epoch}|drk:${key.encryptedDocKey}`;
                    const isValid = await BlockCryptoModule.verifySignature(
                        dataToVerify,
                        key.signature,
                        signerKeyInfo
                    );

                    if (!isValid) {
                        console.error(`❌ Chữ ký cho Epoch ${key.epoch} KHÔNG hợp lệ! Bỏ qua khóa này.`);
                        continue;  
                    }
                      await DocumentKeyService.saveDRK({
                          documentId: id,
                          epoch: key.epoch,
                          encryptedDRK: key.encryptedDocKey,
                          signedBy: key.userId,
                          signature: key.signature,
                          createdAt: key.createdAt || new Date()
                      });
                      const decryptedDRK = await BlockCryptoModule.decryptWithPrivateKey(
                        myPrivateKey, 
                        key.encryptedDRK
                      );
                      drkMap.set(key.epoch, decryptedDRK);
                  }
                  // Lấy lại danh sách sau khi đã lưu
                  allKeyRecords = await DocumentKeyService.getAllEpochsForDocument(id);
              } else {
                  throw new Error("Không tìm thấy khóa tài liệu trên server.");
              }
          } catch (err) {
              console.error("Lỗi khi tải DRK từ server:", err);
              setSavingStatus('error');
              return;
          }
          }

          for (const keyData of allKeyRecords) {
            const decryptedDRK = await BlockCryptoModule.decryptWithPrivateKey(
              myPrivateKey,
              keyData.encryptedDRK
            );
            drkMap.set(keyData.epoch, decryptedDRK);

          }
            // sync vs server
            await syncWithServer(id);
           
            const latestKeyRecord = allKeyRecords[0];
            drkMapRef.current = drkMap;
            setDrk(drkMap.get(latestKeyRecord.epoch));

            const latestBlocks = await getLatestBlocksLocal(id);
            
            // Nếu là doc mới tạo, block rỗng
            if (latestBlocks.length === 0) {
              setBlocks([]);
              blocksRef.current = [];
              addToHistory([]);
            } else {
              const decryptedBlocks = await Promise.all(latestBlocks.map(async (b) => {
                const finalId = b.blockId || b.id || b._id;
                try {
                  const dataToDecrypt = b.cipherText || b.content || "";
                  let plainText = "";

                  if (dataToDecrypt && typeof dataToDecrypt === 'string' && dataToDecrypt.includes(':')) {
                    const [ivPart, cipherPart] = dataToDecrypt.split(':');
                    const blockDRK = drkMap.get(b.epoch || 0);

                    if (!blockDRK) {
                      console.warn(`Thiếu khóa cho epoch ${b.epoch} của block ${finalId}`);
                      return { ...b, content: "[Nội dung bị khóa hoặc chưa có quyền đọc]", id: finalId };
                    }

                    plainText = await BlockCryptoModule.decryptBlock(cipherPart, ivPart, blockDRK, b.blockId);
                    return { ...b, content: plainText, id: b.finalId, blockId: finalId, };
                  }

                  
                  return { ...b, content: b.content || "", id: finalId, blockId: finalId, };
                } catch (e) {
                  return { ...b, content: "[Lỗi giải mã]", id: finalId };
                }
              }));

              if (decryptedBlocks.length > 0) {
                setBlocks(decryptedBlocks);
                setHistory([JSON.parse(JSON.stringify(decryptedBlocks))]); 
                setCurrentIndex(0);
              } else {
                setBlocks([]);
                setHistory([[]]);
                setCurrentIndex(0);
              }
            }
            setSavingStatus('saved');
          
        }
      } catch (err) {
        if (err.response && err.response.status === 404) {
          console.error("❌ Tài liệu không tồn tại trên cả Local và Server.");
        } else {
          console.error("Lỗi khi tải tài liệu:", err);
        }
      }
      finally {
        isProcessing.current = false;
      }
    };

    loadDocumentData();
  }, [id, addToHistory, navigate]);  

  // Thêm vào DocumentEditor.jsx
  const editingTimeouts = useRef({});
  // SOCKET LISTENERS
  useEffect(() => {
      if (!socket || !drk) return;
  
      socket.on("document:request_access", ({ blockId, result }) => {
      setBlocks(prev =>
        prev.map(b =>
          (b.blockId === blockId || b.id === blockId)
            ? {
              ...b,
              status: "locked",
              editorName: result.userId
            }
          : b
        )
      );
    });
  
    socket.on("document:remove_access", ({ blockId, result }) => {
      setBlocks(prev =>
        prev.map(b =>
          (b.blockId === blockId || b.id === blockId)
            ? {
              ...b,
              status: "saved",
              editorName: null
            }
          : b
        )
      );
    });
    
      socket.on("block:editing", async payload => {
         const {
          blockId,
          cipherText,
          userId,
          version,
          hash,
          index,
          isNew,
          epoch
        } = payload;

        if (blockId === activeBlockId) return;
        
        if (cipherText && cipherText.includes(':')) {
          try {
            const [iv, cipher] = cipherText.split(':');
  
            const targetBlock = blocksRef.current.find(b => b.blockId === blockId || b.id === blockId);
            const blockEpoch = epoch ?? targetBlock?.epoch ?? 0; 
            const correctDrk = drkMapRef.current.get(blockEpoch);

            if (!correctDrk) {
              console.error(`Không tìm thấy khóa cho Epoch ${blockEpoch} để giải mã update.`);
              return;
            }
  
            // giải mã nội dung
            const plainText = await cryptoRef.current.decryptBlock(
              cipher, 
              iv, 
              correctDrk, 
              blockId
            );
  
            // cập nhật giao diện
            setBlocks(prev => {
              let blocks = [...prev];
              const existingIndex = blocks.findIndex(b =>
                b.blockId === blockId || b.id === blockId || b._id === blockId
              );

              if (existingIndex === -1) {
                const newBlock = {
                  blockId,
                  id: blockId,
                  content: plainText,
                  version: version || 1,
                  hash: hash || "0",
                  epoch: blockEpoch,
                  status: "saved",
                  editorName: userId
                };
                if (isNew) {
                  const insertAt = (typeof index === 'number') ? index : blocks.length;
                  blocks.splice(insertAt, 0, newBlock);
                } else {
                  blocks.push(newBlock);
                }
              }

              else {
                blocks = blocks.map(b => {
                  if (b.blockId === blockId || b.id === blockId) {

                    if ((version || 0) < (b.version || 0)) return b;
                    if (editingTimeouts.current[blockId]) {
                        clearTimeout(editingTimeouts.current[blockId]);
                    }

                    // Sau 3 giây không gõ nữa thì chuyển status về 'saved' (hết màu xanh)
                    editingTimeouts.current[blockId] = setTimeout(() => {
                        setBlocks(prev => prev.map(b => 
                            (b.blockId === blockId || b.id === blockId) 
                            ? { ...b, status: 'saved' } 
                            : b
                        ));
                        delete editingTimeouts.current[blockId];
                    }, 2000);
                    return {
                      ...b,
                      content: plainText,
                      version,
                      hash: hash || b.hash,
                      epoch: blockEpoch,
                      status: "editing",
                      editorName: userId
                    };
                  }
                  return b;
                  
                });
              }
              return blocks.map((b, i) => ({ ...b, index: i }));
            });
          } catch (err) {
            console.error("Lỗi giải mã block từ socket:", err);
          }
        }
      });
  
      socket.on("block:commit", async (payload) => {
        try {
          const { blockId, cipherText, epoch, version, hash, prevHash } = payload;

          const [iv, cipher] = cipherText.split(':');
          const correctDrk = drkMapRef.current.get(epoch);
          if (!correctDrk) return;

          const plainText = await cryptoRef.current.decryptBlock(cipher, iv, correctDrk, blockId);

          setBlocks(prev => {
            const updated = prev.map(b => {
              if (b.blockId === blockId || b.id === blockId) {

                if (version < (b.version || 0)) return b;

                return {
                  ...b,
                  content: plainText,
                  version,
                  hash,
                  prevHash,
                  status: "saved",
                  editorName: null
                };
              }
              return b;
            });

            addToHistory(updated);
            return updated;
          });

          const db = await getDB();
          await db.put('blocks', {
            ...payload,
            id: blockId,
            content: plainText
          });

        } catch (err) {
          console.error("Realtime commit error:", err);
        }
      });


      socket.on("document:key_rotated", async ({ documentId, epoch, by }) => {
        console.log(`🔄 Key được xoay bởi ${by} - Epoch: ${epoch}`);
        // Cập nhật DRK mới từ server
        try {
          const allKeyRecords = await DocumentKeyService.getAllEpochsForDocument(id);
          
          for (const keyData of allKeyRecords) {
            const decryptedDRK = await BlockCryptoModule.decryptWithPrivateKey(
              window.myPrivateKey,
              keyData.encryptedDRK
            );
            drkMapRef.current.set(keyData.epoch, decryptedDRK);
          }

          const latestKeyRecord = allKeyRecords[0];
          setDrk(drkMapRef.current.get(latestKeyRecord.epoch));
          console.log("✅ Đã cập nhật DRK mới");
        } catch (error) {
          console.error("Lỗi khi cập nhật DRK từ key rotation:", error);
        }
      });
  
      return () => {
        socket.off("document:request_access");
        socket.off("document:remove_access");
        socket.off("block:editing");
        socket.off("block:commit");
        socket.off("document:key_rotated");
      };
    }, [socket, drk, activeBlockId]);

  // cập nhật blockRef khi blocks thay đổi để socket đọc được giá trị blocks mới nhất
  useEffect(() => {
    blocksRef.current = blocks;
  }, [blocks]);

  const saveBlockToServer = async (blockId, content, oldHash, updatedVersion, blockToSave, blockIndex) => {
    const userId = localStorage.getItem('userId');
    const token = localStorage.getItem('accessToken');

    if (blockToSave && userId && drk) {
        try {
            const encrypted = await BlockCryptoModule.encryptBlock(content, drk, blockId);
            const combined = `${encrypted.iv}:${encrypted.cipherText}`;

            const fullBlockData = {
                blockId: String(blockId),
                authorId: String(userId),
                documentId: id,
                index: Number(blockIndex),
                version: Number(updatedVersion),
                cipherText: String(combined),
                prevHash: String(oldHash),
                epoch: Number(blockToSave.epoch || 0)
            };

            const newHash = await BlockCryptoModule.calculateBlockHash(fullBlockData, drk);
            const { authorId, ...dataPayload } = fullBlockData;
            const finalPayload = { ...dataPayload, hash: newHash };

            const response = await fetch(`${process.env.REACT_APP_API_URL}/blocks/${id}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(finalPayload)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || "Lỗi API");
            }

            setBlocks(prev => prev.map(b =>
                (b.blockId === blockId || b.id === blockId)
                    ? { ...b, hash: newHash, version: updatedVersion }
                    : b
            ));

            const targetIdx = blocksRef.current.findIndex(b => b.blockId === blockId || b.id === blockId);
            if (targetIdx !== -1) {
                blocksRef.current[targetIdx].hash = newHash;
                blocksRef.current[targetIdx].version = updatedVersion;
            }
            socket.emit("block:editing", {
              documentId: id,
              blockId,
              cipherText: combined, // Nội dung cuối cùng đã lưu
              version: updatedVersion,
              hash: newHash,        // <--- ĐÂY LÀ ĐIỂM QUAN TRỌNG NHẤT
              userId: userId,
              epoch: blockToSave.epoch,
              index: blockIndex,
              status: "saved"
            })

            await createBlockVersionLocal(userId, finalPayload);

            socket.emit("block:committed", { documentId: id, blockId, cipherText: combined, epoch: blockToSave.epoch, version: updatedVersion, hash: newHash });

            setSavingStatus('saved');
        } catch (error) {
            console.error("Lỗi khi lưu block local:", error);
            setSavingStatus('error');
        }
    }
};

  const handleBlockChange = async (blockId, content) => {
    const currentBlockInState = blocksRef.current.find(b => b.blockId === blockId || b.id === blockId || b._id === blockId);
    if (currentBlockInState && currentBlockInState.content === content) {
      return; 
    }

    setSavingStatus('saving');

    const oldVersion = currentBlockInState ? (currentBlockInState.version || 1) : 1;
    const oldHash = currentBlockInState ? (currentBlockInState.hash || "0") : "0";
    let updatedVersion = oldVersion + 1;
    
    const userId = localStorage.getItem("userId");
    const blockIndex = currentBlockInState?.index ?? 0;

     setBlocks(prev => prev.map(block => {
      if (block.blockId === blockId || block.id === blockId || block._id === blockId) {
        updatedVersion = (block.version || 1) + 1;
        return { ...block, content, version: updatedVersion };
      }
      return block;
    }));

    const targetIdx = blocksRef.current.findIndex(b => b.blockId === blockId || b.id === blockId || b._id === blockId);
    if (targetIdx !== -1) {
        blocksRef.current[targetIdx].content = content;
        blocksRef.current[targetIdx].version = updatedVersion;
    }

    if (drk && socket) {
      try {
        const encrypted = await BlockCryptoModule.encryptBlock(content, drk, blockId);
        const combined = `${encrypted.iv}:${encrypted.cipherText}`;

        socket.emit("block:editing", {
          documentId: id,
          blockId,
          cipherText: combined,
          version: updatedVersion,
          hash: null,
          editor: userId,
          ts: Date.now(),
          index: blockIndex,
          isNew: false
        });

      } catch (e) {
        console.warn("Encrypt realtime typing failed", e);
      }
    }
      
    clearTimeout(window.saveTimeout);
    window.saveTimeout = setTimeout(async () => {
        const currentBlocks = blocksRef.current;
        const blockIndex = currentBlocks.findIndex(b => b.blockId === blockId || b.id === blockId);
        const blockToSave = currentBlocks[blockIndex];
        await saveBlockToServer(blockId, content, oldHash, updatedVersion, blockToSave, blockIndex);
    }, 10000);

    clearTimeout(window.historyTimeout);
    window.historyTimeout = setTimeout(() => {
      addToHistory(blocksRef.current);
    }, 10000);
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
      const latestKey = await DocumentKeyService.getLatestDRK(id);

      const encrypted = await BlockCryptoModule.encryptBlock("", drk, newUUID);
      const combinedCipherText = `${encrypted.iv}:${encrypted.cipherText}`;

      const blockData = {
        blockId: String(newUUID),
        authorId: String(userId),
        documentId: currentServerDocId,
        index: Number(index + 1),
        version: initialVersion,
        cipherText: String(combinedCipherText),
        prevHash: "0",
        epoch: latestKey.epoch
      };

      const calculatedHash = await BlockCryptoModule.calculateBlockHash(blockData, drk);
      blockData.hash = calculatedHash;

      const { authorId, ...serverPayload } = blockData;
      
      // gui data len server
      const response = await fetch(`${process.env.REACT_APP_API_URL}/blocks/${currentServerDocId}`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ ...serverPayload, hash: calculatedHash })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `Lỗi Server: ${response.status}`);
      }

      // luu indexDB
      await createBlockVersionLocal(userId, blockData);

      const newBlockForUI = { 
        ...blockData, 
        content: "", 
        status: 'saved',
        lockedBy: null
      };

      setBlocks(prev => {
        const newBlocks = [...prev];
        newBlocks.splice(index + 1, 0, newBlockForUI);

        return newBlocks.map((b, i) => ({ ...b, index: i }));
      });

      socket.emit("block:editing", {
        documentId: currentServerDocId,
        blockId: newUUID,
        cipherText: combinedCipherText,
        version: initialVersion,
        hash: calculatedHash,
        editor: userId,
        ts: Date.now(),
        index: index + 1,
        isNew: true
      });

      addToHistory(blocksRef.current);
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

    setBlocks(prev => {
      const updated = prev.map(block => {
        if (block.id === activeBlockId) {
          return { 
            ...block, 
            textAlign: alignment,
            version: (block.version || 0) + 1 
          };
        }
        return block;
      });
      
      // Đưa vào history sau khi cập nhật state
      addToHistory(updated); 
      return updated;
    });

    setTimeout(() => setSavingStatus('saved'), 600);
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

  const handleBlockBlur = async (id) => {
    setActiveBlockId(null);
    const el = document.getElementById(`block-${id}`);
    if (el) {
      el.style.backgroundColor = "transparent";
      el.style.backgroundColor = ""; 
      el.style.borderColor = "";
      el.style.borderWidth = "";
      el.blur();
    }
    if (socket && id) {
        setTimeout(() => {
            socket.emit('block:unlock', { blockId: id });
        }, 100);

        const blockToBlur = blocksRef.current.find(b => b.blockId === id || b.id === id);
        if (blockToBlur) {
            const currentContent = blockToBlur.content;
            const oldVersion = blockToBlur.version || 1;
            const oldHash = blockToBlur.hash || "0";
            const blockIndex = blocksRef.current.findIndex(b => b.blockId === id || b.id === id);
            await saveBlockToServer(id, currentContent, oldHash, oldVersion + 1, blockToBlur, blockIndex);
        }
    }
  };

  // Hàm Undo
  const handleUndo  = async () => {
    if (indexRef.current > 0) {
      const nextIdx = indexRef.current - 1;
      await applyHistoryStepRefactored(nextIdx);
    }
  };

  // Hàm Redo
 const handleRedo = async () => {
    if (indexRef.current < history.length - 1) {
      const nextIdx = indexRef.current + 1;
      await applyHistoryStepRefactored(nextIdx);
    }
  };

  // Hàm dùng chung để áp dụng một bước lịch sử
  const applyHistoryStep = async (stepIndex) => {
    try {
      const targetState = JSON.parse(JSON.stringify(history[stepIndex]));

      // 1. Cập nhật giao diện local
      setBlocks(targetState);
      indexRef.current = stepIndex;
      setCurrentIndex(stepIndex);

      // 2. Tạo phiên bản block mới thay vì đồng bộ lên server/socket
      const userId = localStorage.getItem('userId');
      const token = localStorage.getItem('accessToken');

      for (const targetBlock of targetState) {
        const blockDRK = drkMapRef.current.get(targetBlock.epoch);
        if (!blockDRK) {
          console.warn(`Không tìm thấy DRK cho block ${targetBlock.id}`);
          continue;
        }

        const encrypted = await BlockCryptoModule.encryptBlock(targetBlock.content, blockDRK, targetBlock.id);
        const combined = `${encrypted.iv}:${encrypted.cipherText}`;
        const newVersion = (targetBlock.version || 0) + 1;

        const newBlockData = {
          ...targetBlock,
          version: newVersion,
          cipherText: combined,
          prevHash: targetBlock.hash,
        };

        const newHash = await BlockCryptoModule.calculateBlockHash(newBlockData, blockDRK);
        newBlockData.hash = newHash;

        // Lưu vào local
        await createBlockVersionLocal(userId, newBlockData);

        // Lưu lên server
        await fetch(`${process.env.REACT_APP_API_URL}/blocks/${id}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(newBlockData),
        });

        // Cập nhật giao diện
        setBlocks((prev) =>
          prev.map((block) =>
            block.id === targetBlock.id
              ? { ...block, version: newVersion, hash: newHash, content: targetBlock.content }
              : block
          )
        );
      }
    } catch (error) {
      console.error("Lỗi khi áp dụng bước lịch sử:", error);
    }
  };

  // Hàm bổ trợ để tái sử dụng logic gửi socket
  const syncBlockToNetwork = async (block) => {
    try {
      const encrypted = await BlockCryptoModule.encryptBlock(block.content, drk, block.id);
      const combined = `${encrypted.iv}:${encrypted.cipherText}`;
      const latestBlockInMemory = blocksRef.current.find(b => b.id === block.id);
      const newVersion = Math.max(block.version || 0, (latestBlockInMemory?.version || 0)) + 1;

      socket.emit("block:committed", { 
        documentId: id, 
        blockId: block.id, 
        cipherText: combined, 
        epoch: block.epoch, 
        version: newVersion 
      });
    } catch (e) {
      console.error("Lỗi đồng bộ khi Undo/Redo:", e);
    }
  };
  const timeoutsRef = useRef({});
  const handleBlockFocus = async (id) => {
  // 1. Xóa mọi timer cũ của block này nếu có
  if (timeoutsRef.current[id]) {
    clearTimeout(timeoutsRef.current[id]);
  }
  const el = document.getElementById(`block-${id}`);
    if (el) {
    el.style.borderColor = "#dd83dd"; 
    el.style.borderStyle = "solid";
    el.style.borderWidth = "2px";
    }; 
  const token = localStorage.getItem('accessToken');
  const response = await fetch(`${process.env.REACT_APP_API_URL}/blocks/access/${id}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (response.status === 403) {
    alert("Block đang được người khác chỉnh sửa. Vui lòng thử lại sau!");
    console.warn("Block bị khóa!");
    if(el){
      el.style.borderColor = "transparent"; 
    el.style.borderStyle = "";
    el.style.borderWidth = "";
    }
    document.activeElement.blur();
    document.getElementById('editor-container')?.focus();
    return;
  }

  if (response.ok) {
    
    setActiveBlockId(id);
    lastFocusedBlockIdRef.current = id;
    socket?.emit('block:lock', { blockId: id });

    resetAutoUnlockTimer(id);
  }
};
const resetAutoUnlockTimer = (id) => {
  // Xóa đếm ngược cũ
  if (timeoutsRef.current[id]) {
    clearTimeout(timeoutsRef.current[id]);
  }

  // Tạo đếm ngược mới 15 giây
  timeoutsRef.current[id] = setTimeout(async () => {
    
    const el = document.getElementById(`block-${id}`);
    if (el) {
      el.style.backgroundColor = "transparent";
      el.style.backgroundColor = ""; 
      el.style.borderColor = "";
      el.style.borderWidth = "";
      el.blur();
    }

    // Gọi API xóa Lock
    const token = localStorage.getItem('accessToken');
    await fetch(`${process.env.REACT_APP_API_URL}/blocks/access/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });

    socket?.emit('block:unlock', { blockId: id });
    delete timeoutsRef.current[id];
  }, 3000); 
};
  
  const handleInviteUser = async (inviteUserName) => {
    try {
      setSavingStatus('saving');

      const token = localStorage.getItem('accessToken');
      const userId = localStorage.getItem('userId');

      // Tìm kiếm người dùng
      const inviteeRes = await axios.get(`${process.env.REACT_APP_API_URL}/users/username/${inviteUserName}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const invitee = inviteeRes.data;
      if (!invitee) {
        alert("Không tìm thấy user này!");
        setSavingStatus('saved');
        return;
      }

      // Kiểm tra nếu user đã được mời
      const docRes = await axios.get(`${process.env.REACT_APP_API_URL}/documents/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const currentDoc = docRes.data.data;
      // if (currentDoc.shareWith.some(s => s.userId === invitee._id || s.userId._id === invitee._id)) {
      //   alert("User này đã được mời rồi!");
      //   setSavingStatus('saved');
      //   return;
      // }

      // Mã hóa DRK bằng public key của người được mời
      const inviteePublicKey = invitee.identityKey || invitee.IdentityKey;
      if (!inviteePublicKey) {
        alert("Không thể lấy public key của user này!");
        setSavingStatus('saved');
        return;
      }
      const inviteeEncryptedKey = await BlockCryptoModule.encryptWithPublicKey(inviteePublicKey, drk);

      // Tạo payload lời mời
      const invitePayload = {
        documentId: id,
        inviteeId: invitee._id,
        // Bổ sung các trường Backend yêu cầu
        permission: "write", 
       
        signature: await BlockCryptoModule.signData(`doc:${id}|epoch:${drkMapRef.current.size - 1}|drk:${inviteeEncryptedKey}`, window.myPrivateKey),
        encryptedDrk: inviteeEncryptedKey
      };

      // // Gửi lời mời lên server
      // await axios.post(`${process.env.REACT_APP_API_URL}/invites`, invitePayload, {
      //   headers: { Authorization: `Bearer ${token}` },
      // });

      // Phát sự kiện qua socket
      socket?.emit("document:invite", invitePayload);

      // Cập nhật danh sách shareWith
     
      await axios.post(`${process.env.REACT_APP_API_URL}/documents/${id}/share`, {
        userId: invitee._id, 
        permission: "write"
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      await axios.post(`${process.env.REACT_APP_API_URL}/doc-keys`, {
        documentId: id,
        userId: invitee._id, 
        encryptedDocKey: inviteeEncryptedKey,
        signature: invitePayload.signature,
        epoch: drkMapRef.current.size - 1 
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSavingStatus('saved');
      alert(`✅ Đã mời ${inviteUserName} thành công!`);
    } catch (error) {
      console.error("Lỗi khi mời user:", error);
      setSavingStatus('error');
      alert("Lỗi: " + (error.response?.data?.message || error.message));
    }
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
        //const myIdentity = await db.get('identityKey', userName);
        const myIdentity = await getMyKey(userName);
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
          publicKey = response.data?.identityKey || response.data?.IdentityKey;
          console.log(response)
        }
        

        if (!publicKey) throw new Error("Không tìm thấy Public Key để mã hóa tài liệu.");
         // luu lai vao indexDB
        //  await saveMyKey(userName, { 
        //    userId: userId,
        //     userName: userName,
        //     publicKey: publicKey,
        //     createdAt: new Date()
        //   });
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



const pickByStep = (versions) => {
  const total = versions.length;

  let step = 1;
  if (total > 15) step = 5;
  if (total > 50) step = 8;
  if (total > 100) step = 10;
  if (total > 300) step = 30;

  return versions.filter((_, index) => index % step === 0);
};
const loadHistory = async (blockId) => {
  try {
    const versions = await getBlockHistory(blockId)

    // Giải mã nội dung plaintext cho từng phiên bản
    const decryptedVersions = await Promise.all(
      versions.map(async (version) => {
        try {
          const blockDRK = drkMapRef.current.get(version.epoch);
          if (!blockDRK) {
            return { ...version, plaintext: "[Không tìm thấy DRK]" };
          }

          const [iv, cipherText] = version.cipherText.split(":");
          const plaintext = await BlockCryptoModule.decryptBlock(cipherText, iv, blockDRK, blockId);
          return { ...version, plaintext };
        } catch (error) {
          console.error(`Lỗi giải mã phiên bản ${version.id}:`, error);
          return { ...version, plaintext: "[Lỗi giải mã]" };
        }
      })
    );
    const decrypted = decryptedVersions.sort((a, b) => b.version - a.version);
    const sampledVersions = pickByStep(decrypted);
    return sampledVersions
  } catch (error) {
    console.error("Lỗi khi tải lịch sử block:", error);
    alert("Không thể tải lịch sử block.");
  }
};



const selectHistoryVersion = async (version) => {
  try {
    const selectedVersion = historyBlock.find((v) => (v.version === version) && (v.blockId === lastFocusedBlockIdRef.current));
    if (!selectedVersion) return alert("Không tìm thấy phiên bản này.");

    const targetId = lastFocusedBlockIdRef.current;
    if (!targetId) return alert("Vui lòng chọn block cần khôi phục!");

    const currentBlock = blocksRef.current.find(b => (b.blockId || b.id) === targetId);
    if (!currentBlock) return;

    const blockDRK = drkMapRef.current.get(currentBlock.epoch);
    if (!blockDRK) throw new Error("Không tìm thấy khóa giải mã (DRK)");

    const encrypted = await BlockCryptoModule.encryptBlock(selectedVersion.plaintext, blockDRK, targetId);
    const combined = `${encrypted.iv}:${encrypted.cipherText}`;
    const newVersion = (currentBlock.version || 0) + 1;

    const updatedBlock = {
      ...currentBlock,
      content: selectedVersion.plaintext, 
      cipherText: combined,
      version: newVersion,
      prevHash: currentBlock.hash,
    };

    const newHash = await BlockCryptoModule.calculateBlockHash(updatedBlock, blockDRK);
    updatedBlock.hash = newHash;
    const dataToServer = {
      blockId: updatedBlock.blockId,
      documentId: updatedBlock.documentId,
      index: updatedBlock.index,
      version: updatedBlock.version,
      epoch: updatedBlock.epoch,
      cipherText: updatedBlock.cipherText,
      prevHash: updatedBlock.prevHash,
      hash: updatedBlock.hash
    }
    setBlocks(prev => prev.map(b => (b.blockId || b.id) === targetId ? updatedBlock : b));

    const token = localStorage.getItem('accessToken');
    await fetch(`${process.env.REACT_APP_API_URL}/blocks/${id}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(dataToServer),
    });


    socket?.emit("block:update", { 
      documentId: id, 
      blockId: targetId, 
      cipherText: combined, 
      epoch: currentBlock.epoch, 
      version: newVersion 
    });

    setIsOpenHistory(false);
    alert(`Đã khôi phục về phiên bản v.${selectedVersion.version}`);

  } catch (error) {
    console.error("Lỗi khôi phục:", error);
    alert("Có lỗi xảy ra khi khôi phục dữ liệu.");
  }
};

const handleToggleSidebar = async () => {
  if (!isOpenHistory) {
   if (!lastFocusedBlockIdRef.current) return alert("Chọn một đoạn để xem lịch sử!");
    
    const decrypted = await loadHistory(lastFocusedBlockIdRef.current)
    setHistoryBlock(decrypted);
    setIsOpenHistory(true);
  } else {
    setIsOpenHistory(false);
  }
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
        onInviteUser={handleInviteUser}
        socket={socket}
        documentId={id}
        isOwner={isOwner}
        handleToggleSidebar={handleToggleSidebar}
      />
      <div className="editor-layout" style = {{
        display: 'flex'
      }}
      >
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
              onChange={(_,newContent) => handleBlockChange(block.blockId, newContent)} 
              onEnter={() => handleAddBlock(index)}
              fontFamily={fontFamily} 
              formats={textFormats}
              socket={ socket}
            />
          ))}
          <button className="add-block-btn" onClick={() => handleAddBlock(blocks.length - 1)}><Plus size={18} /> Add New Block</button>
        </div>
      </main>
      {isOpenHistory && (
      <div className={`history-sidebar ${isOpenHistory ? 'open' : ''}`}>
      <div className="sidebar-header">
        <h3>Lịch sử đoạn văn</h3>
        <button onClick={() => setIsOpenHistory(false)}>✕</button>
      </div>

      <div className="sidebar-content">
        {historyBlock.length === 0 ? (
          <p className="empty-msg">Chưa có lịch sử cho đoạn này</p>
        ) : (
          historyBlock.map((v, index) => (
            <div key = {`${v.blockId}-${v.version}`} className="history-row">
              
              {/* Timeline */}
              <div className="timeline">
                <span className="dot" />
                {index !== historyBlock.length - 1 && <span className="line" />}
              </div>

              {/* Nội dung */}
              <div className="history-content">
                <div className="content-preview">
                  {v.plaintext
                    ? v.plaintext.replace(/<[^>]*>/g, '').substring(0, 80)
                    : '...'}
                </div>

                <button
                  className="restore-btn"
                  onClick={() => {
                    selectHistoryVersion(v.version)
                    //setIsOpenHistory(false);
                  }}
                >
                  Khôi phục
                </button>
              </div>

            </div>
          ))
        )}
      </div>

    </div>
      )}
    </div>
      <Footer />

    </div>
  );
};

export default DocumentEditor;