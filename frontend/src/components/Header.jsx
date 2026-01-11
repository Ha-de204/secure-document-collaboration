import React, { useState } from 'react';
import { 
  ShieldCheck, Share2, ChevronDown, Star, FolderOpen, 
  CloudCheck, Undo2, Redo2, SpellCheck, PaintRoller, Plus, Minus,
  Link, Image, AlignLeft, List, ListOrdered, Outdent, Indent,
  History, Lock, FilePlus, Download, ChevronRight
} from 'lucide-react';

const colorPalette = [
  '#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#cccccc', '#d9d9d9', '#efefef', '#f3f3f3', '#ffffff',
  '#980000', '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff', '#4a86e8', '#0000ff', '#9900ff', '#ff00ff',
  '#e6b8af', '#f4cccc', '#fce5cd', '#fff2cc', '#d9ead3', '#dcf3ff', '#c9daf8', '#cfe2f3', '#d9d2e9', '#ead1dc',
  '#dd7e6b', '#ea9999', '#f9cb9c', '#ffe599', '#b6d7a8', '#a2c4c9', '#a4c2f4', '#9fc5e8', '#b4a7d6', '#d5a6bd',
];

let savedSelection = null;

export const Header = ({ title, onTitleChange, savingStatus, onNewDocument, onUndo, onRedo, canUndo, canRedo, zoom, onZoomChange, fontFamily, onFontChange, fontSize, onFontSizeChange, format = {},  onFormat, onColorChange }) => {
    const [showFileMenu, setShowFileMenu] = useState(false);
    const [showDownloadSub, setShowDownloadSub] = useState(false);
    const [showZoomMenu, setShowZoomMenu] = useState(false);
    const zoomOptions = [50, 75, 90, 100, 125, 150, 200];
    const [showFontMenu, setShowFontMenu] = useState(false);
    const fonts = ["Arial", "Roboto", "Times New Roman", "Courier New", "Georgia", "Verdana"];
    const [showSizeMenu, setShowSizeMenu] = useState(false);
    const sizeOptions = [8, 9, 10, 11, 12, 14, 18, 24, 30, 36, 48, 60, 72, 96];
    const [showColorMenu, setShowColorMenu] = useState(false);
    const [linkUrl, setLinkUrl] = useState("");
    const [linkText, setLinkText] = useState("");
    const [showLinkModal, setShowLinkModal] = useState(false);
    const [showImageMenu, setShowImageMenu] = useState(false);
    const fileInputRef = React.useRef(null);

    // Hàm xử lý khi nhấn "Mới"
    const handleNewDoc = () => {
        onNewDocument(); 
        setShowFileMenu(false);
    };
    const saveSelection = () => {
        const sel = window.getSelection();
        if (sel.getRangeAt && sel.rangeCount) {
          savedSelection = sel.getRangeAt(0);
        }
    };

    const restoreSelection = () => {
        if (savedSelection) {
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(savedSelection);
        }
    };

    // Hàm xử lý cỡ chữ tăng / giảm
    const handleIncrease = (e) => {
        e.preventDefault();
        saveSelection(); 
        const newSize = parseInt(fontSize) + 1;
        handleSizeSelect(e, newSize);
    };

    const handleDecrease = (e) => {
        e.preventDefault();
        saveSelection();
        const newSize = Math.max(1, parseInt(fontSize) - 1);
        handleSizeSelect(e, newSize);
    };

    // hàm chọn màu
    const handleColorSelect = (e, color) => {
        e.preventDefault();
        e.stopPropagation();
        restoreSelection();

        // Thực hiện lệnh đổi màu
        document.execCommand('styleWithCSS', false, true);
        document.execCommand('foreColor', false, color);
        
        onColorChange(color); 
        setShowColorMenu(false);
    };

    // Xử lý chọn size chữ
    const handleSizeSelect = (e, size) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        restoreSelection();

        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return;

        // Lấy block chứa vùng chọn để gửi sự kiện input sau này
        const anchorNode = selection.anchorNode;
        const targetBlock = anchorNode.nodeType === 1 
            ? anchorNode.closest('.block-contenteditable') 
            : anchorNode.parentElement?.closest('.block-contenteditable');

        // KIỂM TRA BÔI ĐEN
        if (selection.toString().length > 0) {
            document.execCommand('styleWithCSS', false, true);
            document.execCommand('fontSize', false, '7');

            if (targetBlock) {
                const marks = targetBlock.querySelectorAll('font[size="7"], span[style*="xxx-large"]');
                marks.forEach(el => {
                    el.removeAttribute('size');
                    el.style.fontSize = `${size}px`;
                    el.style.display = 'inline-block'; 
                    el.style.lineHeight = '1';
                });
            }
        } 
        // TRƯỜNG HỢP KHÔNG BÔI ĐEN (Chỉ focus)
        else if (targetBlock) {
            targetBlock.style.fontSize = `${size}px`;
            targetBlock.querySelectorAll('span').forEach(s => s.style.fontSize = 'inherit');
        }

        if (targetBlock) {
            targetBlock.dispatchEvent(new Event('input', { bubbles: true }));
        }

        onFontSizeChange(size);
        setShowSizeMenu(false);
    };

    // Xử lý chọn font chữ
    const handleFontSelect = (e, font) => {
      if (e) {
          e.preventDefault(); // Cực kỳ quan trọng để giữ bôi đen
          e.stopPropagation();
      }
      
      restoreSelection(); // Đưa vùng bôi đen trở lại editor

      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;

      const isTextSelected = selection.toString().length > 0;

      if (isTextSelected) {
          // Áp dụng font cho vùng bôi đen
          document.execCommand('styleWithCSS', false, true);
          document.execCommand('fontName', false, font);
      } else {
          // Nếu không bôi đen, áp dụng cho block cha 
          const node = selection.anchorNode;
          const targetBlock = node.nodeType === 1 ? node.closest('.block-contenteditable') : node.parentElement?.closest('.block-contenteditable');
          if (targetBlock) {
              targetBlock.style.fontFamily = font;
          }
      }
        // Luôn phát sự kiện input để lưu dữ liệu
        const activeBlock = selection.anchorNode.parentElement?.closest('.block-contenteditable');
        if (activeBlock) {
            activeBlock.dispatchEvent(new Event('input', { bubbles: true }));
        }

        onFontChange(font);
        setShowFontMenu(false);
    };

    // hàm xử lý chèn link
    const handleApplyLink = (e) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        
        restoreSelection();
        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        let range = selection.getRangeAt(0);
        const textToDisplay = linkText || linkUrl;

        if (!linkUrl) {
            setShowLinkModal(false);
            return;
        }

        const link = document.createElement('a');
        link.href = linkUrl.startsWith('http') ? linkUrl : `https://${linkUrl}`;
        link.textContent = textToDisplay;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.style.color = "#1a73e8";
        link.style.textDecoration = "underline";
        link.style.cursor = "pointer";
        link.className = "editor-link";

        range.deleteContents();
        range.insertNode(link);

        // Đưa con trỏ ra sau link
        const newRange = document.createRange();
        newRange.setStartAfter(link);
        newRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(newRange);

        const targetBlock = link.closest('.block-contenteditable');
        if (targetBlock) {
            targetBlock.dispatchEvent(new Event('input', { bubbles: true }));
        }

        setLinkUrl("");
        setLinkText("");
        setShowLinkModal(false);
    };

    // hàm upload file ảnh
    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const imageUrl = event.target.result;
                insertImage(imageUrl); 
            };
            reader.readAsDataURL(file);
        }
        setShowImageMenu(false);
    };

    // hảm xử lý chèn ảnh
    const insertImage = (url) => {
        restoreSelection();
        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        const range = selection.getRangeAt(0);
        range.deleteContents();
        
        const img = document.createElement('img');
        img.src = url;
        img.style.maxWidth = '100%';
        img.style.height = 'auto';
        img.style.display = 'inline-block'; // Chuyển thành inline-block để không làm vỡ cấu trúc dòng
        img.style.verticalAlign = 'middle';
        img.style.margin = '5px 0';
        img.className = 'editor-image';

        range.insertNode(img);

        //nst space = document.createTextNode('\u00A0'); 
       //mg.after(space);

        const newRange = document.createRange();
        newRange.setStartAfter(img);
      //newRange.setStartAfter(space);
        newRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(newRange);

        const targetBlock = img.closest('.block-contenteditable');
        if (targetBlock) {
          targetBlock.dispatchEvent(new Event('input', { bubbles: true }));
        }
    };

  return (
    <header className="editor-header">
      {/* Hàng 1: Menu & Actions */}
      <div className="top-row">
        <div className="header-left">
          <div className="docs-logo">
            <ShieldCheck size={32} color="#4285F4" fill="#4285F4" fillOpacity={0.1} />
          </div>
          <div className="title-wrapper">
            <div className="title-row">
                <div className="title-input-wrapper" data-value={title}>
                    <input 
                        type="text" 
                        className="doc-title"
                        value={title} 
                        onChange={(e) => onTitleChange(e.target.value)}
                        onBlur={() => {
                            if (title.trim() === "") onTitleChange("Tài liệu không có tiêu đề");
                        }}
                        spellCheck="false"
                    />
                </div>

                <div className="title-actions">
                    <Star size={26} className="title-icon" />
                    <FolderOpen size={26} className="title-icon" />
                    
                    {savingStatus === 'saving' ? (
                    <span style={{ fontSize: '13px', color: '#5f6368', marginLeft: '8px', whiteSpace: 'nowrap' }}>
                        Đang lưu...
                    </span>
                    ) : (
                    <CloudCheck size={26} className="title-icon" />
                    )}
                </div>
            </div>
            <nav className="menu-bar">
                <div className="menu-item-container" style={{ position: 'relative' }}>
                    <span onClick={() => setShowFileMenu(!showFileMenu)}>Tệp</span>

                    {showFileMenu && (
                        <div className="dropdown-menu main-menu">
                            <div className="menu-item" onClick={handleNewDoc}>
                                <div className="menu-item-left">
                                    <FilePlus size={16} /> <span>Mới</span>
                                </div>
                            </div>
                            <div 
                                className="menu-item has-submenu"
                                onMouseEnter={() => setShowDownloadSub(true)}
                                onMouseLeave={() => setShowDownloadSub(false)}
                            >
                                <div className="menu-item-left">
                                    <Download size={16} /> <span>Tải xuống</span>
                                </div>
                                <ChevronRight size={14} />

                                {showDownloadSub && (
                                    <div className="submenu">
                                    <div className="menu-item">
                                        <span>Microsoft Word (.docx)</span>
                                    </div>
                                    <div className="menu-item">
                                        <span>Tài liệu PDF (.pdf)</span>
                                    </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
                <span>Chèn</span><span>Định dạng</span>
            </nav>
          </div>
        </div>
        <div className="header-right">
          <History size={32} className="right-icon" />
          <button className="share-btn">
            <Lock size={16} /> <Share2 size={16} /> Chia sẻ <ChevronDown size={14} />
          </button>
          <div className="avatar">T</div>
        </div>
      </div>

      {/* Hàng 2: Toolbar */}
      <div className="toolbar-container">
        <div className="toolbar-pill">
          <div className="tb-group">
            <Undo2 
              size={28}
              className={`tb-icon ${!canUndo ? 'disabled' : ''}`} 
              onClick={onUndo} 
              style={{ opacity: canUndo ? 1 : 0.3, cursor: canUndo ? 'pointer' : 'not-allowed' }}
            />
            <Redo2 
              size={28} 
              className={`tb-icon ${!canRedo ? 'disabled' : ''}`} 
              onClick={onRedo}
              style={{ opacity: canRedo ? 1 : 0.3, cursor: canRedo ? 'pointer' : 'not-allowed' }}
            />
            <SpellCheck size={28} className="tb-icon" />
            <PaintRoller size={28} className="tb-icon" />
          </div>
          
          <div className="tb-divider" />
          
          <div className="tb-group" style={{ position: 'relative' }}>
            <div 
              className="tb-text" 
              onClick={() => setShowZoomMenu(!showZoomMenu)}
            >
              {zoom}% <ChevronDown size={12} />
            </div>

            {showZoomMenu && (
              <div className="zoom-popup">
                {zoomOptions.map(option => (
                  <div 
                    key={option} 
                    className={`zoom-option ${zoom === option ? 'selected' : ''}`}
                    onClick={() => {
                      onZoomChange(option);
                      setShowZoomMenu(false);
                    }}
                  >
                    {option}%
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="tb-divider" />

          <div className="tb-group" style={{ position: 'relative' }}>
            <div
                className="font-selector" 
                onMouseDown={(e) => {
                    e.preventDefault(); 
                    saveSelection();    
                    setShowFontMenu(!showFontMenu);
                }}
            >
              <span className="current-font" style={{ fontFamily: fontFamily }}>
                {fontFamily}
              </span>
              <ChevronDown size={12} />
            </div>

            {showFontMenu && (
              <div className="dropdown-menu font-menu">
                {fonts.map(font => (
                  <div 
                    key={font} 
                    className="menu-item"
                    style={{ fontFamily: font }}
                    onMouseDown={(e) => {
                        handleFontSelect(e, font);
                    }}
                  >
                    {font}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="tb-divider" />

          <div className="tb-group font-size-control">
            <div className="size-btn" onMouseDown={handleDecrease} title="Giảm cỡ chữ (Ctrl+Shift+,)">
              <Minus size={14} />
            </div>
            
            <div className="size-input-wrapper" style={{ position: 'relative' }}>
              <input 
                type="text" 
                className="size-input" 
                value={fontSize} 
                readOnly 
                onMouseDown={(e) => {
                    e.preventDefault();
                    saveSelection();
                    setShowSizeMenu(!showSizeMenu);
                }}
              />
              
              {showSizeMenu && (
                <div className="dropdown-menu size-menu">
                  {sizeOptions.map(size => (
                    <div 
                      key={size} 
                      className="menu-item"
                      onMouseDown={(e) => {
                          e.preventDefault(); 
                          handleSizeSelect(e, size);
                      }}
                    >
                      {size}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="size-btn" onMouseDown={handleIncrease} title="Tăng cỡ chữ (Ctrl+Shift+.)">
              <Plus size={14} />
            </div>
          </div>

          <div className="tb-divider" />

          <div className="tb-group">
            {/* Nút Màu chữ (A) */}
            <div className="color-picker-container" style={{ position: 'relative' }}>
                <div 
                    className={`tb-icon-wrapper ${showColorMenu ? 'active' : ''}`}
                    onMouseDown={(e) => {
                        e.preventDefault(); 
                        saveSelection();   
                        setShowColorMenu(!showColorMenu);
                    }}
                >
                    <div className="color-icon-container">
                        <span style={{ fontSize: '15px', fontWeight: 'bold' }}>A</span>
                        <div className="color-bar-indicator" style={{ backgroundColor: format?.color || '#000' }} />
                    </div>
                </div>

                {showColorMenu && (
                <div className="color-dropdown-popup">
                    <div className="color-grid">
                        {colorPalette.map((color) => (
                            <div 
                                key={color}
                                className="color-cell-wrapper"
                                onMouseDown={(e) => {
                                    e.preventDefault(); 
                                    handleColorSelect(e, color);
                                }}
                            >
                                <div 
                                    className="color-circle" 
                                    style={{ backgroundColor: color }}
                                    title={color}
                                >
                                    {format?.color === color && <div className="color-check-mark" />}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                )}
            </div>

            <div className="tb-divider" />

            {/* Nhóm B, I, U, S */}
            <div 
                className={`tb-icon-wrapper ${format.bold ? 'active' : ''}`} 
                onMouseDown={(e) => {
                    e.preventDefault();
                    document.execCommand('bold', false, null);
                    onFormat('bold');
                }}
            >
              <span style={{ fontWeight: 'bold' }}>B</span>
            </div>
            <div 
                className={`tb-icon-wrapper ${format.italic ? 'active' : ''}`} 
                onMouseDown={(e) => {
                    e.preventDefault();
                    document.execCommand('italic', false, null);
                    onFormat('italic');
                }}
            >
              <span style={{ fontStyle: 'italic', fontFamily: 'serif' }}>I</span>
            </div>
            <div 
                className={`tb-icon-wrapper ${format.underline ? 'active' : ''}`} 
                onMouseDown={(e) => {
                    e.preventDefault();
                    document.execCommand('underline', false, null);
                    onFormat('underline');
                }}
            >
              <span style={{ textDecoration: 'underline' }}>U</span>
            </div>
            <div 
                className={`tb-icon-wrapper ${format.strikethrough ? 'active' : ''}`} 
                onMouseDown={(e) => {
                    e.preventDefault();
                    document.execCommand('strikethrough', false, null);
                    onFormat('strikethrough');
                }}
            >
              <span style={{ textDecoration: 'line-through' }}>S</span>
            </div>
          </div>

          <div className="tb-divider" />

          <div
            className={`tb-icon-wrapper ${showLinkModal ? 'active' : ''}`}
            onMouseDown={(e) => {
              e.preventDefault();
              saveSelection();

              const selectedText = window.getSelection().toString();
              if (selectedText) setLinkText(selectedText);
              setShowLinkModal(!showLinkModal);
            }}
          >
            <Link size={28} className="tb-icon" />

            {showLinkModal && (
              <div className="link-props-modal" onMouseDown={(e) => e.stopPropagation()}>
                <div className="link-inputs-container">
                  {/* Ô nhập Văn bản hiển thị */}
                  <div className="link-input-group">
                    <AlignLeft size={16} className="input-icon" />
                    <input
                      type="text"
                      placeholder="Văn bản"
                      value={linkText}
                      onChange={(e) => setLinkText(e.target.value)}
                    />
                  </div>

                  {/* Ô nhập Link/Đường dẫn */}
                  <div className="link-input-group">
                    <Link size={16} className="input-icon" />
                    <input
                      type="text"
                      placeholder="Tìm hoặc dán một đường dẫn"
                      value={linkUrl}
                      onChange={(e) => setLinkUrl(e.target.value)}
                      autoFocus
                    />
                  </div>
                </div>
                
                <button className="link-apply-btn" onMouseDown={handleApplyLink}>
                  Áp dụng
                </button>
              </div>
            )}
          </div>

          <div className="tb-group" style={{ position: 'relative' }}>
            <div 
                className={`tb-icon-wrapper ${showImageMenu ? 'active' : ''}`}
                onMouseDown={(e) => {
                    e.preventDefault();
                    saveSelection();
                    setShowImageMenu(!showImageMenu);
                }}
            >
                <Image size={28} className="tb-icon" />
            </div>

            {showImageMenu && (
                <div className="dropdown-menu image-menu" style={{ width: '200px' }}>
                    <div 
                      className="menu-item" 
                      onMouseDown={(e) => {
                        e.preventDefault(); 
                        fileInputRef.current.click();
                      }} 
                     >
                        <div className="menu-item-left">
                            <Download size={16} style={{ transform: 'rotate(180deg)' }} />
                            <span>Tải lên từ máy tính</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Input ẩn để chọn file */}
            <input 
                type="file" 
                ref={fileInputRef} 
                style={{ display: 'none' }} 
                accept="image/*"
                onChange={handleFileUpload}
            />
          </div>

          <div className="tb-divider" />

          <div className="tb-group">
            <AlignLeft size={28} className="tb-icon" />
            <List size={28} className="tb-icon" />
            <ListOrdered size={28} className="tb-icon" />
            <Outdent size={28} className="tb-icon" />
            <Indent size={28} className="tb-icon" />
          </div>
        </div>
      </div>

      {showFileMenu && <div className="menu-overlay" onClick={() => setShowFileMenu(false)} />}
      {showZoomMenu && <div className="menu-overlay" onClick={() => setShowZoomMenu(false)} />}
      {showFontMenu && <div className="menu-overlay" onClick={() => setShowFontMenu(false)} />}
      {showSizeMenu && <div className="menu-overlay" onClick={() => setShowSizeMenu(false)} />}
      {showColorMenu && <div className="menu-overlay" onClick={() => setShowColorMenu(false)} />}
    </header>
  );
};